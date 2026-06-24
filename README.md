# SimNexus

基于 Debian 的多 USB 4G 模块管理系统，支持多张 SIM 卡统一管理、实时状态监控、流量统计、短信收发、定时任务、用户权限控制与在线客服。

## 功能特性

### 设备与通信
- **SIM 卡管理** — 列出所有 SIM 卡的网络状态、信号强度、网络制式（5G/4G/3G）、注册状态、运营商、流量统计、在线时长、短信统计
- **多卡监控** — 同时管理多个 USB 4G 调制解调器，自动识别热插拔
- **实时推送** — WebSocket 每 5 秒推送设备状态、信号强度、运营商信息
- **手动发送** — 选定 SIM 卡后立即发送短信
- **收件同步** — 自动拉取各设备收件箱并入库，按 `mm_sms_index` 去重
- **定时任务** — 支持 Cron 表达式（循环）和指定时间（单次）两种模式，支持群发多个号码

### 用户与权限（RBAC）
- **JWT 登录认证** — 用户名/密码 + 图形验证码（SVG，5 分钟有效期）
- **角色管理** — 可自定义角色，每个角色独立配置功能权限
- **多角色分配** — 每个用户可同时分配多个角色，权限取所有角色的并集
- **权限维度**
  - 功能模块：查看 SIM 卡 / 发送短信 / 管理定时任务 / 查看短信记录 / 客服回复
  - 操作类型：读写 / 只读
  - 设备范围：全部设备 / 指定设备 ID
- **系统预置角色** — 全功能用户、只读用户、短信操作员、任务管理员、客服
- **用户管理** — 创建/禁用用户、重置密码、分配角色

### 通知系统
- **实时通知** — 铃铛图标轮询未读数，支持全部标记已读
- **通知受众** — `admin`（管理员）、`support`（管理员+客服）、`all`（所有用户）、`user`（指定用户）
- **通知类型** — 设备上线/离线、短信发送失败、定时任务失败、新用户注册、用户咨询、客服回复

### 管理功能
- **任务监控** — 管理员专属页面，查看所有用户的定时任务、执行统计、历史记录
- **用户咨询** — 用户与客服/管理员实时聊天，支持文字、图片、文件附件
- **多语言** — 中文 / 英文切换
- **主题** — 浅色 / 深色 / 跟随系统

---

## 系统要求

- Debian 11 / 12（或 Ubuntu 20.04+）
- Python 3.10+
- Node.js 18+
- ModemManager 1.18+
- USB 4G 模块（SIM7600、EC25 等主流模组）

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/hongguang1994/SimNexus.git
cd SimNexus
```

### 2. 初始化系统环境

```bash
sudo bash scripts/setup-debian.sh
```

该脚本会自动完成：
- 安装 ModemManager 及系统依赖
- 配置 udev 热插拔规则
- 将当前用户加入 `dialout` 组
- 创建 Python 虚拟环境并安装依赖
- 安装前端 npm 依赖

> 安装完成后需重新登录，使串口访问权限生效。

### 3. 启动服务

**后端**

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

首次启动会自动创建所有数据表，并初始化：
- 默认管理员账号：`admin` / `admin123`（请登录后立即修改密码）
- 5 个系统预置角色

**前端**（新终端）

```bash
cd frontend
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)

### 4. Docker 部署（Linux 宿主机）

```bash
docker compose up -d
```

