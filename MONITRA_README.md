# MONITRA

**Website uptime and response-time monitoring, with a modern dashboard.**

MONITRA is a full-stack project that checks public HTTP/HTTPS websites, stores measurements, and presents monitor status, performance charts, and downtime incidents in a responsive React dashboard.

> **Project status:** Working local-development build. The monitor scheduler runs only while the Node.js backend is active. This is not yet a hosted monitoring service.

## Highlights

- **Live status checks:** See whether a configured website is operational, degraded, or down.
- **Response times:** Measure HTTP request latency and explore 24-hour or 7-day analytics.
- **Monitor management:** Add, search, pause, resume, check, and remove websites.
- **Incident tracking:** Record outages automatically and mark incidents resolved after recovery.
- **Persistent history:** Store monitors, checks, incidents, and settings in SQLite.
- **Configurable intervals:** Choose 1-, 5-, or 15-minute checks.
- **Responsive interface:** Dark-mode dashboard designed for desktop and smaller screens.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, Recharts, Lucide React |
| Backend | Node.js, Express |
| Database | SQLite (`better-sqlite3`) |
| Monitoring | Node.js HTTP/HTTPS and DNS APIs |

## Getting started

**Requirements:** Node.js 20 or later, npm.

Clone the project and install dependencies in **both** applications:

```bash
git clone https://github.com/YOUR_USERNAME/monitra.git
cd monitra
cd server
npm install
cd ../client
npm install
cd ..
```

From the project root, start the backend in one terminal:

```bash
cd server
npm run dev
```

Start the frontend in a second terminal (from the repository root):

```bash
cd client
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`). The backend health endpoint is `http://localhost:3001/api/health`.

> On Windows PowerShell, if `.ps1` execution is blocked, use `npm.cmd` in place of `npm`.

### Try it

1. Open **MONITRA** in your browser and choose **Add monitor**.
2. Enter a name and a public website URL, for example `https://example.com`.
3. Wait for a completed check, or use **Check now**.
4. Explore the **Monitors**, **Incidents**, and **Settings** pages.

## Project structure

```text
monitra/
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── vite.config.js
│   └── package.json
├── server/
│   ├── server.js
│   ├── checker.js
│   ├── database.js
│   └── package.json
├── .gitignore
└── README.md
```

## API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/monitors` | List monitors and measured uptime |
| `POST` | `/api/monitors` | Add a website |
| `PATCH` | `/api/monitors/:id` | Pause or resume monitoring |
| `DELETE` | `/api/monitors/:id` | Delete a monitor |
| `POST` | `/api/monitors/:id/check` | Request a fresh check |
| `GET` | `/api/incidents` | View outage history |
| `GET` | `/api/analytics?range=24h` | View recorded response times (`24h` or `7d`) |
| `GET` | `/api/settings` | Read monitoring interval |
| `PATCH` | `/api/settings` | Update monitoring interval |

## Important behavior and limitations

- Uptime percentages reflect **checks recorded by this app**, not a guarantee of continuous availability.
- Only **public HTTP/HTTPS URLs** on standard ports are supported. Local/private IPs are blocked; redirects are not followed.
- HTTP response checks are a simple availability signal, not a comprehensive browser or end-to-end user-experience test.
- SQLite data is created locally inside `server/` and is intentionally excluded from Git.
- The local API binds to `127.0.0.1` and uses local-development CORS settings. **Do not expose it to the public internet as-is.** A production version would need authentication, rate limiting, deployment hardening, and an always-on scheduler.

## Roadmap

- [x] Responsive dashboard and monitor management
- [x] Live HTTP checks and stored measurements
- [x] Incident history and performance analytics
- [ ] Automated tests and continuous integration
- [ ] Authentication and multi-user workspaces
- [ ] Production hosting with an always-on monitoring worker
- [ ] Optional email or webhook alerts

## Screenshots

Add screenshots of your running dashboard here before sharing the project with recruiters. Use your own MONITRA screenshots rather than stock mockups.
