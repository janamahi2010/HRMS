# HRMS: Attendance & Leave

Location-based attendance and leave management for small teams.

- **frontend/**: React 18 + TypeScript + Vite, Tailwind CSS v4, Radix (shadcn-style) UI, TanStack Query
- **backend/**: Django 5.2 + DRF, PostgreSQL, SimpleJWT

## Features
| Module | Highlights |
|---|---|
| Auth | Company sign-up, login, forgot/reset password, email invites, JWT with rotating refresh tokens |
| Company setup | Logo, office locations on a map with a check-in radius, timings, late-after, half-day hours, weekly offs, holidays, leave types, default CC |
| Employees | Search, filters, pagination, add/edit, reporting lines (loop-safe), activate/deactivate |
| Attendance | GPS check-in/out validated **on the server** (Haversine radius, ≤150 m accuracy, server time), live timer, monthly calendar + list, team view, nightly close-day job |
| Regularization | Missed punch / work from home / client visit; approval updates attendance; cancel while pending |
| Leave | Live preview (working days excl. holidays/offs, balance after), balances booked on apply, approve/reject/cancel, CC (view-only) + default CC, team calendar, who's on leave, audited balance adjustments, pro-rata credit for joiners |
| Dashboards | One aggregated, role-aware endpoint (employee / manager / admin) incl. attendance-rate trend |
| Reports | Attendance summary, daily log, leave report; JSON API, Excel export in the browser |
| Email | Branded HTML notifications for every workflow step, sent after commit in a background thread |

Roles: **admin** (whole company), **manager** (self + direct reports), **employee** (self). A manager's own requests go to an admin. Rules are enforced on the backend by permission classes and queryset scoping; out-of-scope records return 404.

## Local setup

### Prerequisites
Python 3.12, Node 20+, PostgreSQL 14+.

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # then set DATABASE_URL and SECRET_KEY
python manage.py migrate
python manage.py createcachetable  # DB cache used for rate limiting
python manage.py seed_demo --reset # optional demo company (see below)
python manage.py runserver
```
- API: http://localhost:8000/api/ · OpenAPI docs: http://localhost:8000/api/docs/ · Django admin: /admin/
- In development, emails are printed to the console (`EMAIL_BACKEND=console`).
- **Demo logins** (password `Demo@12345`): `admin@demo.hrms`, managers `priya@` / `rohan@demo.hrms`, employees `ananya@`, `karan@`, `neha@`… `@demo.hrms`.
  In dev, the login page has one-click demo buttons. The demo office is in Bengaluru: to check in from your desk,
  edit *Settings → Office locations → Head Office* and click "use my location", or fake GPS in Chrome DevTools → Sensors.

### Frontend
```bash
cd frontend
npm install
cp .env.example .env               # VITE_API_URL=/api (Vite proxies it to Django on :8000)
npm run dev
```
Open http://localhost:5173. Use a demo login, or **create a company** on the sign-up page (the first user becomes Admin).

### Tests
```bash
cd backend && pytest          # 58 tests: radius, day counting, balances, approvals, scoping, emails, reports
cd frontend && npx tsc -b      # type check
```

### Scheduled jobs (management commands, run by Render Cron in production)
| Command | When | What |
|---|---|---|
| `close_attendance_day` | 23:55 IST daily | Marks Absent / On leave for working days without a punch and Incomplete for missing check-outs. Idempotent; `--date YYYY-MM-DD`, `--backfill N`. |
| `credit_leave_balances` | 00:05 IST, 1 Jan | Creates the year's balances for every active user. Idempotent; `--year`. Mid-year joiners are credited pro-rata when created. |

## Design notes
- **Auth:** access token (15 min) in memory; refresh token (14 days, rotated + blacklisted on use) in `localStorage`, because the
  frontend and API live on different `onrender.com` subdomains where cross-site cookies are unreliable. The axios
  interceptor refreshes once on 401 (single-flight, multi-tab safe).
- **Errors:** one JSON shape everywhere: `{"error": {"code", "message", "fields"?, ...}}`. Business-rule errors may include
  `field` (shown on that input) and context such as `distance_m`.
- **Leave balance** is booked when a request is applied (pending + approved count as used) and restored on reject/cancel,
  so two pending requests can't spend the same days. Approving backdated leave converts closed "Absent" days to "On leave".
- **Holidays / weekly offs** are never stored as attendance rows; they're derived from the work calendar on read.
- **Rate limits** (login 10/min, reset emails 5/h, reset/invite links 30/h, sign-up 10/h per IP; check-in 20/min per user) use the
  database cache so they hold across gunicorn workers.
- **Refresh-token rotation with a 60 s grace window** (`accounts/tokens.py`): a token rotated away in the last minute can be used
  once more, so a reload-then-navigate or two tabs opening together never logs anyone out. Logout, password change and
  deactivation revoke immediately with no grace.
- **API docs** (`/api/docs/`) are public in development and limited to staff signed in to `/admin/` in production.
- **Accessibility:** every page passes axe-core (WCAG 2.1 AA) in light and dark mode, desktop and mobile; all colour tokens
  were checked for ≥ 4.5:1 text contrast in both themes.
- **Performance:** every route is code-split; nav links prefetch the route chunk *and* its first query on hover/touch;
  Leaflet and SheetJS load only when used. Lighthouse (login, throttled mobile profile): Performance 89, Accessibility 100,
  Best Practices 100, SEO 100.

## Deployment (Render)
`render.yaml` is a Blueprint for the whole stack: Postgres, the Django API (gunicorn, 2 workers), the React static site
(SPA rewrite + immutable asset caching) and two cron jobs.

1. Push the repo to GitHub/GitLab.
2. Render Dashboard → **New → Blueprint** → select the repo. Render creates `hrms-db`, `hrms-api`, `hrms-web` and the crons.
3. Fill in the values Render prompts for (env group `hrms-shared` and `hrms-web`):
   | Variable | Example |
   |---|---|
   | `FRONTEND_URL` | `https://hrms-web.onrender.com` (also allowed for CORS automatically) |
   | `VITE_API_URL` (on hrms-web) | `https://hrms-api.onrender.com/api` |
   | `EMAIL_HOST` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | Resend: `smtp.resend.com` / `resend` / API key. Gmail: `smtp.gmail.com` / address / app password |
   | `DEFAULT_FROM_EMAIL` | `Acme HR <hr@acme.com>` (must be a verified sender) |
   | `CLOUDINARY_URL` | `cloudinary://key:secret@cloud` (company logos; Render's disk is ephemeral) |
4. Redeploy `hrms-web` after setting `VITE_API_URL` (it's baked in at build time).
5. Open the site and sign up your company. Optionally load demo data from the API service's shell: `python manage.py seed_demo`.

Notes:
- The API refuses to start with `DEBUG=False` and a weak `SECRET_KEY` (the Blueprint generates one).
- `build.sh` runs `collectstatic`, `migrate` and `createcachetable` on every deploy.
- Free web services sleep when idle; the first request after a while is slow. Cron jobs require a paid instance type.




cd frontend
npm run dev



cd backend
python manage.py runserver
