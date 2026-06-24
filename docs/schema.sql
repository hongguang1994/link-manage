-- SimNexus 数据库表结构与初始数据
-- 数据库：SQLite
-- 生成时间：2026-06-24
--
-- 用法：在空数据库上执行此文件即可完成初始化
--   sqlite3 sim_manager.db < docs/schema.sql
--
-- 初始账号：admin / admin123（登录后请立即修改密码）
-- 建表顺序按依赖关系排列（被引用表在前）

-- -----------------------------------------------------
-- 用户与权限域
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER      NOT NULL,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    role          VARCHAR(5)   NOT NULL,   -- 'admin' | 'user'
    is_active     BOOLEAN,
    created_at    DATETIME,
    updated_at    DATETIME,
    PRIMARY KEY (id),
    UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS ix_users_id       ON users (id);
CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id                INTEGER     NOT NULL,
    name              VARCHAR(64) NOT NULL,
    description       TEXT,
    is_system         BOOLEAN,               -- 系统预置角色，不可删除
    -- 功能权限
    can_view_sim      BOOLEAN,
    can_send_sms      BOOLEAN,
    can_manage_tasks  BOOLEAN,
    can_view_history  BOOLEAN,
    -- 操作类型
    read_only         BOOLEAN,               -- 只读，禁止写操作
    -- 客服权限
    can_support       BOOLEAN,               -- 可回复用户咨询
    -- 设备范围：null = 不限制；JSON 数组 = 仅限指定 modem id
    allowed_modem_ids JSON,
    created_at        DATETIME,
    updated_at        DATETIME,
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS ix_roles_id ON roles (id);

-- -----------------------------------------------------

-- 用户与角色多对多关联（RBAC）
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

-- -----------------------------------------------------

