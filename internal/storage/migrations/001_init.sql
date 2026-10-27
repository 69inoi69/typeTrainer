-- The first version of the database.

CREATE TABLE users (
    id            BIGSERIAL   PRIMARY KEY,
    name          TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE logins (
    token_hash TEXT        PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    expires    TIMESTAMPTZ NOT NULL
);

CREATE TABLE progress (
    user_id     TEXT    NOT NULL,
    lang        TEXT    NOT NULL,
    unlocked    INTEGER NOT NULL DEFAULT 0,
    test_passed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, lang)
);

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

CREATE TABLE sessions (
    id          BIGSERIAL        PRIMARY KEY,
    user_id     TEXT             NOT NULL,
    lang        TEXT             NOT NULL,
    mode        TEXT             NOT NULL CHECK (mode IN ('learning', 'freeplay')),
    wpm         DOUBLE PRECISION NOT NULL,
    accuracy    DOUBLE PRECISION NOT NULL,
    chars       INTEGER          NOT NULL,
    consistency DOUBLE PRECISION,
    unlocked    INTEGER          NOT NULL DEFAULT 0,
    keys        JSONB,
    finished_at TIMESTAMPTZ      NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id, lang, mode, id);
