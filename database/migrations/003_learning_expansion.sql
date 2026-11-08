CREATE TABLE vocabulary_decks (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX vocabulary_decks_owner ON vocabulary_decks(user_id);
CREATE TABLE vocabulary_cards (
 id uuid PRIMARY KEY, deck_id uuid NOT NULL REFERENCES vocabulary_decks(id) ON DELETE CASCADE,
 english text NOT NULL CHECK(length(english) BETWEEN 1 AND 300),
 vietnamese text NOT NULL CHECK(length(vietnamese) BETWEEN 1 AND 500),
 example text NOT NULL DEFAULT '' CHECK(length(example)<=1000), mastered boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX vocabulary_cards_deck ON vocabulary_cards(deck_id,created_at);
CREATE TABLE course_work (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id text NOT NULL,
 draft text NOT NULL DEFAULT '', answers jsonb NOT NULL DEFAULT '[]', completed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,lesson_id));
CREATE TABLE app_feedback (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN ('bug','feature','content','other')),
 message text NOT NULL CHECK(length(message) BETWEEN 10 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX app_feedback_owner ON app_feedback(user_id,created_at DESC);
CREATE TABLE ai_usage (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, day date NOT NULL DEFAULT CURRENT_DATE,
 calls integer NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day));
CREATE TABLE ai_results (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 action text NOT NULL, lesson_id text NOT NULL DEFAULT '', result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_results_owner ON ai_results(user_id,created_at DESC);
CREATE TABLE oauth_identities (
 provider text NOT NULL CHECK(provider IN ('google','facebook')), subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(provider,subject));
