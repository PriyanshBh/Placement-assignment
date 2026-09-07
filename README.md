# PolicyPulse — Node.js Technical Assessment

PolicyPulse is a production-minded JavaScript solution for spreadsheet ingestion, normalized MongoDB policy storage, policy search and aggregation, scheduled message delivery, and supervised CPU recovery. A responsive dashboard is included for demonstrating every assessment requirement.

## Requirements covered

- XLSX/CSV parsing and MongoDB writes execute inside a Node.js `Worker` thread.
- Data is normalized into six collections: `agents`, `users`, `accounts`, `lobs`, `carriers`, and `policies`.
- Policy search accepts a user's first name or email and populates every linked record.
- MongoDB aggregation returns policy totals and active-policy counts for each user.
- Scheduled messages are stored as pending jobs, then inserted into `messages` at the requested local day/time.
- The Node process samples its own CPU utilization. At 70% or more for three consecutive samples it exits with code `75`; the parent supervisor immediately launches a fresh server process.
- Upload validation, safe file limits, security headers, cleanup, idempotent policy upserts, and automated integration tests are included.

## Quick start (Windows PowerShell)

Prerequisites: Node.js 20+, npm, and Docker Desktop.

```powershell
cd "C:\Placement assignment"
Copy-Item .env.example .env
docker compose up -d
npm install
npm run sample
npm start
```

Open **http://localhost:4000**. The sample sheet can be downloaded from the Data Import page or found at `public/sample-policy-data.xlsx`.

To stop the app press `Ctrl+C`. To stop MongoDB too:

```powershell
docker compose down
```

The Docker volume preserves imported data. Use `docker compose down -v` only when you intentionally want to delete it.

## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Multipart upload using field name `file` (`.xlsx` or `.csv`) |
| `GET` | `/api/policies/search?username=Olivia` | Search policies by first name/email |
| `GET` | `/api/policies/aggregate` | Aggregate policies for every user |
| `GET` | `/api/dashboard` | Dashboard counts and recent activity |
| `POST` | `/api/messages/schedule` | Schedule `{ "message", "day": "YYYY-MM-DD", "time": "HH:mm" }` |
| `GET` | `/api/messages` | View scheduled and delivered messages |
| `GET` | `/api/health` | CPU, memory, uptime, PID, and restart telemetry |

Example message request:

```powershell
$body = @{ message = "Policy renewal reminder"; day = "2026-09-08"; time = "10:30" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/messages/schedule -ContentType "application/json" -Body $body
```

## Validation

Run the complete integration suite with an isolated in-memory MongoDB instance:

```powershell
npm test
```

Configuration is documented in `.env.example`. For a direct, non-supervised process use `npm run start:direct`; `npm start` is the recommended command because it enables automatic restart behavior.

## Cloud deployment

### Vercel

The repository exports `src/app.js` directly as the Express handler and includes `vercel.json` so the import worker is present in the serverless bundle. Add this environment variable to the Vercel project for Production, Preview, and Development:

```text
MONGODB_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster>/<database>?retryWrites=true&w=majority
```

Uploads use Vercel's writable temporary directory. The dashboard and request-driven APIs work on Vercel, but the continuously running scheduler and CPU-triggered process supervisor are long-running server features; demonstrate those locally or deploy the Node server to Render.

### Render

Use `npm install` as the build command and `npm start` as the start command so the CPU restart supervisor is active. Set `MONGODB_URI`, `TZ=Asia/Kolkata`, and the CPU settings from `.env.example`. Render's `bad auth : authentication failed` message means the Atlas database username/password in its environment is not valid; update that value in the Render service before redeploying.
