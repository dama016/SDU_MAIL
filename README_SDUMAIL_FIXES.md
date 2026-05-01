# SDUMAIL — integration notes

## What was changed
- Backend is now the source of truth for users, inbox, sent emails, chat messages and deadlines.
- Added database-validated login with university email plus student ID or employee ID.
- Replaced the old demo dashboards with profile-first Dashboard, Inbox, and Chat sections.
- Added unified user search: `GET /users/search?q=...`.
- Added DB-backed chat with text, sticker, and stored voice-message data.
- Added backend-backed profile photo storage for students and professors.
- Added Groq endpoint: `POST /ai/assist`.
- Added n8n-ready endpoints for category updates, deadline creation and generic automation event storage.

## Environment
Create `.env` from `.env.example`:

```env
DATABASE_URL=mysql+pymysql://USER:PASSWORD@HOST:PORT/DB_NAME
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.1-8b-instant
CORS_ORIGINS=*
```

If `DATABASE_URL` is not set, backend falls back to local SQLite: `sqlite:///./sdu_mail.db`.

## Run backend
```bash
pip install -r requirements.txt
./.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Run frontend
Open files from `edumail/` with a static server. Example:

```bash
cd edumail
python -m http.server 5500
```

Open `http://localhost:5500/auth.html`.

The frontend expects the API at `http://localhost:8000`. To override:

```js
localStorage.setItem('API_BASE', 'https://your-api-domain.com')
```

## Required localStorage after login
The frontend stores one session object after successful backend login:
- `sdumailSession.role`: `student` or `professor`
- `sdumailSession.user_id`: real `sdu_id` or `employee_id`
- `sdumailSession.email`: university email returned by the API
- `sdumailSession.full_name`: current user's full name
- `sdumailSession.profile_photo`: optional photo saved in the database

## n8n integration hooks
Use these endpoints from n8n workflows:

### Categorize emails
```http
PATCH /automation/n8n/emails/{email_id}/category?category=Attendance
```
Student categories: `CSS 115`, `MAT 151`, `INF 114`, `Other`.
Professor categories: `Attendance`, `Bonus Point`, `Medical Certificate`, `Exams`, `Other`.

### Create deadline reminders
```http
POST /deadlines
Content-Type: application/json

{
  "student_id": "220145",
  "course": "INF 108",
  "title": "Lab Practice #4",
  "due_at": "2026-05-03T23:59:00",
  "source": "n8n",
  "payload": {"workflow": "deadline_tracker"}
}
```

### Store generic automation events
```http
POST /automation/n8n/events
Content-Type: application/json

{
  "event_type": "email_categorized",
  "source": "n8n",
  "payload": {"email_id": 1, "category": "Other"}
}
```

## Database migration note
`Base.metadata.create_all()` creates missing tables for new environments. The backend also applies lightweight runtime schema fixes for the new profile photo columns and voice-message storage, but `migration_sdu_mail_v2.sql` remains the safest option for existing MySQL tables on Railway.
