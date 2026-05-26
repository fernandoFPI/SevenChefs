# Attendance & Payroll Management System
## نظام إدارة الحضور والرواتب

Full-stack attendance and payroll system for Farage Printing Industries (Seven Chefs).
Built with Node.js + Express, React 18 + Vite + Tailwind CSS, PostgreSQL 15.

---

## Table of Contents

- [System Overview](#system-overview)
- [Local Development Setup](#local-development-setup)
- [Docker Commands Reference](#docker-commands-reference)
- [Deployment Workflow](#deployment-workflow)
- [First-Time VPS Setup](#first-time-vps-setup)
- [GitHub Secrets](#github-secrets)
- [Troubleshooting](#troubleshooting)

---

## System Overview

| Component | Technology | Port |
|---|---|---|
| Backend API | Node.js + Express | 3000 |
| Frontend | React 18 + Vite + Tailwind | 80 (nginx) |
| Database | PostgreSQL 15 | 5432 (internal) |
| Reverse Proxy | Nginx + Let's Encrypt | 80 / 443 |

**Production URL:** https://attendance.seven-chefs.com

### Roles

| Role | Description |
|---|---|
| `ADMIN` | Full control, settings, final approvals |
| `MANAGER` | Attendance approvals, first-stage review |
| `ACCOUNTANT` | Operational access (no settings / final approvals) |
| `EMPLOYEE` | Own portal only |

### Default Admin Credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

Password change is enforced on first login.

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your DB credentials and secrets
```

**Minimum required variables:**

| Variable | Description |
|---|---|
| `DB_HOST` | Database host (default: localhost) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | Random string, min 32 chars |
| `COOKIE_SECRET` | Random string for cookie signing |

### 3. Create the database

```sql
CREATE DATABASE attendance_db;
```

### 4. Run migrations

```bash
cd backend
npm run migrate
```

### 5. Start development servers

```bash
# Terminal 1 — Backend (port 3000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

---

## Docker Commands Reference

### Start all containers

```bash
docker compose up -d --build
```

### View logs

```bash
docker compose logs -f                          # all containers
docker compose logs -f attendance-backend       # backend only
docker compose logs -f attendance-nginx         # nginx only
```

### Run migrations inside container

```bash
docker compose exec attendance-backend npm run migrate
```

### Restart a single service

```bash
docker compose restart attendance-backend
```

### Rebuild a single service (after code change)

```bash
docker compose build attendance-backend --no-cache
docker compose up -d attendance-backend
```

### Stop all containers

```bash
docker compose down
```

### Stop and remove all data (destructive)

```bash
docker compose down -v
```

### Open a shell in a container

```bash
docker compose exec attendance-backend sh
docker compose exec attendance-postgres psql -U attendance_user attendance_db
```

### Check container status

```bash
docker compose ps
```

---

## Deployment Workflow

```
dev branch   → development work
     ↓
main branch  → auto-deploys to VPS via GitHub Actions
```

Every push to `main` triggers the CI/CD pipeline:
1. SSH into VPS
2. `git pull origin main`
3. `docker compose build --no-cache`
4. `docker compose up -d`
5. `docker compose exec -T attendance-backend npm run migrate`

**Never commit directly to `main`.** Work on `dev`, then merge.

---

## First-Time VPS Setup

```bash
ssh root@<VPS_IP>

# Install Docker
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker
apt install docker-compose-plugin -y

# Clone the repo
mkdir -p /opt/attendance
cd /opt/attendance
git clone https://github.com/fernandoFPI/SevenChefs.git .

# Create production .env (NEVER committed to git)
cp .env.example .env
nano .env   # fill in real values — see table below

# Get SSL certificate
apt install certbot -y
certbot certonly --standalone -d attendance.seven-chefs.com

# Start everything
docker compose up -d --build
docker compose exec -T attendance-backend npm run migrate
```

### Production .env values

| Variable | Value |
|---|---|
| `DB_PASSWORD` | Strong random password |
| `JWT_SECRET` | 64-char random string |
| `ZK_HOST` | `50.28.107.202` |
| `ZK_PORT` | `80` |
| `ZK_USERNAME` | ZKBio username |
| `ZK_PASSWORD` | ZKBio password |
| `COOKIE_SECRET` | Another long random string |

### Set up SSH key for GitHub Actions

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy   # copy this → GitHub Secret VPS_SSH_KEY
```

---

## GitHub Secrets

Set these in: **GitHub repo → Settings → Secrets and variables → Actions**

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP address |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Content of `~/.ssh/github_deploy` (private key) |
| `VPS_PORT` | `22` |

---

## Troubleshooting

| Problem | Command / Fix |
|---|---|
| Container won't start | `docker compose logs attendance-backend` |
| Migration fails | `docker compose exec attendance-backend npm run migrate` — check output |
| Nginx 502 Bad Gateway | Backend not ready yet — `docker compose ps`, wait and retry |
| SSL certificate error | Ensure port 80 is open on VPS, rerun `certbot certonly --standalone -d attendance.seven-chefs.com` |
| Database connection refused | Check `DB_PASSWORD` in `.env` matches what Postgres was initialized with |
| Backup fails | Verify `postgresql-client` is in backend image: `docker compose exec attendance-backend pg_dump --version` |
| Old code still running after deploy | `docker compose build --no-cache && docker compose up -d` |
| Can't SSH from GitHub Actions | Confirm public key is in `~/.ssh/authorized_keys` on VPS and `VPS_SSH_KEY` secret has the matching private key |
| ZKBio sync not working | Check `ZK_HOST`, `ZK_PORT`, `ZK_USERNAME`, `ZK_PASSWORD` in production `.env` |

### Useful one-liners

```bash
# Check disk usage of Docker volumes
docker system df

# View live resource usage
docker stats

# Force-recreate all containers
docker compose up -d --force-recreate

# Tail backend logs since last hour
docker compose logs --since 1h -f attendance-backend
```

---

## Project Structure

```
/
├── backend/
│   ├── Dockerfile
│   ├── migrations/
│   │   ├── sql/                  ← numbered .sql migration files
│   │   └── ...
│   ├── src/
│   │   ├── config/db.js
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── services/
│   └── server.js
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf                ← SPA routing (inside frontend container)
│   └── src/
│       ├── components/
│       ├── context/
│       ├── layouts/
│       ├── lib/
│       ├── locales/              ← EN + AR translations
│       └── pages/
│
├── nginx/
│   └── nginx.conf               ← Main reverse proxy (SSL + routing)
│
├── .github/
│   └── workflows/
│       └── deploy.yml           ← CI/CD pipeline
│
├── docker-compose.yml
├── .env.example
└── .gitignore
```
