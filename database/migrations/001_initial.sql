CREATE TABLE users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE topics (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL);
CREATE TABLE phrases (
 id text PRIMARY KEY, topic_id text NOT NULL REFERENCES topics(id),
 english text NOT NULL, vietnamese text NOT NULL,
 UNIQUE(topic_id, english));
CREATE INDEX phrases_topic ON phrases(topic_id);
CREATE TABLE favorites (
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 phrase_id text REFERENCES phrases(id), PRIMARY KEY(user_id, phrase_id));
CREATE TABLE flashcards (
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 phrase_id text REFERENCES phrases(id), mastered boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, phrase_id));
CREATE TABLE quizzes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 questions jsonb NOT NULL, answers jsonb, score integer,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz);
CREATE INDEX quizzes_user ON quizzes(user_id, created_at DESC);
