-- Destr VPN — Turso / SQLite schema

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT UNIQUE,
  tg_id         INTEGER UNIQUE,
  name          TEXT,
  password_hash TEXT,
  pin_hash      TEXT,
  face_id       INTEGER NOT NULL DEFAULT 0,
  theme         TEXT NOT NULL DEFAULT 'system',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users(tg_id);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- phone OTP tracking
-- channel: gateway | bot
CREATE TABLE IF NOT EXISTS auth_codes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'gateway',
  code_hash     TEXT,
  gateway_request_id TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes(phone);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  xui_email     TEXT NOT NULL UNIQUE,
  sub_token     TEXT NOT NULL UNIQUE,
  total_gb      INTEGER NOT NULL DEFAULT 0,
  expiry_days   INTEGER NOT NULL DEFAULT 0,
  expiry_at     TEXT,
  device_limit  INTEGER NOT NULL DEFAULT 3,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_token ON subscriptions(sub_token);

CREATE TABLE IF NOT EXISTS devices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_sub ON devices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
