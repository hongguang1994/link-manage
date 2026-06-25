"""
Migration: replace roles.allowed_modem_ids (JSON) with role_modem_scope table.

Run once:
    cd backend && python migrate_role_scope.py
"""
import json, sqlite3, sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "sim_manager.db"

def main():
    if not DB_PATH.exists():
        print(f"Database not found: {DB_PATH}"); sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Create role_modem_scope if missing
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='role_modem_scope'")
    if not cur.fetchone():
        print("Creating role_modem_scope table...")
        cur.execute("""
            CREATE TABLE role_modem_scope (
                role_id  INTEGER NOT NULL,
                modem_id INTEGER NOT NULL,
                PRIMARY KEY (role_id, modem_id),
                FOREIGN KEY (role_id)  REFERENCES roles (id)  ON DELETE CASCADE,
                FOREIGN KEY (modem_id) REFERENCES modems (id) ON DELETE CASCADE
            )
        """)

    # Migrate JSON data
    cur.execute("PRAGMA table_info(roles)")
    cols = {row[1] for row in cur.fetchall()}
    if "allowed_modem_ids" in cols:
        print("Migrating allowed_modem_ids JSON → role_modem_scope rows...")
        cur.execute("SELECT id, allowed_modem_ids FROM roles WHERE allowed_modem_ids IS NOT NULL")
        rows = cur.fetchall()
        count = 0
        for role_id, ids_json in rows:
            try:
                ids = json.loads(ids_json)
                for modem_id in (ids or []):
                    cur.execute(
                        "INSERT OR IGNORE INTO role_modem_scope (role_id, modem_id) VALUES (?, ?)",
                        (role_id, modem_id)
                    )
                    count += 1
            except Exception as e:
                print(f"  Skipping role {role_id}: {e}")
        print(f"  Inserted {count} scope rows.")

        # Drop the JSON column by recreating the table
        print("Removing allowed_modem_ids column from roles...")
        cur.execute("""
            CREATE TABLE roles_new (
                id                    INTEGER     NOT NULL,
                name                  VARCHAR(64) NOT NULL,
                description           TEXT,
                is_system             BOOLEAN,
                can_view_sim          BOOLEAN,
                can_approve_requests  BOOLEAN,
                can_view_history      BOOLEAN,
                read_only             BOOLEAN,
                can_support           BOOLEAN,
                created_at            DATETIME,
                updated_at            DATETIME,
                PRIMARY KEY (id),
                UNIQUE (name)
            )
        """)
        cur.execute("""
            INSERT INTO roles_new
            SELECT id, name, description, is_system, can_view_sim,
                   can_approve_requests, can_view_history, read_only, can_support,
                   created_at, updated_at
            FROM roles
        """)
        cur.execute("DROP TABLE roles")
        cur.execute("ALTER TABLE roles_new RENAME TO roles")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_roles_id ON roles (id)")
        print("  Done.")
    else:
        print("allowed_modem_ids column not found — already migrated or fresh DB.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    main()
