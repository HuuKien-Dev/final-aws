-- AI practice sets: the answer key stays in `questions` until the learner submits.
CREATE TABLE ai_exercises (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), focus text NOT NULL DEFAULT '',
 level text NOT NULL DEFAULT '', questions jsonb NOT NULL, answers jsonb, score integer,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz);
CREATE INDEX ai_exercises_owner ON ai_exercises(user_id, created_at DESC);
-- One shared AI explanation per course phrase; source_hash detects re-seeded text.
CREATE TABLE ai_explanations (
 phrase_id text PRIMARY KEY REFERENCES phrases(id) ON DELETE CASCADE,
 source_hash text NOT NULL, result jsonb NOT NULL, model text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now());
-- Role-play reports and study plans are listed by action.
CREATE INDEX ai_results_owner_action ON ai_results(user_id, action, created_at DESC);
