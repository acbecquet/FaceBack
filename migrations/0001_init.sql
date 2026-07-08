CREATE TABLE accounts (
  id             TEXT PRIMARY KEY,
  username       TEXT UNIQUE NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  key_ciphertext TEXT,
  key_iv         TEXT,
  is_dev         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE TABLE dev_allowlist (
  email    TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);
