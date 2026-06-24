# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SimNexus is a multi-USB 4G modem management system. It manages multiple SIM cards, handles real-time modem status monitoring via WebSocket, and provides SMS sending (manual and scheduled), RBAC-based user/role management, a notification system, and a support chat feature. The system runs on Debian/Ubuntu and communicates with modems through the Linux `ModemManager` daemon via the `mmcli` CLI tool.

## Commands

### Backend

```bash
# Initial setup (Debian/Ubuntu only — installs ModemManager, udev rules, Python venv, npm deps)
sudo bash scripts/setup-debian.sh

# Run backend (from repo root)
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# Install/update Python dependencies
backend/.venv/bin/pip install -r backend/requirements.txt

# Run one-time schema migration (existing SQLite DB only)
cd backend && python migrate.py
```

### Frontend

```bash
cd frontend
npm install        # install dependencies
npm run dev        # dev server at http://localhost:5173
npm run build      # tsc + vite build (type-check + bundle)
npm run preview    # preview production build
```

### Docker (Linux host only)

```bash
docker compose up -d   # backend uses host networking for D-Bus/USB access
# Frontend at http://localhost:3000
```

**Warning**: if you also run the backend as a systemd service, the Docker backend container (which uses `network_mode: host`) will conflict on port 8000. Stop the Docker backend before starting the systemd service: `docker stop simnexus-backend-1 && docker update --restart=no simnexus-backend-1`.

There are no automated tests in this codebase.

## Architecture

### Backend (FastAPI + SQLAlchemy)

The backend is a single FastAPI app with four concurrently running components:

1. **HTTP API** (`app/api/`) — REST endpoints for all features. All routes are prefixed with `/api`. Modules:
   - `auth.py` — login, `/auth/me` (returns user + RBAC roles)
   - `captcha.py` — SVG captcha generation and JWT-signed answer verification
   - `modems.py` — device CRUD
   - `sms.py` — send, history, scheduled tasks (user-scoped) and admin views
   - `users.py` — user CRUD, password reset, legacy per-user permissions
   - `roles.py` — RBAC role CRUD and user-role assignment (`PUT /roles/users/{user_id}/roles`)
   - `notifications.py` — audience-filtered notification list, unread count, mark-read
   - `support.py` — support chat messages, file upload, conversation list (staff only)
   - `ws.py` — WebSocket push of modem state

2. **Modem Poller** (`app/services/modem_poller.py`) — An `asyncio` background task (started in `lifespan`) that calls `modem_manager.list_modems()` every `MODEM_POLL_INTERVAL` seconds. It upserts modem state into the DB keyed on `mm_object_path` (the D-Bus object path) and ingests any new inbound SMS, deduplicating by `mm_sms_index`.

3. **SMS Scheduler** (`app/services/sms_scheduler.py`) — An `APScheduler AsyncIOScheduler` that runs scheduled SMS tasks. It reloads active tasks from the DB every 60 seconds and registers them as APScheduler jobs with either a `CronTrigger` or `DateTrigger`. One-time tasks auto-transition to `COMPLETED` after firing.

4. **Notification service** (`app/services/notify.py`) — helper functions that push `Notification` rows to DB. Called by the poller, scheduler, and support router. Each notification has an `audience` field; `_visible_filter()` in `notifications.py` applies per-user filtering at query time.

**ModemManager integration** (`app/services/modem_manager.py`) — All modem communication is done by shelling out to `mmcli` (the ModemManager CLI). JSON output (`-J` flag) is parsed directly. SMS send is a two-step mmcli call: create SMS object → send it → delete it. The modem is identified by its numeric index extracted from the D-Bus path (e.g. `/org/freedesktop/ModemManager1/Modem/0` → index `0`).

**Database** — SQLite by default (`sim_manager.db` in the working directory). Tables are created on startup via `Base.metadata.create_all`. There is no Alembic migration workflow in active use; `backend/migrate.py` is a one-off script for a specific past schema change.

**WebSocket** (`app/api/ws.py`) — `/ws/modems?token=<JWT>` pushes all modem state from DB every 5 seconds to all connected clients. State comes from DB (written by the poller), not live from mmcli.

**Startup initialization** (`app/main.py` `lifespan`) — On first boot, creates:
- Default admin user: `admin` / `admin123`
- 5 system roles (see `DEFAULT_ROLES` in `main.py`): 全功能用户, 只读用户, 短信操作员, 任务管理员, 客服

### Security layer (`app/core/security.py`)

- **JWT auth** — `python-jose` with HS256; `bcrypt` directly (NOT `passlib` — passlib fails on Python 3.13)
- **`get_current_user`** — dependency that decodes JWT and loads user from DB with `rbac_roles` joined
- **`require_admin`** — dependency that raises 403 unless `user.role == UserRole.ADMIN`
- **`require_support_staff`** — dependency that raises 403 unless `is_support_staff(user)` is true
- **`_perm(user)`** — resolves effective permissions:
  1. If `role == ADMIN` → full access
  2. If user has RBAC roles → merge by union (positive flags: `any()`; `read_only`: `all()`; device scope: union of IDs, or unrestricted if any role has `allowed_modem_ids=None`)
  3. Else fall back to legacy `UserPermission` row
- **`is_support_staff(user)`** — returns True if admin OR any RBAC role has `can_support=True`

### Data models

