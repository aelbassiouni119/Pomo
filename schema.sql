CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    estimated       INTEGER DEFAULT 1,
    completed       INTEGER DEFAULT 0,
    done            INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    done_at         TEXT,
    -- Task recurrence: 'none' (one-time), 'daily', or 'weekly'
    recurrence      TEXT DEFAULT 'none',
    -- Last date this recurring task was reset (only populated for recurring tasks)
    last_reset_date TEXT,
    -- Task type: 'work' (default) or other categories for future use
    task_type       TEXT NOT NULL DEFAULT 'work'
);

CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER,
    type        TEXT NOT NULL CHECK(type IN ('work','short_break','long_break')),
    mode        TEXT DEFAULT 'focus' CHECK(mode IN ('focus','fun')),
    duration    INTEGER NOT NULL,
    planned     INTEGER NOT NULL,
    completed   INTEGER DEFAULT 1,
    started_at  TEXT NOT NULL,
    ended_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
    id                    INTEGER PRIMARY KEY CHECK(id = 1),
    work_duration         INTEGER DEFAULT 1500,
    short_break           INTEGER DEFAULT 300,
    long_break            INTEGER DEFAULT 900,
    long_break_interval   INTEGER DEFAULT 4,
    auto_start_breaks     INTEGER DEFAULT 0,
    auto_start_work       INTEGER DEFAULT 0,
    sound_enabled         INTEGER DEFAULT 1,
    notification_enabled  INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_sessions_task_id  ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done        ON tasks(done);
