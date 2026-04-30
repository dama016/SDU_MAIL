from sqlalchemy import Column, Integer, String, Float
from database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    sdu_id = Column(String(50), unique=True, index=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    middle_name = Column(String(50), nullable=True)
    sdu_email = Column(String(255), unique=True, index=True)
    personal_email = Column(String(255), nullable=True)
    phone_number = Column(String(20), nullable=True)
    faculty = Column(String(100))
    major = Column(String(100))
    year_of_study = Column(Integer)
    gpa = Column(Float)
    advisor = Column(String(100))
    account_status = Column(String(50), default="active")

class Professor(Base):
    __tablename__ = "professors"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), unique=True, index=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    middle_name = Column(String(50), nullable=True)
    sdu_email = Column(String(255), unique=True, index=True)
    personal_email = Column(String(255), nullable=True)
    phone_number = Column(String(20), nullable=True)
    faculty = Column(String(100))
    department = Column(String(100))
    position = Column(String(100))
    office_room = Column(String(50))
    account_status = Column(String(50), default="active")