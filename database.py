# ============================================================
# database.py — SQLAlchemy database configuration
# ============================================================

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Use DATABASE_URL in production. Local fallback is SQLite so the project runs
# without requiring a local MySQL server during development/tests.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sdu_mail.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
        connect_args=connect_args,
    )
except ModuleNotFoundError as exc:
    if exc.name == "pymysql":
        raise RuntimeError(
            "PyMySQL is missing for the Python interpreter that started SDUMAIL. "
            "Run the app with the project virtual environment: "
            "'./.venv/bin/python -m uvicorn main:app --reload' "
            "or install dependencies with 'pip install -r requirements.txt'."
        ) from exc
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
