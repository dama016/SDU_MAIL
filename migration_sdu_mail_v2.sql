-- SDU Mail v2 migration helpers for existing MySQL databases.
-- Run only the ALTER statements that your database still needs.

ALTER TABLE students MODIFY personal_email VARCHAR(255) NULL;
ALTER TABLE students MODIFY phone_number VARCHAR(255) NULL;
ALTER TABLE students ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE students ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE students ADD COLUMN profile_photo LONGTEXT NULL;

ALTER TABLE professors ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE professors ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE professors ADD COLUMN profile_photo LONGTEXT NULL;

ALTER TABLE messages MODIFY content TEXT NULL;
ALTER TABLE messages ADD COLUMN message_type ENUM('text','voice','sticker') NOT NULL DEFAULT 'text';
ALTER TABLE messages MODIFY media_url LONGTEXT NULL;
ALTER TABLE messages ADD COLUMN sticker VARCHAR(100) NULL;

CREATE TABLE IF NOT EXISTS deadlines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) NOT NULL,
  course VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  due_at DATETIME NOT NULL,
  source VARCHAR(100) DEFAULT 'manual',
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSON NULL,
  INDEX ix_deadlines_student_id (student_id),
  INDEX ix_deadlines_course (course),
  INDEX ix_deadlines_due_at (due_at)
);

CREATE TABLE IF NOT EXISTS automation_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(100) NOT NULL DEFAULT 'n8n',
  payload JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_automation_events_event_type (event_type),
  INDEX ix_automation_events_created_at (created_at)
);
