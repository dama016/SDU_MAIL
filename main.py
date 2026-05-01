from datetime import datetime
import os
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, func, inspect, or_, text
from sqlalchemy.orm import Session

from database import Base, engine, get_db
import models


Base.metadata.create_all(bind=engine)


def ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    dialect = engine.dialect.name

    def add_column_if_missing(conn, columns: set[str], column_name: str, mysql_sql: str, sqlite_sql: str) -> None:
        if column_name in columns:
            return
        conn.execute(text(mysql_sql if dialect == "mysql" else sqlite_sql))
        columns.add(column_name)

    with engine.begin() as conn:
        if inspector.has_table("students"):
            student_columns = {column["name"] for column in inspector.get_columns("students")}
            add_column_if_missing(
                conn,
                student_columns,
                "created_at",
                "ALTER TABLE students ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE students ADD COLUMN created_at DATETIME",
            )
            add_column_if_missing(
                conn,
                student_columns,
                "updated_at",
                "ALTER TABLE students ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE students ADD COLUMN updated_at DATETIME",
            )
            add_column_if_missing(
                conn,
                student_columns,
                "profile_photo",
                "ALTER TABLE students ADD COLUMN profile_photo LONGTEXT NULL",
                "ALTER TABLE students ADD COLUMN profile_photo TEXT",
            )

        if inspector.has_table("professors"):
            professor_columns = {column["name"] for column in inspector.get_columns("professors")}
            add_column_if_missing(
                conn,
                professor_columns,
                "created_at",
                "ALTER TABLE professors ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE professors ADD COLUMN created_at DATETIME",
            )
            add_column_if_missing(
                conn,
                professor_columns,
                "updated_at",
                "ALTER TABLE professors ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE professors ADD COLUMN updated_at DATETIME",
            )
            add_column_if_missing(
                conn,
                professor_columns,
                "profile_photo",
                "ALTER TABLE professors ADD COLUMN profile_photo LONGTEXT NULL",
                "ALTER TABLE professors ADD COLUMN profile_photo TEXT",
            )

        if inspector.has_table("messages"):
            message_columns = {column["name"]: column for column in inspector.get_columns("messages")}
            message_column_names = set(message_columns.keys())
            add_column_if_missing(
                conn,
                message_column_names,
                "message_type",
                "ALTER TABLE messages ADD COLUMN message_type ENUM('text','voice','sticker') NOT NULL DEFAULT 'text'",
                "ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'",
            )
            add_column_if_missing(
                conn,
                message_column_names,
                "media_url",
                "ALTER TABLE messages ADD COLUMN media_url LONGTEXT NULL",
                "ALTER TABLE messages ADD COLUMN media_url TEXT",
            )
            add_column_if_missing(
                conn,
                message_column_names,
                "sticker",
                "ALTER TABLE messages ADD COLUMN sticker VARCHAR(100) NULL",
                "ALTER TABLE messages ADD COLUMN sticker VARCHAR(100)",
            )
            if dialect == "mysql":
                media_url = message_columns.get("media_url")
                if media_url and "LONGTEXT" not in str(media_url["type"]).upper():
                    conn.execute(text("ALTER TABLE messages MODIFY COLUMN media_url LONGTEXT NULL"))


ensure_runtime_schema()


