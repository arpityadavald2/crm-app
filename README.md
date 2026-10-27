# crm-app

Multi-tenant CRM with GST invoicing for Indian businesses.

**Stack:** Node.js 22, TypeScript, Express, Zod, MySQL 8.4, Redis 7, BullMQ, Vitest.

## Run locally

1. Copy the environment file and set real values (never commit `.env`):

   ```bash
   cp .env.example .env
   ```

   Set at least `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `DB_PASSWORD` (same as `MYSQL_PASSWORD`) and `JWT_SECRET` (32+ characters).

2. Start MySQL and Redis:

   ```bash
   docker compose up -d
   ```

3. Install dependencies and run migrations:

   ```bash
   npm ci
   npm run db:migrate
   ```

4. Start the API (port 3000) and, in another terminal, the background worker:

   ```bash
   npm run dev
   npm run worker
   ```

Check it works: `curl localhost:3000/health` and `curl localhost:3000/ready`.

## Commands

| Command                                            | What it does                                      |
| -------------------------------------------------- | ------------------------------------------------- |
| `npm test`                                         | Run all tests                                     |
| `npm run lint`                                     | ESLint                                            |
| `npm run typecheck`                                | TypeScript check                                  |
| `npm run format`                                   | Prettier                                          |
| `npm run build`                                    | Compile to `dist/`                                |
| `npm run db:migrate` / `db:rollback` / `db:status` | Migrations (always use these, not the `knex` CLI) |

## Docker image

One image runs both the API and the worker.

```bash
docker build -t crm-app:dev .
docker run -d --network host --env-file .env crm-app:dev                      # API
docker run -d --network host --env-file .env --no-healthcheck crm-app:dev node dist/worker.js  # worker
```

The image's health check calls `/health`. The worker has no HTTP port, so start it with `--no-healthcheck`.
`--network host` is for local testing only.

## Background worker

`src/worker.ts` is a separate entry point. Every day at `REMINDER_CRON` (default 09:00 India time) it finds overdue invoices (`due_date` passed, status `issued` or `partially_paid`) and writes a reminder log line. There is no email provider yet.

## Key rules

- All money is stored as integer paise. GST rates are in basis points (18% = 1800).
- `orgId` comes only from the verified JWT, never from the request body, query or URL.
- Another organization's record returns 404, not 403.
- Invoice numbers look like `INV/2026-27/0001` (financial year April to March).

## Smoke tests against real MySQL

The in-memory test fakes do not run real SQL. `scripts/smoke-*.ts` files are for local checks only and are not committed. Never run them against production.
