-- Preserve old quiz snapshots, answers, scores and account ownership.
ALTER TABLE quizzes ADD COLUMN topic_id text REFERENCES topics(id);

-- Old quizzes with all questions in one topic can be safely classified.
-- Mixed quizzes remain NULL, representing an all-topics practice session.
UPDATE quizzes q
SET topic_id = (
    SELECT min(p.topic_id)
    FROM jsonb_array_elements(q.questions) AS item(question)
    JOIN phrases p ON p.id = item.question->>'phrase_id'
    HAVING count(DISTINCT p.topic_id) = 1
       AND count(*) = jsonb_array_length(q.questions)
);

CREATE INDEX quizzes_active_user_topic
    ON quizzes(user_id, topic_id, created_at DESC)
    WHERE submitted_at IS NULL;
