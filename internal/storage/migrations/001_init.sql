-- The first version of the database. Applied once by migrate() in
-- postgres.go; later changes go into new numbered files (002_..., 003_...),
-- never into this one.
--
-- user_id is TEXT, not a reference to users: the guest ("local") has data
-- but no row in users. An account's id is "u" followed by users.id.

CREATE TABLE users (
    id            BIGSERIAL   PRIMARY KEY,
    name          TEXT        NOT NULL UNIQUE,  -- normalized: lower case a-z 0-9 _ -
    password_hash TEXT        NOT NULL,         -- auth.HashPassword, never the password
    created_at    TIMESTAMPTZ NOT NULL
);

-- One row per logged-in browser. Only the hash of the cookie's token.
CREATE TABLE logins (
    token_hash TEXT        PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    expires    TIMESTAMPTZ NOT NULL
);

-- Per user and language: how many letters are open, and the typing test.
CREATE TABLE progress (
    user_id     TEXT    NOT NULL,
    lang        TEXT    NOT NULL,
    unlocked    INTEGER NOT NULL DEFAULT 0,
    test_passed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, lang)
);

-- The letter model (engine.KeyStat) per user, language and letter.
CREATE TABLE key_stats (
    user_id     TEXT             NOT NULL,
    lang        TEXT             NOT NULL,
    ch          TEXT             NOT NULL,
    count       INTEGER          NOT NULL,
    mistakes    INTEGER          NOT NULL,
    err_ema     DOUBLE PRECISION NOT NULL,
    time_ema    DOUBLE PRECISION NOT NULL,
    timed_count INTEGER          NOT NULL,
    PRIMARY KEY (user_id, lang, ch)
);

-- The history: one row per finished round, learning and free practice.
-- keys is the raw record of the round (engine.Sample list) as JSON.
CREATE TABLE sessions (
    id          BIGSERIAL        PRIMARY KEY,   -- also the order rounds were stored in
    user_id     TEXT             NOT NULL,
    lang        TEXT             NOT NULL,
    mode        TEXT             NOT NULL CHECK (mode IN ('learning', 'freeplay')),
    wpm         DOUBLE PRECISION NOT NULL,
    accuracy    DOUBLE PRECISION NOT NULL,
    chars       INTEGER          NOT NULL,
    consistency DOUBLE PRECISION,               -- NULL = not measured
    unlocked    INTEGER          NOT NULL DEFAULT 0,
    keys        JSONB,                          -- NULL = history from before raw keys
    finished_at TIMESTAMPTZ      NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id, lang, mode, id);
