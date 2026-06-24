# SimNexus

基于 Debian 的多 USB 4G 模块管理系统，支持多张 SIM 卡统一管理、实时状态监控、流量统计、短信收发和定时自动发送。

## 功能特性

- **SIM 卡管理** — 专属管理页面列出所有 SIM 卡的详细信息：网络状态、信号强度、网络制式（5G/4G/3G）、注册状态、运营商、流量统计、在线时长、短信统计
- **多卡监控** — 同时管理多个 USB 4G 调制解调器，自动识别热插拔
- **实时推送** — WebSocket 每 5 秒推送设备状态、信号强度、运营商信息
- **流量统计** — 实时统计每张 SIM 卡的上行/下行流量及 Bearer 连接时长
- **手动发送** — 选定 SIM 卡后立即发送短信，发送结果实时反馈
- **收件同步** — 自动拉取各设备收件箱并入库，按 `mm_sms_index` 去重
- **定时任务** — 支持 Cron 表达式（循环）和指定时间（单次）两种模式，支持群发多个号码
- **短信记录** — 完整的收发历史，支持按设备、方向筛选

## 系统要求

- Debian 11 / 12（或 Ubuntu 20.04+）
- Python 3.10+
- Node.js 18+
- ModemManager 1.18+
- USB 4G 模块（SIM7600、EC25 等主流模组）

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

### 3. 数据库迁移（已有旧版数据库时）

```bash
cd backend
python migrate.py
```

新安装无需执行此步骤，表结构在启动时自动创建。

### 4. 启动服务

**后端**

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**前端**（新终端）

```bash
cd frontend
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)

---

## Docker 部署

```bash
docker compose up -d
```

访问 [http://localhost:3000](http://localhost:3000)

> Docker 模式下后端使用 `host` 网络模式以访问 D-Bus 和 USB 设备，需要在 Linux 宿主机上运行。

---

## 项目结构

```
SimNexus/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── modems.py          # 设备管理接口（含 /detail 详情接口）
│   │   │   ├── sms.py             # 短信发送、记录、定时任务接口
│   │   │   └── ws.py              # WebSocket 实时推送
│   │   ├── core/
│   │   │   ├── config.py          # 配置项
│   │   │   └── database.py        # SQLAlchemy 连接
│   │   ├── models/
│   │   │   ├── modem.py           # 调制解调器模型（含流量、网络制式字段）
│   │   │   └── sms.py             # 短信、模板、定时任务模型
│   │   ├── schemas/               # Pydantic 请求/响应结构
│   │   ├── services/
│   │   │   ├── modem_manager.py   # mmcli 封装（设备信息、Bearer 流量、发送、收件箱）
│   │   │   ├── modem_poller.py    # 后台轮询，自动同步设备状态和流量统计
│   │   │   └── sms_scheduler.py   # APScheduler 定时任务引擎
│   │   └── main.py
│   ├── migrate.py                 # 数据库迁移脚本（存量数据库新增字段）
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                   # Axios 接口封装
│   │   ├── components/            # ModemCard、Layout
│   │   ├── hooks/                 # useModemSocket（WebSocket）
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # 设备总览
│   │   │   ├── SimCards.tsx       # SIM 卡管理（列表 + 汇总统计）
│   │   │   ├── SimDetail.tsx      # 单卡详情（信号、流量、短信统计）
│   │   │   ├── SmsSend.tsx        # 手动发送
│   │   │   ├── SmsHistory.tsx     # 收发记录
│   │   │   └── ScheduledTasks.tsx # 定时任务管理
│   │   └── store/                 # Zustand 全局状态
│   ├── Dockerfile
│   └── nginx.conf
├── docs/
│   └── sim-cards-mockup.html      # SIM 卡管理页面设计图
├── scripts/
│   └── setup-debian.sh            # 一键初始化脚本
└── docker-compose.yml
```

## 页面说明

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 总览 | 设备卡片列表，实时在线状态 |
| `/sim-cards` | SIM 卡管理 | 所有 SIM 卡详细信息表格 |
| `/modems/:id` | 卡详情 | 单张 SIM 卡完整信息与统计 |
| `/send` | 发送短信 | 手动选卡发送 |
| `/history` | 短信记录 | 收发历史查询 |
| `/tasks` | 定时任务 | Cron 任务管理 |

## API 接口

### 设备

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/modems/` | 获取所有设备列表 |
| GET | `/api/modems/{id}` | 获取单个设备详情 |
| GET | `/api/modems/{id}/detail` | 获取设备详情（含流量、短信统计） |
| PATCH | `/api/modems/{id}` | 更新设备别名 |
| POST | `/api/modems/{id}/refresh` | 立即刷新设备状态 |

### 短信

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sms/send` | 立即发送短信 |
| GET | `/api/sms/messages` | 查询收发记录 |
| GET | `/api/sms/templates` | 获取短信模板 |
| POST | `/api/sms/templates` | 创建短信模板 |
| DELETE | `/api/sms/templates/{id}` | 删除模板 |

### 定时任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sms/tasks` | 获取所有定时任务 |
| POST | `/api/sms/tasks` | 创建定时任务 |
| PATCH | `/api/sms/tasks/{id}` | 更新任务（暂停/恢复/修改内容） |
| DELETE | `/api/sms/tasks/{id}` | 删除任务 |
| POST | `/api/sms/tasks/{id}/run-now` | 立即执行一次 |

### WebSocket

```
ws://localhost:8000/ws/modems
```

每 5 秒推送一次所有设备的实时状态（信号、在线状态、运营商）。

## 配置

后端配置通过环境变量或 `backend/.env` 文件设置：

```env
DATABASE_URL=sqlite:///./sim_manager.db
MODEM_POLL_INTERVAL=10        # 设备轮询间隔（秒）
SMS_SCHEDULER_INTERVAL=30     # 任务调度检查间隔（秒）
CORS_ORIGINS=["http://localhost:5173"]
```

## 定时任务 Cron 示例

| Cron 表达式 | 说明 |
|-------------|------|
| `0 9 * * *` | 每天早上 9:00 |
| `0 9 * * 1` | 每周一早上 9:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 8,12,18 * * *` | 每天 8:00、12:00、18:00 |

## 常见问题

**设备未被识别**

```bash
# 检查 ModemManager 是否运行
systemctl status ModemManager

# 查看已识别的调制解调器
mmcli -L

# 检查 USB 设备
lsusb
```

**串口权限不足**

```bash
# 确认用户在 dialout 组
groups $USER

# 若没有，手动添加后重新登录
sudo usermod -aG dialout $USER
```

**短信发送失败**

```bash
# 手动测试 mmcli 发送
mmcli -m 0 --messaging-create-sms="number=+8613800138000,text=test"
```

**流量统计显示为 0**

Bearer 流量需要 SIM 卡已建立数据连接（状态为 `connected`）。离线或仅注册未连接的设备无 Bearer，流量统计为 0 属正常。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI + Uvicorn |
| 数据库 | SQLite + SQLAlchemy 2.0 |
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
