"""
One-time migration script for schema changes:
- modems: unique key moves from device_path to mm_object_path
- sms_messages: add mm_sms_index column for inbound dedup

Run once: python migrate.py
"""
import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "./sim_manager.db")

if not os.path.exists(DB_PATH):
    print(f"Database {DB_PATH} not found — nothing to migrate.")
    exit(0)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Check if mm_sms_index already exists
cur.execute("PRAGMA table_info(sms_messages)")
cols = {row[1] for row in cur.fetchall()}
if "mm_sms_index" not in cols:
    cur.execute("ALTER TABLE sms_messages ADD COLUMN mm_sms_index TEXT")
    print("Added sms_messages.mm_sms_index")
else:
    print("sms_messages.mm_sms_index already exists, skipping")

# SQLite doesn't support DROP CONSTRAINT; rebuild modems table to fix unique key
cur.execute("PRAGMA table_info(modems)")
modem_cols = {row[1] for row in cur.fetchall()}

cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='modems'")
row = cur.fetchone()
ddl = row[0] if row else ""

# Only rebuild if device_path is still marked UNIQUE and mm_object_path is not
if "device_path" in ddl and 'mm_object_path' not in ddl.replace("mm_object_path", ""):
    print("Rebuilding modems table to move unique constraint...")
    cur.executescript("""
        BEGIN;
        ALTER TABLE modems RENAME TO _modems_old;
        CREATE TABLE modems (
            id INTEGER PRIMARY KEY,
            device_path VARCHAR(100),
            mm_object_path VARCHAR(200) UNIQUE NOT NULL,
            imei VARCHAR(20) UNIQUE,
            manufacturer VARCHAR(100),
            model VARCHAR(100),
            phone_number VARCHAR(30),
            operator VARCHAR(100),
            signal_quality INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'unknown',
            alias VARCHAR(100),
            is_active BOOLEAN DEFAULT 1,
            last_seen DATETIME,
            created_at DATETIME
        );
        INSERT INTO modems SELECT
            id, device_path, mm_object_path, imei, manufacturer, model,
            phone_number, operator, signal_quality, status, alias,
            is_active, last_seen, created_at
        FROM _modems_old;
        DROP TABLE _modems_old;
        COMMIT;
    """)
    print("modems table rebuilt")
else:
    print("modems table already correct, skipping")

# Add new extended stats columns to modems if missing
cur.execute("PRAGMA table_info(modems)")
modem_cols2 = {row[1] for row in cur.fetchall()}
new_modem_cols = {
    "access_technologies": "TEXT",
    "registration_state": "TEXT",
    "tx_bytes": "INTEGER DEFAULT 0",
    "rx_bytes": "INTEGER DEFAULT 0",
    "connection_duration": "INTEGER DEFAULT 0",
}
for col, col_type in new_modem_cols.items():
    if col not in modem_cols2:
        cur.execute(f"ALTER TABLE modems ADD COLUMN {col} {col_type}")
        print(f"Added modems.{col}")
    else:
        print(f"modems.{col} already exists, skipping")

conn.commit()
conn.close()
print("Migration complete.")
