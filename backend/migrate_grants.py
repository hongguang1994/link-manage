"""
Migration: split sim_access_requests into requests + sim_grants.

Run once on an existing database:
    cd backend && python migrate_grants.py
"""
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "sim_manager.db"

def main():
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if sim_grants already exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sim_grants'")
    if cur.fetchone():
        print("sim_grants table already exists, checking for pending migration...")
    else:
        print("Creating sim_grants table...")
        cur.execute("""
            CREATE TABLE sim_grants (
                id              INTEGER    NOT NULL,
                user_id         INTEGER    NOT NULL,
                modem_id        INTEGER    NOT NULL,
                granted_level   VARCHAR(4) NOT NULL DEFAULT 'use',
                expires_at      DATETIME,
                granted_by_id   INTEGER,
                request_id      INTEGER,
                created_at      DATETIME,
                updated_at      DATETIME,
                PRIMARY KEY (id),
                UNIQUE (user_id, modem_id),
                FOREIGN KEY (user_id)       REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (modem_id)      REFERENCES modems (id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by_id) REFERENCES users (id),
                FOREIGN KEY (request_id)    REFERENCES sim_access_requests (id)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS ix_sim_grants_id      ON sim_grants (id)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_sim_grants_user_id ON sim_grants (user_id)")

    # Migrate approved requests → sim_grants (skip if sim_grants already has rows)
    cur.execute("SELECT COUNT(*) FROM sim_grants")
    existing_grants = cur.fetchone()[0]

    # Check if old columns still exist
    cur.execute("PRAGMA table_info(sim_access_requests)")
    cols = {row[1] for row in cur.fetchall()}
    has_old_cols = "granted_level" in cols

    if has_old_cols and existing_grants == 0:
        print("Migrating approved records to sim_grants...")
        cur.execute("""
            INSERT OR IGNORE INTO sim_grants (user_id, modem_id, granted_level, expires_at, request_id, created_at, updated_at)
            SELECT user_id, modem_id, granted_level, expires_at, id, updated_at, updated_at
            FROM sim_access_requests
            WHERE status = 'approved' AND granted_level IS NOT NULL
        """)
        migrated = cur.rowcount
        print(f"  Migrated {migrated} grants.")

    # Drop old columns if they exist (SQLite requires recreating the table)
    if has_old_cols:
        print("Removing granted_level and expires_at from sim_access_requests...")
        cur.execute("""
            CREATE TABLE sim_access_requests_new (
                id               INTEGER    NOT NULL,
                user_id          INTEGER    NOT NULL,
                modem_id         INTEGER    NOT NULL,
                status           VARCHAR(8) NOT NULL DEFAULT 'pending',
                requested_level  VARCHAR(4) NOT NULL DEFAULT 'use',
                reason           TEXT,
                admin_note       TEXT,
                created_at       DATETIME,
                updated_at       DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (modem_id) REFERENCES modems (id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            INSERT INTO sim_access_requests_new
            SELECT id, user_id, modem_id, status, requested_level, reason, admin_note, created_at, updated_at
            FROM sim_access_requests
        """)
        cur.execute("DROP TABLE sim_access_requests")
        cur.execute("ALTER TABLE sim_access_requests_new RENAME TO sim_access_requests")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_sim_access_requests_id      ON sim_access_requests (id)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_sim_access_requests_user_id ON sim_access_requests (user_id)")
        print("  Done.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    main()
