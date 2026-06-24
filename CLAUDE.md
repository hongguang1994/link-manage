# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SimNexus is a multi-USB 4G modem management system. It manages multiple SIM cards, handles real-time modem status monitoring via WebSocket, and provides SMS sending (manual and scheduled). The system runs on Debian/Ubuntu and communicates with modems through the Linux `ModemManager` daemon via the `mmcli` CLI tool.

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

There are no automated tests in this codebase.

## Architecture

### Backend (FastAPI + SQLAlchemy)

The backend is a single FastAPI app with three concurrently running components:

1. **HTTP API** (`app/api/`) — REST endpoints for modems, SMS, templates, and scheduled tasks. All routes are prefixed with `/api`.

2. **Modem Poller** (`app/services/modem_poller.py`) — An `asyncio` background task (started in `lifespan`) that calls `modem_manager.list_modems()` every `MODEM_POLL_INTERVAL` seconds. It upserts modem state into the DB keyed on `mm_object_path` (the D-Bus object path) and ingests any new inbound SMS, deduplicating by `mm_sms_index`.

3. **SMS Scheduler** (`app/services/sms_scheduler.py`) — An `APScheduler AsyncIOScheduler` that runs scheduled SMS tasks. It reloads active tasks from the DB every 60 seconds and registers them as APScheduler jobs with either a `CronTrigger` or `DateTrigger`. One-time tasks auto-transition to `COMPLETED` after firing.

**ModemManager integration** (`app/services/modem_manager.py`) — All modem communication is done by shelling out to `mmcli` (the ModemManager CLI). JSON output (`-J` flag) is parsed directly. SMS send is a two-step mmcli call: create SMS object → send it → delete it. The modem is identified by its numeric index extracted from the D-Bus path (e.g. `/org/freedesktop/ModemManager1/Modem/0` → index `0`).

**Database** — SQLite by default (`sim_manager.db` in the working directory). Tables are created on startup via `Base.metadata.create_all`. There is no Alembic migration workflow in active use; `backend/migrate.py` is a one-off script for a specific past schema change.

**WebSocket** (`app/api/ws.py`) — `/ws/modems` pushes all modem state from DB every 5 seconds to all connected clients. State comes from DB (written by the poller), not live from mmcli.

### Frontend (React + TypeScript + Vite)

- **State**: Zustand store (`src/store/modemStore.ts`) holds modem list; updated by the WebSocket hook.
- **Real-time**: `src/hooks/useModemSocket.ts` manages the WebSocket connection to `/ws/modems` and writes to the Zustand store.
- **API calls**: Axios clients in `src/api/` (`client.ts` base, `modems.ts`, `sms.ts`) talk to the backend REST API.
- **Pages**: Dashboard (modem overview), SmsSend (manual send), SmsHistory (message log), ScheduledTasks (task CRUD).
- Vite proxies API/WebSocket calls in dev; nginx handles routing in the Docker image.

### Configuration

Backend reads from environment variables or `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sim_manager.db` | SQLAlchemy DB URL |
| `MODEM_POLL_INTERVAL` | `10` | Seconds between modem polls |
| `SMS_SCHEDULER_INTERVAL` | `30` | (currently unused in scheduler loop) |
| `CORS_ORIGINS` | `["http://localhost:3000","http://localhost:5173"]` | Allowed origins |

### Key constraints

- The backend **must run on Linux** with ModemManager installed and the user in the `dialout` group. `mmcli` calls will fail on macOS or in Docker without host network + USB passthrough.
- `Modem.mm_object_path` is the canonical unique key for a modem — do not use `device_path` or `imei` as a unique identifier (both can be absent or change).
- Inbound SMS deduplication uses `(modem_id, mm_sms_index, direction=inbound)` — `mm_sms_index` is the mmcli SMS object index, not a global ID.
