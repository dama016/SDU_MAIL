# ============================================================
# models.py — SQLAlchemy models for SDU Mail
# ============================================================

from datetime import datetime
import enum
from sqlalchemy import Column, Integer, String, Text, Float, Enum, DateTime, Boolean, JSON
from sqlalchemy.dialects.mysql import LONGTEXT
from database import Base


LargeText = Text().with_variant(LONGTEXT(), "mysql")


class AccountStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    blocked = "blocked"


class UserRole(str, enum.Enum):
    student = "student"
    professor = "professor"


class StudentEmailCategory(str, enum.Enum):
    CSS_115 = "CSS 115"
    MAT_151 = "MAT 151"
    INF_114 = "INF 114"
    OTHER = "Other"


class ProfessorEmailCategory(str, enum.Enum):
    ATTENDANCE = "Attendance"
    BONUS_POINT = "Bonus Point"
    MEDICAL_CERTIFICATE = "Medical Certificate"
    EXAMS = "Exams"
    OTHER = "Other"


class MessageType(str, enum.Enum):
    text = "text"
    voice = "voice"
    sticker = "sticker"


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    sdu_id = Column(String(20), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    middle_name = Column(String(100), nullable=True)
    sdu_email = Column(String(255), unique=True, nullable=False, index=True)
    personal_email = Column(String(255), unique=True, nullable=True, index=True)
    phone_number = Column(String(255), unique=True, nullable=True, index=True)
    faculty = Column(String(200), nullable=False)
    major = Column(String(200), nullable=False)
    year_of_study = Column(Integer, nullable=False)
    gpa = Column(Float, nullable=True)
    advisor = Column(String(200), nullable=True)
    profile_photo = Column(LargeText, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    account_status = Column(Enum(AccountStatus), default=AccountStatus.active, nullable=False)

    def __repr__(self):
        return f"<Student sdu_id={self.sdu_id} name={self.first_name} {self.last_name}>"


class Professor(Base):
    __tablename__ = "professors"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(20), unique=True, nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    middle_name = Column(String(100), nullable=True)
    sdu_email = Column(String(255), unique=True, nullable=False, index=True)
    personal_email = Column(String(255), unique=True, nullable=True, index=True)
    phone_number = Column(String(255), unique=True, nullable=True, index=True)
    faculty = Column(String(200), nullable=False)
    department = Column(String(200), nullable=False)
    position = Column(String(200), nullable=False)
    office_room = Column(String(50), nullable=True)
    profile_photo = Column(LargeText, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    account_status = Column(Enum(AccountStatus), default=AccountStatus.active, nullable=False)


    def __repr__(self):
        return f"<Professor employee_id={self.employee_id} name={self.first_name} {self.last_name}>"


class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    sender_email = Column(String(255), nullable=False, index=True)
    receiver_email = Column(String(255), nullable=False, index=True)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(100), nullable=False, index=True, default="Other")
    is_read = Column(Integer, default=0, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)

    def __repr__(self):
        return f"<Email id={self.id} from={self.sender_email} to={self.receiver_email}>"


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String(20), nullable=False, index=True)
    receiver_id = Column(String(20), nullable=False, index=True)
    content = Column(Text, nullable=True)
    message_type = Column(Enum(MessageType), default=MessageType.text, nullable=False)
    media_url = Column(LargeText, nullable=True)
    sticker = Column(String(100), nullable=True)
    is_read = Column(Integer, default=0, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)

    def __repr__(self):
        return f"<Message id={self.id} from={self.sender_id} to={self.receiver_id} type={self.message_type}>"


class Deadline(Base):
    __tablename__ = "deadlines"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(20), nullable=False, index=True)
    course = Column(String(100), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    due_at = Column(DateTime, nullable=False, index=True)
    source = Column(String(100), nullable=True, default="manual")
    is_done = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    payload = Column(JSON, nullable=True)


class AutomationEvent(Base):
    __tablename__ = "automation_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    source = Column(String(100), nullable=False, default="n8n")
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
