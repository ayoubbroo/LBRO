# SETUP (beginner)
1. Install Node.js 20+, Docker Desktop, Git.
2. In the project folder: `docker compose up -d`
3. `cp .env.example backend/.env`, then set `DATABASE_URL` password to `CHANGE_ME` (or your own, matching `POSTGRES_PASSWORD`) and generate a `JWT_SECRET` (see comment in the file).
4. Terminal 1: `cd backend && npm install && npx prisma migrate dev --name v1 && npm run seed && npm run dev`
5. Create your admin: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' npm run create-admin`
6. Terminal 2: `cd frontend && npm install && npm run dev` → http://localhost:5173
7. Sign in with the admin account → Profile → Administration.