> 后端使用 `host` 网络模式以访问 D-Bus 和 USB 设备，必须在 Linux 宿主机上运行。  
> 前端访问地址：[http://localhost:3000](http://localhost:3000)

---

## 项目结构

```
SimNexus/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py            # 登录、获取当前用户
│   │   │   ├── captcha.py         # SVG 验证码生成与校验
│   │   │   ├── modems.py          # 设备管理接口
│   │   │   ├── notifications.py   # 通知读取与已读标记
│   │   │   ├── roles.py           # 角色 CRUD、用户角色分配
│   │   │   ├── sms.py             # 短信发送、记录、定时任务
│   │   │   ├── support.py         # 用户咨询消息、文件上传
│   │   │   ├── users.py           # 用户管理、权限设置
│   │   │   └── ws.py              # WebSocket 实时推送
│   │   ├── core/
│   │   │   ├── config.py          # 配置项
│   │   │   ├── database.py        # SQLAlchemy 连接
│   │   │   └── security.py        # JWT、密码哈希、权限依赖
│   │   ├── models/
│   │   │   ├── modem.py           # 调制解调器模型
│   │   │   ├── notification.py    # 通知模型
│   │   │   ├── permission.py      # 旧版独立权限（兼容保留）
│   │   │   ├── role.py            # RBAC 角色模型
│   │   │   ├── sms.py             # 短信、模板、定时任务模型
│   │   │   ├── support.py         # 用户咨询消息模型
│   │   │   └── user.py            # 用户模型 + user_roles 中间表
│   │   ├── schemas/               # Pydantic 请求/响应结构
│   │   ├── services/
│   │   │   ├── modem_manager.py   # mmcli 封装
│   │   │   ├── modem_poller.py    # 后台轮询设备状态
│   │   │   ├── notify.py          # 通知推送工具函数
│   │   │   └── sms_scheduler.py   # APScheduler 定时任务引擎
│   │   └── main.py                # 应用入口，初始化默认角色和管理员
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── auth.ts            # 登录、用户、权限接口
│   │   │   ├── client.ts          # Axios 基础配置（自动附 JWT）
│   │   │   ├── modems.ts          # 设备接口
│   │   │   ├── notifications.ts   # 通知接口
│   │   │   ├── roles.ts           # 角色接口
│   │   │   ├── sms.ts             # 短信、定时任务接口
│   │   │   └── support.ts         # 用户咨询接口
│   │   ├── components/
│   │   │   ├── Layout.tsx         # 主布局（侧边栏、顶栏、通知铃铛）
│   │   │   ├── ModemCard.tsx      # 设备卡片
│   │   │   └── SupportChat.tsx    # 用户端咨询聊天框
│   │   ├── hooks/
│   │   │   └── useModemSocket.ts  # WebSocket 连接管理
│   │   ├── i18n/
│   │   │   ├── zh.ts              # 中文翻译
│   │   │   └── en.ts              # 英文翻译
│   │   ├── pages/
│   │   │   ├── AdminTasks.tsx     # 管理员任务监控
│   │   │   ├── Dashboard.tsx      # 设备总览
│   │   │   ├── Login.tsx          # 登录页（含验证码）
│   │   │   ├── Roles.tsx          # 角色管理
│   │   │   ├── ScheduledTasks.tsx # 定时任务（用户视图）
│   │   │   ├── SimCards.tsx       # SIM 卡列表
│   │   │   ├── SimDetail.tsx      # 单卡详情
│   │   │   ├── SmsHistory.tsx     # 短信记录
│   │   │   ├── SmsSend.tsx        # 手动发送
│   │   │   ├── SupportAdmin.tsx   # 管理员/客服咨询管理
│   │   │   └── Users.tsx          # 用户管理
│   │   └── store/
│   │       ├── authStore.ts       # 认证状态（token、用户、权限计算）
│   │       ├── langStore.ts       # 语言切换
│   │       ├── modemStore.ts      # 设备列表
│   │       └── themeStore.ts      # 主题切换
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/
│   └── setup-debian.sh
└── docker-compose.yml
```

---

## 页面说明

| 路径 | 页面 | 权限 |
|------|------|------|
| `/login` | 登录 | 公开 |
| `/` | 设备总览 | 所有用户 |
| `/sim-cards` | SIM 卡管理 | `can_view_sim` |
| `/modems/:id` | 单卡详情 | `can_view_sim` |
| `/send` | 发送短信 | `can_send_sms` |
| `/history` | 短信记录 | `can_view_history` |
| `/tasks` | 定时任务 | `can_manage_tasks` |
| `/users` | 用户管理 | 管理员 |
| `/roles` | 角色管理 | 管理员 |
| `/support` | 用户咨询管理 | 管理员 / `can_support` |
| `/admin/tasks` | 任务监控 | 管理员 |

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/captcha` | 获取 SVG 验证码（token + svg） |
| POST | `/api/auth/login` | 登录（需传 captcha_token + captcha_code） |
| GET | `/api/auth/me` | 获取当前用户信息（含角色列表） |

### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users/` | 获取用户列表（管理员） |
| POST | `/api/users/` | 创建用户（管理员） |
| PATCH | `/api/users/{id}` | 修改用户角色/状态（管理员） |
| DELETE | `/api/users/{id}` | 删除用户（管理员） |
| POST | `/api/users/{id}/reset-password` | 重置密码（管理员） |
| POST | `/api/users/me/change-password` | 修改自己的密码 |
| GET | `/api/users/{id}/permissions` | 查看独立权限（管理员） |
| PUT | `/api/users/{id}/permissions` | 更新独立权限（管理员） |

### 角色管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/roles/` | 获取角色列表（管理员） |
| POST | `/api/roles/` | 创建角色（管理员） |
| PATCH | `/api/roles/{id}` | 更新角色权限（管理员） |
| DELETE | `/api/roles/{id}` | 删除角色（管理员，系统角色不可删）|
| PUT | `/api/roles/users/{user_id}/roles` | 批量设置用户的角色列表（管理员） |

### 设备

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/modems/` | 获取所有设备列表 |
| GET | `/api/modems/{id}` | 获取单个设备详情 |
| PATCH | `/api/modems/{id}` | 更新设备别名 |
| POST | `/api/modems/{id}/refresh` | 立即刷新设备状态 |

### 短信与定时任务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sms/send` | 立即发送短信 |
| GET | `/api/sms/messages` | 查询收发记录 |
| GET | `/api/sms/tasks` | 获取当前用户的定时任务 |
| POST | `/api/sms/tasks` | 创建定时任务 |
| PATCH | `/api/sms/tasks/{id}` | 更新任务 |
| DELETE | `/api/sms/tasks/{id}` | 删除任务 |
| POST | `/api/sms/tasks/{id}/run-now` | 立即执行一次 |
| GET | `/api/sms/admin/tasks` | 获取所有用户的任务（管理员） |
| GET | `/api/sms/admin/tasks/stats` | 任务统计（管理员） |
| GET | `/api/sms/admin/tasks/{id}/history` | 任务执行历史（管理员） |

### 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 获取通知列表（按角色过滤） |
| GET | `/api/notifications/unread-count` | 未读数量 |
| POST | `/api/notifications/read-all` | 全部标记已读 |
| POST | `/api/notifications/{id}/read` | 单条标记已读 |

### 用户咨询

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/support/upload` | 上传附件（图片/文件） |
| GET | `/api/support/files/{filename}` | 获取上传文件 |
| POST | `/api/support/messages` | 发送消息 |
| GET | `/api/support/messages` | 获取消息列表 |
| POST | `/api/support/messages/read` | 标记已读 |
| GET | `/api/support/unread` | 未读消息数 |
| GET | `/api/support/conversations` | 会话列表（管理员/客服） |

### WebSocket

```
ws://host:8000/ws/modems?token=<JWT>
```

每 5 秒推送一次所有设备的实时状态。

---

## 权限系统说明

SimNexus 使用三层权限模型：

```
系统角色（admin/user）
    ↓
RBAC 角色列表（多个，取并集）
    ↓
旧版独立权限（兜底，向后兼容）
```

**管理员**（`role=admin`）始终拥有全部权限，不受 RBAC 角色限制。

**普通用户**的有效权限由分配的所有 RBAC 角色合并决定：
- 功能权限：任一角色开启即生效
- 只读模式：所有角色均为只读才生效
- 设备范围：任一角色无限制则无限制；否则取所有受限角色的设备 ID 并集

若用户未分配任何 RBAC 角色，则回落到旧版 `UserPermission` 独立权限设置。

---

## 通知受众说明

| audience | 可见对象 |
|----------|---------|
| `admin` | 仅系统管理员 |
| `support` | 管理员 + 拥有 `can_support` 权限的角色 |
| `all` | 所有已登录用户 |
| `user` + target_user_id | 仅指定用户 |

---

## 配置

后端配置通过环境变量或 `backend/.env` 设置：

```env
DATABASE_URL=sqlite:///./sim_manager.db
MODEM_POLL_INTERVAL=10        # 设备轮询间隔（秒）
SMS_SCHEDULER_INTERVAL=30     # 任务调度检查间隔（秒，当前未使用）
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
```

文件上传存储路径：`/opt/simnexus/uploads/`（UUID 命名，无需鉴权即可访问）

---

## 定时任务 Cron 示例

| Cron 表达式 | 说明 |
|-------------|------|
| `0 9 * * *` | 每天早上 9:00 |
| `0 9 * * 1` | 每周一早上 9:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 8,12,18 * * *` | 每天 8:00、12:00、18:00 |

---

## 常见问题

**设备未被识别**

```bash
systemctl status ModemManager
mmcli -L
lsusb
```

**串口权限不足**

```bash
groups $USER
sudo usermod -aG dialout $USER  # 重新登录后生效
```

**后端无法启动（端口被占用）**

```bash
# 查找占用 8000 端口的进程
ss -tlnp | grep 8000
# 终止该进程
kill -9 <PID>
```

如果同时运行了 Docker Compose，Docker backend 容器会以 host 网络模式占用 8000 端口。若改用 systemd 管理，需先停止 Docker backend：

```bash
docker stop simnexus-backend-1
docker update --restart=no simnexus-backend-1
```

**短信发送失败**

```bash
mmcli -m 0 --messaging-create-sms="number=+8613800138000,text=test"
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI + Uvicorn |
| 数据库 | SQLite + SQLAlchemy 2.0 |
| 认证 | JWT（python-jose）+ bcrypt |
| 任务调度 | APScheduler |
| 调制解调器控制 | ModemManager（`mmcli`） |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 实时通信 | WebSocket |
| 容器化 | Docker + Docker Compose |

## License

MIT
