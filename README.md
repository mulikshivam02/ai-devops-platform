# ChangeLens

ChangeLens is an evidence-first platform for understanding software and infrastructure changes.

## Phase 1

The foundation includes a TypeScript Express API, MongoDB connection, health endpoint, and React/Vite application shell.

### Run the backend

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

### Run the frontend

```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
```

MongoDB must be available at the `MONGODB_URI` configured in `server/.env` before the API starts.