**`models/user.py`**
```python
user_roles = Table("user_roles", Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    role = Column(Enum(UserRole))   # system-level: admin | user
    rbac_roles = relationship("Role", secondary=user_roles, lazy="joined")
    permission = relationship("UserPermission", ...)   # legacy fallback
```

**`models/role.py`**
```python
class Role(Base):
    __tablename__ = "roles"
    name, description, is_system
    can_view_sim, can_send_sms, can_manage_tasks, can_view_history  # boolean flags
    read_only, can_support                                           # boolean flags
    allowed_modem_ids = Column(JSON, nullable=True)                  # None = unrestricted
```

**`models/notification.py`** — `audience` values: `"admin"`, `"support"`, `"all"`, `"user"` (paired with `target_user_id`)

**`models/support.py`** — `SupportMessage`: `user_id`, `sender_role` (`"user"` | `"staff"`), `content`, `file_url`, `file_type`, `is_read`

### CAPTCHA (`app/api/captcha.py`)

SVG captcha with no server-side session. The answer is JWT-signed (5 min TTL) and returned as `token` to the client. Login sends both `captcha_token` and `captcha_code`; the backend verifies the JWT and compares the answer. Characters exclude 0/O/1/I/l to avoid ambiguity.

### Notification audience routing

| `audience` value | Visible to |
|---|---|
| `"admin"` | Only `role=admin` users |
| `"support"` | Admins + users with any role having `can_support=True` |
| `"all"` | All authenticated users |
| `"user"` | Only the user with `id == target_user_id` |

Support chat messages push `audience="support"` to notify staff, and `audience="user"` with `target_user_id` to notify the originating user of replies.

### Frontend (React 18 + TypeScript + Vite + Tailwind)

**Stores (Zustand with `persist` middleware)**:
- `authStore.ts` — `token`, `user` (includes `rbac_roles[]`), computed `perm()` and `canSupport()`
- `modemStore.ts` — modem list, updated by WebSocket hook
- `langStore.ts` — current language (`zh` | `en`), persisted to localStorage
- `themeStore.ts` — current theme (`light` | `dark` | `system`), persisted to localStorage

**`authStore.perm()` logic** (mirrors backend `_perm()`):
- Admin → full access
- Has RBAC roles → merge: `some()` for positive flags, `every()` for `read_only`, union of `allowed_modem_ids`
- No roles → fall back to `user.permission`

**`authStore.canSupport()`**: admin always true; else `rbac_roles.some(r => r.can_support)`.

**i18n** — `src/i18n/zh.ts` and `en.ts` export flat key→string maps. `useT()` hook reads `langStore` and returns the lookup function. System role names (stored in Chinese in DB) are translated client-side via a hardcoded map in `Roles.tsx`.

**Layout.tsx** — calls `getMeApi()` on mount to refresh user data (including latest RBAC roles) into `authStore`. Shows support nav link when `canSupport()`, roles nav link when `user.role === 'admin'`.

**Route guards**:
- `RequireAuth` — redirects to `/login` if no token
- `RequireAdmin` — redirects to `/` if not admin
- `RequireSupport` — redirects to `/` if `!canSupport()`

**Pages**:
| Page | Path | Guard |
|------|------|-------|
| Login | `/login` | public |
| Dashboard | `/` | RequireAuth |
| SimCards | `/sim-cards` | RequireAuth + `can_view_sim` |
| SimDetail | `/modems/:id` | RequireAuth + `can_view_sim` |
| SmsSend | `/send` | RequireAuth + `can_send_sms` |
| SmsHistory | `/history` | RequireAuth + `can_view_history` |
| ScheduledTasks | `/tasks` | RequireAuth + `can_manage_tasks` |
| Users | `/users` | RequireAdmin |
| Roles | `/roles` | RequireAdmin |
| SupportAdmin | `/support` | RequireSupport |
| AdminTasks | `/admin/tasks` | RequireAdmin |

**API clients** (`src/api/`): `client.ts` is the Axios base with JWT `Authorization` header injected automatically; each domain module exports typed API functions.

Vite proxies `/api` and `/ws` to `localhost:8000` in dev; nginx handles routing in the Docker image.

### Configuration

Backend reads from environment variables or `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sim_manager.db` | SQLAlchemy DB URL |
| `MODEM_POLL_INTERVAL` | `10` | Seconds between modem polls |
| `SMS_SCHEDULER_INTERVAL` | `30` | (currently unused in scheduler loop) |
| `CORS_ORIGINS` | `["http://localhost:3000","http://localhost:5173"]` | Allowed origins |

File uploads stored at `/opt/simnexus/uploads/` (UUID-named, served without auth via `GET /api/support/files/{filename}`).

### Key constraints

- The backend **must run on Linux** with ModemManager installed and the user in the `dialout` group. `mmcli` calls will fail on macOS or in Docker without host network + USB passthrough.
- `Modem.mm_object_path` is the canonical unique key for a modem — do not use `device_path` or `imei` as a unique identifier (both can be absent or change).
- Inbound SMS deduplication uses `(modem_id, mm_sms_index, direction=inbound)` — `mm_sms_index` is the mmcli SMS object index, not a global ID.
- Do **not** use `passlib` for password hashing — it fails on Python 3.13. Use `bcrypt` directly.
- `rbac_roles` is loaded with `lazy="joined"` on `User`; always available after `get_current_user`. Access via `getattr(user, "rbac_roles", None)` in security helpers that may receive users loaded without the relationship.
- System roles (`is_system=True`) cannot be deleted via the API.
