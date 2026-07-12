---
name: verify
description: Build/launch/drive recipe for verifying changes to this attendance & payroll app (Node/Express backend :3000, React/Vite frontend :5173, local PostgreSQL 18).
---

# Verifying this app

## Launch

- Backend: `cd backend && node server.js` (reads `backend/.env`; local Postgres 18 service `postgresql-x64-18`, db `attendance_db`, user `fernando`). Health check: `curl http://localhost:3000/api/company-info`.
- Frontend: `cd frontend && npm run dev` → http://localhost:5173. Build check: `npx vite build`.
- If node_modules behaves strangely (silent hangs on require): OneDrive may have dehydrated files — force-read every file to rehydrate.

## Login / test data

- Seed admin: `admin` / `admin123` (API does not block on the forced password change; only the UI does).
- Create fixtures via API with cookie jars:
  - `POST /api/auth/login` → save cookies (`curl -c jar`).
  - `POST /api/employees {name, employee_code, monthly_salary, username, role:"EMPLOYEE"}` — the employee user's initial password = employee_code.
  - `POST /api/users {username, role:"MANAGER", password}` for a manager.
  - Employee submits `POST /api/requests`; manager `PUT /api/requests/:id/manager-action {action:"FORWARD"}`; admin `PUT /api/requests/:id/admin-action {action:"APPROVE"}`.
- Clean up after: delete from notifications/requests/attendance_daily/leave_records/users/employees for the test employee_code (single transaction).

## Driving the GUI

- No Playwright in the repo; install `playwright-core` in the scratchpad and launch with `chromium.launch({ channel: 'msedge', headless: true })` — system Edge works, no browser download needed.
- Key viewports: 375×667 (phone), 768×1024 (md boundary — card views flip to tables), 1280×800 (desktop regression).
- Login flow: fill `input[type=text]` + `input[type=password]`, click `button[type=submit]`, wait for `**/dashboard`.
- RTL: click the header button with text `العربية`; check `document.documentElement.dir === 'rtl'`.
- Gotcha: card-view pages render BOTH a hidden desktop `<table>` and mobile cards — `locator('text=…').first()` often picks the hidden table node and reports invisible. Assert against a screenshot or scope the locator to the `.md\:hidden` container.
- No-horizontal-scroll check: `document.documentElement.scrollWidth <= clientWidth`.

## DB checks

`psql` at `C:\Program Files\PostgreSQL\18\bin\psql.exe`, e.g.
`PGPASSWORD=… psql -U fernando -h localhost -d attendance_db -c "SELECT …"`.
