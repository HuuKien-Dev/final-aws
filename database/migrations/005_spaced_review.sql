-- Spaced review: a mastered phrase becomes due again after a growing interval.
ALTER TABLE flashcards ADD COLUMN reviews integer NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN due_at timestamptz;
-- Phrases mastered before this release start with the first (1-day) interval.
UPDATE flashcards SET due_at = updated_at + interval '1 day' WHERE mastered;
CREATE INDEX flashcards_user_due ON flashcards(user_id, due_at) WHERE mastered;
