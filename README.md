# Family Communication Hub

A secure, small-family communication web application designed for 4–6 users and future tvOS integration.

## Stack

- Web: Next.js + React + TypeScript + Tailwind CSS
- API: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Realtime: Socket.IO
- Auth: JWT in secure HTTP-only cookies
- Validation: Zod
- Password hashing: Argon2id
- Voice: browser MediaRecorder API
- Push: Web Push / VAPID
- AI: provider-agnostic HTTP endpoint
- Deployment: Docker/Azure-ready

## Project layout

```text
family-communication-hub/
  apps/
    web/       Next.js family/kid portal
    api/       Express API + Socket.IO
  prisma/      database schema
  docker-compose.yml
  .env.example
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Set strong secrets.
3. Start PostgreSQL:

```bash
docker compose up -d postgres
```

4. Install dependencies:

```bash
npm install
```

5. Create the database:

```bash
npm run db:push
npm run db:seed
```

6. Start API and web:

```bash
npm run dev
```

Web: http://localhost:3000  
API: http://localhost:4000

Seed login accounts are intentionally simple for local development only. Change them immediately before any real deployment.

## Production deployment

This app can be deployed with a public front-end host and a separate API host. For `abhi4848.in`, the recommended setup is:

- Frontend: Vercel or any static/Next.js host
- Backend: Render, Railway, Fly.io, or a VPS
- Database: managed PostgreSQL
- Domain: `abhi4848.in` for web and `api.abhi4848.in` for the API

### Recommended DNS

- `A` record: `abhi4848.in` → frontend host IP or Vercel alias
- `CNAME` record: `www` → `abhi4848.in`
- `CNAME` record: `api` → backend host name (Render/Railway)

### Required environment variables

Frontend host:
- `NEXT_PUBLIC_API_URL=https://api.abhi4848.in`

Backend host:
- `PORT=4000`
- `WEB_ORIGIN=https://abhi4848.in`
- `JWT_SECRET=replace-with-a-long-random-secret-at-least-32-bytes`
- `COOKIE_SECURE=true`
- `DATABASE_URL=postgresql://...`
- `VAPID_SUBJECT=mailto:...`
- `VAPID_PUBLIC_KEY=...`
- `VAPID_PRIVATE_KEY=...`

### Voice uploads in production

The current voice upload flow stores media files in the API host's local filesystem. That is fine for a demo, but for a production deployment you should use Azure Blob Storage or another cloud storage provider and save only signed URLs or blob references in the database.

## Production security checklist

- Use HTTPS.
- Set `COOKIE_SECURE=true`.
- Use strong random `JWT_SECRET`.
- Use a managed/private PostgreSQL database.
- Do not expose PostgreSQL publicly.
- Put API and web behind HTTPS.
- Configure CORS to only allow the real web origin.
- Configure VAPID keys for push notifications.
- Configure an AI provider only if desired.
- Rotate secrets if they are ever exposed.
- Enable database backups.
- Restrict Azure network access.
- Review the audit log regularly.

## Future tvOS

The web UI is separate from the API. A future tvOS client can authenticate against the API and use the same REST/WebSocket contracts. Keep the API versioned and do not put web-specific assumptions into it.