-- 旧版独立权限（兜底）：用户无 RBAC 角色时使用
CREATE TABLE IF NOT EXISTS user_permissions (
    id                INTEGER NOT NULL,
    user_id           INTEGER NOT NULL,
    can_view_sim      BOOLEAN,
    can_send_sms      BOOLEAN,
    can_manage_tasks  BOOLEAN,
    can_view_history  BOOLEAN,
    read_only         BOOLEAN,
    allowed_modem_ids JSON,
    PRIMARY KEY (id),
    UNIQUE (user_id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- -----------------------------------------------------
-- 设备管理域
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS modems (
    id                  INTEGER      NOT NULL,
    -- ModemManager D-Bus 路径，业务唯一键
    mm_object_path      VARCHAR(200) NOT NULL,
    device_path         VARCHAR(100),          -- e.g. /dev/ttyUSB0
    imei                VARCHAR(20),
    manufacturer        VARCHAR(100),
    model               VARCHAR(100),
    phone_number        VARCHAR(30),
    operator            VARCHAR(100),
    signal_quality      INTEGER,               -- 0~100
    status              VARCHAR(12),           -- 'connected'|'disconnected'|'error'|'unknown'
    alias               VARCHAR(100),          -- 用户自定义别名
    is_active           BOOLEAN,
    last_seen           DATETIME,
    created_at          DATETIME,
    -- 扩展统计（由轮询器更新）
    access_technologies TEXT,                  -- e.g. 'lte', 'umts'
    registration_state  TEXT,                  -- e.g. 'home', 'roaming'
    tx_bytes            INTEGER DEFAULT 0,
    rx_bytes            INTEGER DEFAULT 0,
    connection_duration INTEGER DEFAULT 0,     -- 秒
    PRIMARY KEY (id),
    UNIQUE (mm_object_path),
    UNIQUE (imei)
);

CREATE INDEX IF NOT EXISTS ix_modems_id ON modems (id);

-- -----------------------------------------------------
-- 短信与任务域
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS sms_scheduled_tasks (
    id              INTEGER      NOT NULL,
    name            VARCHAR(100) NOT NULL,
    modem_id        INTEGER      NOT NULL,
    created_by_id   INTEGER,                   -- 创建者，可为空
    recipients      JSON         NOT NULL,     -- 号码列表 e.g. ["+8613800138000"]
    content         TEXT         NOT NULL,
    -- 触发方式（二选一）
    cron_expression VARCHAR(100),              -- 循环任务，e.g. "0 9 * * *"
    send_once_at    DATETIME,                  -- 单次发送时间
    status          VARCHAR(9),               -- 'active'|'paused'|'completed'|'failed'
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

-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS sms_messages (
    id                INTEGER     NOT NULL,
    modem_id          INTEGER     NOT NULL,
    created_by_id     INTEGER,               -- 发送者，收件时为空
    scheduled_task_id INTEGER,               -- 来源定时任务，手动发送时为空
    direction         VARCHAR(8)  NOT NULL,  -- 'inbound' | 'outbound'
    phone_number      VARCHAR(30) NOT NULL,
    content           TEXT        NOT NULL,
    status            VARCHAR(8),           -- 'pending'|'sent'|'failed'|'received'
    error_message     TEXT,
    -- 收件去重：以 (modem_id, mm_sms_index, direction=inbound) 去重
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

-- -----------------------------------------------------

-- 短信模板（独立，无外键关联）
CREATE TABLE IF NOT EXISTS sms_templates (
    id         INTEGER      NOT NULL,
    name       VARCHAR(100) NOT NULL,
    content    TEXT         NOT NULL,
    variables  JSON,                    -- 变量名列表 e.g. ["name", "code"]
    created_at DATETIME,
    updated_at DATETIME,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_sms_templates_id ON sms_templates (id);

-- -----------------------------------------------------
-- 通知与客服域
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER     NOT NULL,
    type           VARCHAR(32) NOT NULL,
    title          VARCHAR(128) NOT NULL,
    body           TEXT        NOT NULL,
    is_read        BOOLEAN     NOT NULL,
    -- 可见范围：'admin' | 'support' | 'all' | 'user'
    audience       VARCHAR(16) NOT NULL,
    -- audience='user' 时指定接收者（软引用，无 FK 约束）
    target_user_id INTEGER,
    created_at     DATETIME    NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_notifications_id ON notifications (id);

-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS support_messages (
    id              INTEGER  NOT NULL,
    -- 会话归属：消息属于哪个用户的咨询会话
    user_id         INTEGER  NOT NULL,
    -- 实际发送者：用户本人或客服/管理员
    sender_id       INTEGER  NOT NULL,
    content         TEXT     NOT NULL,
    is_from_user    BOOLEAN  NOT NULL,  -- true=用户发，false=客服发
    is_read         BOOLEAN  NOT NULL,
    created_at      DATETIME NOT NULL,
    -- 附件（可选）
    attachment_url  TEXT,
    attachment_name TEXT,
    attachment_type TEXT,               -- 'image' | 'file'
    PRIMARY KEY (id),
    FOREIGN KEY (user_id)   REFERENCES users (id),
    FOREIGN KEY (sender_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS ix_support_messages_id ON support_messages (id);

-- -----------------------------------------------------
-- 初始数据（仅在空库首次导入时执行）
-- -----------------------------------------------------

-- 默认管理员账号：admin / admin123
-- password_hash 为 bcrypt 哈希，登录后请及时修改密码
INSERT OR IGNORE INTO users (id, username, password_hash, role, is_active, created_at, updated_at)
VALUES (
    1,
    'admin',
    '$2b$12$J.PGYM99.G2T1/1wseKWI.HTcy.JskTr.4O5/ihgYUHnSU.NUefai',
    'admin',
    1,
    datetime('now'),
    datetime('now')
);

-- 系统预置角色（is_system=1 表示不可通过 API 删除）
INSERT OR IGNORE INTO roles (name, description, is_system, can_view_sim, can_send_sms, can_manage_tasks, can_view_history, read_only, can_support, allowed_modem_ids, created_at, updated_at) VALUES
    ('全功能用户', '可使用所有功能，无设备限制',           1, 1, 1, 1, 1, 0, 0, NULL, datetime('now'), datetime('now')),
    ('只读用户',   '仅可查看，不可操作',                   1, 1, 0, 0, 1, 1, 0, NULL, datetime('now'), datetime('now')),
    ('短信操作员', '可发送短信，查看记录，不可管理任务',   1, 1, 1, 0, 1, 0, 0, NULL, datetime('now'), datetime('now')),
    ('任务管理员', '可管理定时任务，可查看记录',           1, 1, 1, 1, 1, 0, 0, NULL, datetime('now'), datetime('now')),
    ('客服',       '可查看并回复用户咨询，无其他管理权限', 1, 0, 0, 0, 0, 1, 1, NULL, datetime('now'), datetime('now'));
