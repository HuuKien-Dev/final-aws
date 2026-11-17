-- Speeds up progress history, totals and the study-streak calendar.
CREATE INDEX IF NOT EXISTS quizzes_user_submitted
    ON quizzes(user_id, submitted_at DESC)
    WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS flashcards_user_updated ON flashcards(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS course_work_user_updated ON course_work(user_id, updated_at DESC);
