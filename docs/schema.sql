-- SimNexus 数据库初始化
-- 用法：sqlite3 sim_manager.db < docs/schema.sql
-- 初始账号：admin / admin123

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER      NOT NULL,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    role          VARCHAR(5)   NOT NULL,
    is_active     BOOLEAN,
    created_at    DATETIME,
    updated_at    DATETIME,
    PRIMARY KEY (id),
    UNIQUE (username)
);
CREATE INDEX IF NOT EXISTS ix_users_id       ON users (id);
CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

CREATE TABLE IF NOT EXISTS roles (
    id                    INTEGER     NOT NULL,
    name                  VARCHAR(64) NOT NULL,
    description           TEXT,
    is_system             BOOLEAN,
    can_view_sim          BOOLEAN,
    can_approve_requests  BOOLEAN,
    can_view_history      BOOLEAN,
    read_only             BOOLEAN,
    can_support           BOOLEAN,
    allowed_modem_ids     JSON,
    created_at            DATETIME,
    updated_at            DATETIME,
    PRIMARY KEY (id),
    UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS ix_roles_id ON roles (id);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS modems (
    id                  INTEGER      NOT NULL,
    mm_object_path      VARCHAR(200) NOT NULL,
    device_path         VARCHAR(100),
    imei                VARCHAR(20),
    manufacturer        VARCHAR(100),
    model               VARCHAR(100),
    phone_number        VARCHAR(30),
    operator            VARCHAR(100),
    signal_quality      INTEGER,
    status              VARCHAR(12),
    alias               VARCHAR(100),
    is_active           BOOLEAN,
    last_seen           DATETIME,
    created_at          DATETIME,
    access_technologies TEXT,
    registration_state  TEXT,
    tx_bytes            INTEGER DEFAULT 0,
    rx_bytes            INTEGER DEFAULT 0,
    connection_duration INTEGER DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE (mm_object_path),
    UNIQUE (imei)
);
CREATE INDEX IF NOT EXISTS ix_modems_id ON modems (id);

CREATE TABLE IF NOT EXISTS sim_access_requests (
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
);
CREATE INDEX IF NOT EXISTS ix_sim_access_requests_id      ON sim_access_requests (id);
CREATE INDEX IF NOT EXISTS ix_sim_access_requests_user_id ON sim_access_requests (user_id);

CREATE TABLE IF NOT EXISTS sim_grants (
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
);
CREATE INDEX IF NOT EXISTS ix_sim_grants_id      ON sim_grants (id);
CREATE INDEX IF NOT EXISTS ix_sim_grants_user_id ON sim_grants (user_id);

CREATE TABLE IF NOT EXISTS sms_scheduled_tasks (
    id              INTEGER      NOT NULL,
    name            VARCHAR(100) NOT NULL,
    modem_id        INTEGER      NOT NULL,
    created_by_id   INTEGER,
    recipients      JSON         NOT NULL,
    content         TEXT         NOT NULL,
    cron_expression VARCHAR(100),
    send_once_at    DATETIME,
    status          VARCHAR(9),
    run_count       INTEGER,
    last_run_at     DATETIME,
    next_run_at     DATETIME,
    created_at      DATETIME,
    updated_at      DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY (modem_id)      REFERENCES modems (id),
    FOREIGN KEY (created_by_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_sms_scheduled_tasks_id ON sms_scheduled_tasks (id);

CREATE TABLE IF NOT EXISTS sms_messages (
    id                INTEGER     NOT NULL,
    modem_id          INTEGER     NOT NULL,
    created_by_id     INTEGER,
    scheduled_task_id INTEGER,
    direction         VARCHAR(8)  NOT NULL,
    phone_number      VARCHAR(30) NOT NULL,
    content           TEXT        NOT NULL,
    status            VARCHAR(8),
    error_message     TEXT,
    mm_sms_index      VARCHAR(20),
    sent_at           DATETIME,
    received_at       DATETIME,
    created_at        DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY (modem_id)          REFERENCES modems (id),
    FOREIGN KEY (created_by_id)     REFERENCES users (id),
    FOREIGN KEY (scheduled_task_id) REFERENCES sms_scheduled_tasks (id)
);
CREATE INDEX IF NOT EXISTS ix_sms_messages_id ON sms_messages (id);

CREATE TABLE IF NOT EXISTS sms_templates (
    id         INTEGER      NOT NULL,
    name       VARCHAR(100) NOT NULL,
    content    TEXT         NOT NULL,
    variables  JSON,
    created_at DATETIME,
    updated_at DATETIME,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_sms_templates_id ON sms_templates (id);

CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER      NOT NULL,
    type           VARCHAR(32)  NOT NULL,
    title          VARCHAR(128) NOT NULL,
    body           TEXT         NOT NULL,
    is_read        BOOLEAN      NOT NULL,
    audience       VARCHAR(16)  NOT NULL,
    target_user_id INTEGER,
    created_at     DATETIME     NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_notifications_id ON notifications (id);

CREATE TABLE IF NOT EXISTS support_messages (
    id              INTEGER  NOT NULL,
    user_id         INTEGER  NOT NULL,
    sender_id       INTEGER  NOT NULL,
    content         TEXT     NOT NULL,
    is_from_user    BOOLEAN  NOT NULL,
    is_read         BOOLEAN  NOT NULL,
    created_at      DATETIME NOT NULL,
    attachment_url  TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id)   REFERENCES users (id),
    FOREIGN KEY (sender_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_support_messages_id ON support_messages (id);

-- 初始管理员账号 admin / admin123
INSERT OR IGNORE INTO users (id, username, password_hash, role, is_active, created_at, updated_at)
VALUES (1, 'admin', '$2b$12$J.PGYM99.G2T1/1wseKWI.HTcy.JskTr.4O5/ihgYUHnSU.NUefai', 'ADMIN', 1, datetime('now'), datetime('now'));

-- 系统预置角色
INSERT OR IGNORE INTO roles (name, description, is_system, can_view_sim, can_approve_requests, can_view_history, read_only, can_support, allowed_modem_ids, created_at, updated_at) VALUES
    ('审批员',   '可查看SIM卡、审批申请、查看记录',           1, 1, 1, 1, 0, 0, NULL, datetime('now'), datetime('now')),
    ('普通用户', '可查看已授权SIM卡',                         1, 1, 0, 0, 0, 0, NULL, datetime('now'), datetime('now')),
    ('只读用户', '只读，不可发送',                             1, 1, 0, 1, 1, 0, NULL, datetime('now'), datetime('now')),
    ('客服',     '处理客服会话，可查看SIM卡',                 1, 1, 0, 0, 0, 1, NULL, datetime('now'), datetime('now')),
    ('访客',     '无任何权限，需管理员手动分配角色',           1, 0, 0, 0, 0, 0, NULL, datetime('now'), datetime('now'));