app = FastAPI(
    title="SDUMAIL API",
    description="Database-first backend for SDUMAIL user profiles, email, chat, AI tools, and automation hooks.",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StudentCreate(BaseModel):
    sdu_id: str
    first_name: str
    last_name: str
    middle_name: Optional[str] = None
    sdu_email: EmailStr
    personal_email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    faculty: str
    major: str
    year_of_study: int = Field(..., ge=1, le=6)
    gpa: Optional[float] = Field(None, ge=0.0, le=4.0)
    advisor: Optional[str] = None
    profile_photo: Optional[str] = None
    account_status: models.AccountStatus = models.AccountStatus.active


class StudentResponse(StudentCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfessorCreate(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    middle_name: Optional[str] = None
    sdu_email: EmailStr
    personal_email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    faculty: str
    department: str
    position: str
    office_room: Optional[str] = None
    profile_photo: Optional[str] = None
    account_status: models.AccountStatus = models.AccountStatus.active


class ProfessorResponse(ProfessorCreate):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserPublic(BaseModel):
    id: str
    email: str
    role: Literal["student", "professor"]
    first_name: str
    last_name: str
    full_name: str
    faculty: Optional[str] = None
    department: Optional[str] = None
    major: Optional[str] = None
    meta: Optional[str] = None
    profile_photo: Optional[str] = None


class LoginRequest(BaseModel):
    role: Literal["student", "teacher", "professor"]
    email: EmailStr
    account_id: str = Field(..., min_length=1, max_length=50)


class LoginResponse(BaseModel):
    message: str
    user_id: str
    role: Literal["student", "professor"]
    email: str
    full_name: str
    dashboard_path: str
    profile_photo: Optional[str] = None


class UserProfileResponse(BaseModel):
    user_id: str
    role: Literal["student", "professor"]
    first_name: str
    last_name: str
    middle_name: Optional[str]
    full_name: str
    sdu_email: str
    personal_email: Optional[str]
    phone_number: Optional[str]
    faculty: str
    account_status: models.AccountStatus
    profile_photo: Optional[str] = None
    details: Dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProfilePhotoUpdate(BaseModel):
    profile_photo: Optional[str] = None


class EmailCompose(BaseModel):
    sender_email: EmailStr
    receiver_email: EmailStr
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    category: Optional[str] = Field("Other", description="n8n can update this later")


class EmailResponse(BaseModel):
    id: int
    sender_email: str
    receiver_email: str
    subject: str
    body: str
    category: str
    is_read: int
    timestamp: datetime

    class Config:
        from_attributes = True


class MessageSend(BaseModel):
    sender_id: str
    receiver_id: str
    content: Optional[str] = None
    message_type: models.MessageType = models.MessageType.text
    media_url: Optional[str] = None
    sticker: Optional[str] = None


class MessageResponse(BaseModel):
    id: int
    sender_id: str
    receiver_id: str
    content: Optional[str]
    message_type: models.MessageType
    media_url: Optional[str]
    sticker: Optional[str]
    is_read: int
    timestamp: datetime

    class Config:
        from_attributes = True


class AIRequest(BaseModel):
    text: str = Field(..., min_length=1)
    task: Literal["translate", "correct", "translate_and_correct"] = "translate_and_correct"
    target_language: str = "English"


class AIResponse(BaseModel):
    result: str
    provider: str = "groq"


class DeadlineCreate(BaseModel):
    student_id: str
    course: str
    title: str
    due_at: datetime
    source: str = "manual"
    payload: Optional[Dict[str, Any]] = None


class DeadlineResponse(DeadlineCreate):
    id: int
    is_done: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AutomationEventIn(BaseModel):
    event_type: str
    payload: Dict[str, Any]
    source: str = "n8n"


class SuccessResponse(BaseModel):
    message: str
    id: Optional[int] = None


def normalize_role(role: Optional[str]) -> Literal["student", "professor"]:
    role_value = (role or "").strip().lower()
    return "professor" if role_value in {"teacher", "professor"} else "student"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def full_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name}".strip()


def _student_to_public(student: models.Student) -> UserPublic:
    return UserPublic(
        id=student.sdu_id,
        email=student.sdu_email,
        role="student",
        first_name=student.first_name,
        last_name=student.last_name,
        full_name=full_name(student.first_name, student.last_name),
        faculty=student.faculty,
        major=student.major,
        meta=f"{student.major} · Year {student.year_of_study}",
        profile_photo=student.profile_photo,
    )


def _professor_to_public(professor: models.Professor) -> UserPublic:
    return UserPublic(
        id=professor.employee_id,
        email=professor.sdu_email,
        role="professor",
        first_name=professor.first_name,
        last_name=professor.last_name,
        full_name=full_name(professor.first_name, professor.last_name),
        faculty=professor.faculty,
        department=professor.department,
        meta=f"{professor.position} · {professor.department}",
        profile_photo=professor.profile_photo,
    )


def _student_profile(student: models.Student) -> UserProfileResponse:
    return UserProfileResponse(
        user_id=student.sdu_id,
        role="student",
        first_name=student.first_name,
        last_name=student.last_name,
        middle_name=student.middle_name,
        full_name=full_name(student.first_name, student.last_name),
        sdu_email=student.sdu_email,
        personal_email=student.personal_email,
        phone_number=student.phone_number,
        faculty=student.faculty,
        account_status=student.account_status,
        profile_photo=student.profile_photo,
        details={
            "student_id": student.sdu_id,
            "major": student.major,
            "year_of_study": student.year_of_study,
            "gpa": student.gpa,
            "advisor": student.advisor,
        },
        created_at=getattr(student, "created_at", None),
        updated_at=getattr(student, "updated_at", None),
    )


def _professor_profile(professor: models.Professor) -> UserProfileResponse:
    return UserProfileResponse(
        user_id=professor.employee_id,
        role="professor",
        first_name=professor.first_name,
        last_name=professor.last_name,
        middle_name=professor.middle_name,
        full_name=full_name(professor.first_name, professor.last_name),
        sdu_email=professor.sdu_email,
        personal_email=professor.personal_email,
        phone_number=professor.phone_number,
        faculty=professor.faculty,
        account_status=professor.account_status,
        profile_photo=professor.profile_photo,
        details={
            "employee_id": professor.employee_id,
            "department": professor.department,
            "position": professor.position,
            "office_room": professor.office_room,
        },
        created_at=getattr(professor, "created_at", None),
        updated_at=getattr(professor, "updated_at", None),
    )


def get_user_by_role_and_id(db: Session, role: Literal["student", "professor"], user_id: str):
    if role == "student":
        return db.query(models.Student).filter(models.Student.sdu_id == user_id).first()
    return db.query(models.Professor).filter(models.Professor.employee_id == user_id).first()


def get_user_by_id(db: Session, user_id: str):
    return db.query(models.Student).filter(models.Student.sdu_id == user_id).first() or db.query(models.Professor).filter(models.Professor.employee_id == user_id).first()


def get_user_by_email(db: Session, email: str):
    email_value = normalize_email(email)
    return (
        db.query(models.Student).filter(func.lower(models.Student.sdu_email) == email_value).first()
        or db.query(models.Professor).filter(func.lower(models.Professor.sdu_email) == email_value).first()
    )


def get_user_by_login(db: Session, role: Literal["student", "professor"], email: str, account_id: str):
    email_value = normalize_email(email)
    account_value = account_id.strip()
    if role == "student":
        return db.query(models.Student).filter(and_(func.lower(models.Student.sdu_email) == email_value, models.Student.sdu_id == account_value)).first()
    return db.query(models.Professor).filter(and_(func.lower(models.Professor.sdu_email) == email_value, models.Professor.employee_id == account_value)).first()


def find_login_user(db: Session, role: Literal["student", "professor"], email: str, account_id: str):
    primary_user = get_user_by_login(db, role, email, account_id)
    if primary_user:
        return role, primary_user

    fallback_role: Literal["student", "professor"] = "professor" if role == "student" else "student"
    fallback_user = get_user_by_login(db, fallback_role, email, account_id)
    if fallback_user:
        return fallback_role, fallback_user

    return None, None


def build_public_user(user: Any) -> UserPublic:
    return _student_to_public(user) if isinstance(user, models.Student) else _professor_to_public(user)


def build_profile(user: Any) -> UserProfileResponse:
    return _student_profile(user) if isinstance(user, models.Student) else _professor_profile(user)


def categorize_for_receiver(_receiver: Any, category: Optional[str]) -> str:
    if category and category.strip():
        return category.strip()
    return "Other"


@app.get("/")
def root():
    return {"status": "ok", "service": "SDUMAIL API", "version": "3.0.0", "docs": "/docs"}


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}


@app.post("/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    requested_role = normalize_role(payload.role)
    resolved_role, user = find_login_user(db, requested_role, str(payload.email), payload.account_id)
    if not user:
        raise HTTPException(401, "No matching SDUMAIL account was found in the database")
    if user.account_status != models.AccountStatus.active:
        raise HTTPException(403, "This account is not active")

    return LoginResponse(
        message="Login successful",
        user_id=user.sdu_id if resolved_role == "student" else user.employee_id,
        role=resolved_role,
        email=user.sdu_email,
        full_name=full_name(user.first_name, user.last_name),
        dashboard_path="dashboard-student.html" if resolved_role == "student" else "dashboard-teacher.html",
        profile_photo=user.profile_photo,
    )


@app.get("/users/profile", response_model=UserProfileResponse, tags=["Users"])
def get_user_profile(role: Literal["student", "professor"], user_id: str, db: Session = Depends(get_db)):
    user = get_user_by_role_and_id(db, role, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return build_profile(user)


@app.patch("/users/profile-photo", response_model=UserProfileResponse, tags=["Users"])
def update_profile_photo(
    payload: ProfilePhotoUpdate,
    role: Literal["student", "professor"],
    user_id: str,
    db: Session = Depends(get_db),
):
    user = get_user_by_role_and_id(db, role, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user.profile_photo = payload.profile_photo
    db.commit()
    db.refresh(user)
    return build_profile(user)


@app.post("/students", response_model=StudentResponse, status_code=201, tags=["Students"])
def create_student(student_data: StudentCreate, db: Session = Depends(get_db)):
    student_email = normalize_email(str(student_data.sdu_email))
    if db.query(models.Student).filter(or_(models.Student.sdu_id == student_data.sdu_id, func.lower(models.Student.sdu_email) == student_email)).first():
        raise HTTPException(409, "Student with this SDU ID or email already exists")

    data = student_data.model_dump()
    data["sdu_email"] = student_email
    data["personal_email"] = normalize_email(str(student_data.personal_email)) if student_data.personal_email else None
    student = models.Student(**data)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@app.get("/students/{sdu_id}", response_model=StudentResponse, tags=["Students"])
def get_student(sdu_id: str, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.sdu_id == sdu_id).first()
    if not student:
        raise HTTPException(404, "Student not found")
    return student


@app.get("/students", response_model=List[StudentResponse], tags=["Students"])
def list_students(skip: int = 0, limit: int = Query(50, le=200), db: Session = Depends(get_db)):
    return db.query(models.Student).offset(skip).limit(limit).all()


@app.post("/professors", response_model=ProfessorResponse, status_code=201, tags=["Professors"])
def create_professor(professor_data: ProfessorCreate, db: Session = Depends(get_db)):
    professor_email = normalize_email(str(professor_data.sdu_email))
    if db.query(models.Professor).filter(or_(models.Professor.employee_id == professor_data.employee_id, func.lower(models.Professor.sdu_email) == professor_email)).first():
        raise HTTPException(409, "Professor with this employee ID or email already exists")

    data = professor_data.model_dump()
    data["sdu_email"] = professor_email
    data["personal_email"] = normalize_email(str(professor_data.personal_email)) if professor_data.personal_email else None
    professor = models.Professor(**data)
    db.add(professor)
    db.commit()
    db.refresh(professor)
    return professor


@app.get("/professors/{employee_id}", response_model=ProfessorResponse, tags=["Professors"])
def get_professor(employee_id: str, db: Session = Depends(get_db)):
    professor = db.query(models.Professor).filter(models.Professor.employee_id == employee_id).first()
    if not professor:
        raise HTTPException(404, "Professor not found")
    return professor


@app.get("/users/search", response_model=List[UserPublic], tags=["Users"])
def search_users(
    q: str = Query("", description="ID, name, surname or SDU email"),
    role: Optional[Literal["student", "professor"]] = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    pattern = f"%{q.strip()}%"
    results: List[UserPublic] = []

    if role in (None, "student"):
        students = (
            db.query(models.Student)
            .filter(
                and_(
                    models.Student.account_status == models.AccountStatus.active,
                    or_(
                        models.Student.sdu_id.like(pattern),
                        models.Student.first_name.like(pattern),
                        models.Student.last_name.like(pattern),
                        models.Student.sdu_email.like(pattern),
                    ),
                )
            )
            .limit(limit)
            .all()
        )
        results.extend(_student_to_public(student) for student in students)

    if role in (None, "professor") and len(results) < limit:
        professors = (
            db.query(models.Professor)
            .filter(
                and_(
                    models.Professor.account_status == models.AccountStatus.active,
                    or_(
                        models.Professor.employee_id.like(pattern),
                        models.Professor.first_name.like(pattern),
                        models.Professor.last_name.like(pattern),
                        models.Professor.sdu_email.like(pattern),
                    ),
                )
            )
            .limit(limit - len(results))
            .all()
        )
        results.extend(_professor_to_public(professor) for professor in professors)

    return results[:limit]


@app.get("/professors/search/students", response_model=List[UserPublic], tags=["Users"])
def search_students(q: str, limit: int = 20, db: Session = Depends(get_db)):
    return search_users(q=q, role="student", limit=limit, db=db)


@app.post("/emails/compose", response_model=SuccessResponse, status_code=201, tags=["Email"])
def compose_email(email_data: EmailCompose, db: Session = Depends(get_db)):
    sender_email = normalize_email(str(email_data.sender_email))
    receiver_email = normalize_email(str(email_data.receiver_email))

    sender = get_user_by_email(db, sender_email)
    receiver = get_user_by_email(db, receiver_email)
    if not sender:
        raise HTTPException(404, "Sender not found in database")
    if not receiver:
        raise HTTPException(404, "Receiver not found in database")

    email = models.Email(
        sender_email=sender_email,
        receiver_email=receiver_email,
        subject=email_data.subject.strip(),
        body=email_data.body.strip(),
        category=categorize_for_receiver(receiver, email_data.category),
        timestamp=datetime.utcnow(),
    )
    db.add(email)
    db.commit()
    db.refresh(email)
    return SuccessResponse(message="Email sent", id=email.id)


@app.get("/emails/inbox", response_model=List[EmailResponse], tags=["Email"])
def get_inbox(
    user_email: str,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(models.Email).filter(models.Email.receiver_email == normalize_email(user_email))
    if category and category.lower() != "all":
        query = query.filter(models.Email.category == category)
    return query.order_by(models.Email.timestamp.desc()).offset(skip).limit(limit).all()


@app.get("/emails/sent", response_model=List[EmailResponse], tags=["Email"])
def get_sent_emails(user_email: str, skip: int = 0, limit: int = Query(50, le=200), db: Session = Depends(get_db)):
    return (
        db.query(models.Email)
        .filter(models.Email.sender_email == normalize_email(user_email))
        .order_by(models.Email.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/emails/{email_id}", response_model=EmailResponse, tags=["Email"])
def get_email_by_id(email_id: int, db: Session = Depends(get_db)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(404, "Email not found")
    return email


@app.patch("/emails/{email_id}/read", response_model=SuccessResponse, tags=["Email"])
def mark_email_as_read(email_id: int, db: Session = Depends(get_db)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(404, "Email not found")
    email.is_read = 1
    db.commit()
    return SuccessResponse(message="Email marked as read", id=email_id)


@app.get("/emails/inbox/unread-count", tags=["Email"])
def get_unread_count(user_email: str, category: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Email).filter(and_(models.Email.receiver_email == normalize_email(user_email), models.Email.is_read == 0))
    if category and category.lower() != "all":
        query = query.filter(models.Email.category == category)
    return {"user_email": normalize_email(user_email), "category": category, "unread_count": query.count()}


@app.post("/messages/send", response_model=SuccessResponse, status_code=201, tags=["Chat"])
def send_message(message_data: MessageSend, db: Session = Depends(get_db)):
    if message_data.sender_id == message_data.receiver_id:
        raise HTTPException(400, "Cannot send a message to yourself")
    if not get_user_by_id(db, message_data.sender_id):
        raise HTTPException(404, "Sender not found")
    if not get_user_by_id(db, message_data.receiver_id):
        raise HTTPException(404, "Receiver not found")
    if message_data.message_type == models.MessageType.text and not (message_data.content or "").strip():
        raise HTTPException(400, "Text message requires content")
    if message_data.message_type == models.MessageType.voice and not message_data.media_url:
        raise HTTPException(400, "Voice message requires media_url")
    if message_data.message_type == models.MessageType.sticker and not message_data.sticker:
        raise HTTPException(400, "Sticker message requires sticker")

    message = models.Message(
        sender_id=message_data.sender_id.strip(),
        receiver_id=message_data.receiver_id.strip(),
        content=(message_data.content or "").strip() or None,
        message_type=message_data.message_type,
        media_url=message_data.media_url,
        sticker=message_data.sticker,
        timestamp=datetime.utcnow(),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return SuccessResponse(message="Message sent", id=message.id)


@app.get("/messages/history", response_model=List[MessageResponse], tags=["Chat"])
def get_chat_history(user1_id: str, user2_id: str, skip: int = 0, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    return (
        db.query(models.Message)
        .filter(
            or_(
                and_(models.Message.sender_id == user1_id, models.Message.receiver_id == user2_id),
                and_(models.Message.sender_id == user2_id, models.Message.receiver_id == user1_id),
            )
        )
        .order_by(models.Message.timestamp.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/messages/conversations", tags=["Chat"])
def get_conversations(user_id: str, db: Session = Depends(get_db)):
    messages = (
        db.query(models.Message)
        .filter(or_(models.Message.sender_id == user_id, models.Message.receiver_id == user_id))
        .order_by(models.Message.timestamp.desc())
        .all()
    )

    seen = set()
    conversations = []
    for message in messages:
        other_id = message.receiver_id if message.sender_id == user_id else message.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)
        other = get_user_by_id(db, other_id)
        if not other:
            continue

        preview = message.content
        if message.message_type == models.MessageType.voice:
            preview = "Voice message"
        elif message.message_type == models.MessageType.sticker:
            preview = message.sticker or "Sticker"

        conversations.append(
            {
                "user": build_public_user(other),
                "last_message": preview,
                "last_type": message.message_type,
                "timestamp": message.timestamp,
            }
        )

    return conversations


@app.patch("/messages/{message_id}/read", response_model=SuccessResponse, tags=["Chat"])
def mark_message_as_read(message_id: int, db: Session = Depends(get_db)):
    message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not message:
        raise HTTPException(404, "Message not found")
    message.is_read = 1
    db.commit()
    return SuccessResponse(message="Message marked as read", id=message_id)


@app.get("/messages/unread-count", tags=["Chat"])
def get_chat_unread_count(user_id: str, db: Session = Depends(get_db)):
    unread_messages = db.query(models.Message).filter(and_(models.Message.receiver_id == user_id, models.Message.is_read == 0)).count()
    return {"user_id": user_id, "unread_messages": unread_messages}


@app.post("/ai/assist", response_model=AIResponse, tags=["AI"])
async def groq_assist(payload: AIRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(503, "GROQ_API_KEY is not configured")

    system = "You translate and correct academic messages. Return only the final polished text."
    user_message = f"Task: {payload.task}. Target language: {payload.target_language}. Text:\n{payload.text}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.2,
            },
        )

    if response.status_code >= 400:
        raise HTTPException(response.status_code, response.text)

    data = response.json()
    return AIResponse(result=data["choices"][0]["message"]["content"].strip())


@app.get("/categories/student", tags=["Utils"])
def get_student_categories():
    return {"categories": [category.value for category in models.StudentEmailCategory]}


@app.get("/categories/professor", tags=["Utils"])
def get_professor_categories():
    return {"categories": [category.value for category in models.ProfessorEmailCategory]}


@app.post("/deadlines", response_model=DeadlineResponse, status_code=201, tags=["Deadlines"])
def create_deadline(data: DeadlineCreate, db: Session = Depends(get_db)):
    if not db.query(models.Student).filter(models.Student.sdu_id == data.student_id).first():
        raise HTTPException(404, "Student not found")

    deadline = models.Deadline(**data.model_dump())
    db.add(deadline)
    db.commit()
    db.refresh(deadline)
    return deadline


@app.get("/deadlines", response_model=List[DeadlineResponse], tags=["Deadlines"])
def list_deadlines(student_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.Deadline)
        .filter(models.Deadline.student_id == student_id)
        .order_by(models.Deadline.due_at.asc())
        .all()
    )


@app.patch("/deadlines/{deadline_id}/done", response_model=SuccessResponse, tags=["Deadlines"])
def deadline_done(deadline_id: int, db: Session = Depends(get_db)):
    deadline = db.query(models.Deadline).filter(models.Deadline.id == deadline_id).first()
    if not deadline:
        raise HTTPException(404, "Deadline not found")
    deadline.is_done = True
    db.commit()
    return SuccessResponse(message="Deadline marked as done", id=deadline_id)


@app.post("/automation/n8n/events", response_model=SuccessResponse, status_code=201, tags=["Automation"])
def receive_n8n_event(data: AutomationEventIn, db: Session = Depends(get_db)):
    event = models.AutomationEvent(event_type=data.event_type, source=data.source, payload=data.payload)
    db.add(event)
    db.commit()
    db.refresh(event)
    return SuccessResponse(message="Automation event stored", id=event.id)


@app.patch("/automation/n8n/emails/{email_id}/category", response_model=SuccessResponse, tags=["Automation"])
def set_email_category(email_id: int, category: str, db: Session = Depends(get_db)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(404, "Email not found")
    email.category = category
    db.commit()
    return SuccessResponse(message="Email category updated", id=email_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
