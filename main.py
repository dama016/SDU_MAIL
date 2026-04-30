from fastapi import FastAPI
from database import engine
import models

# МАГИЯ: Эта команда проверяет базу в Railway и создает таблицу users, если её там нет
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Наши фейковые письма (пока что)
fake_emails = [
    {"id": 1, "sender": "teacher@sdu.edu.kz", "subject": "CSS 115 Assignment", "category": "CSS 115", "text": "Don't forget the deadline!"},
    {"id": 2, "sender": "admin@sdu.edu.kz", "subject": "Medical Certificate", "category": "Medical certificates", "text": "Approved."},
    {"id": 3, "sender": "professor@sdu.edu.kz", "subject": "MAT 151 Midterm", "category": "MAT 151", "text": "Friday."}
]

@app.get("/")
def read_root():
    return {"message": "Привет, SDU MAIL работает!"}

@app.get("/inbox")
def get_inbox():
    return {"status": "success", "total_emails": len(fake_emails), "emails": fake_emails}