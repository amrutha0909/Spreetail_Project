# Shared Expenses App

A unified shared expense-splitting application designed for a flat share where flat membership changes over time. It supports equal, percentage, share-based, and unequal splits, processes CSV ledger exports with multi-phase anomaly detection, handles multiple currencies (USD/INR) with daily historical lookup, and optimizes repayments through a greedy transaction-minimizing settlement plan.

---

## 1. Repository Layout

```
project/
├── frontend/          ← React + Vite client source
├── backend/           ← Express server & database scripts
│   ├── public/        ← Vite client build output (gitignored)
│   ├── prisma/        ← Prisma schemas & migrations
│   └── src/           ← API endpoints & anomaly engines
├── package.json       ← Root npm script conductor
└── README.md
```

---

## 2. Local Setup & Configuration

### Prerequisites
* Node.js v18 or later
* PostgreSQL database instance (local or hosted on Neon)

### Database Setup
1. Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/flat_expenses?sslmode=disable"
   JWT_SECRET="your_secret_access_key"
   JWT_REFRESH_SECRET="your_secret_refresh_key"
   PORT=3000
   ```
2. Navigate to `backend/` and install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Run the database migrations to build your schema and seed the initial users:
   ```bash
   npx prisma migrate dev --name init
   ```
   *Note: This automatically seeds the initial flatmates: Aisha, Rohan, Priya, Meera, and Sam.*

---

## 3. Working with Root Workspace Scripts

We run the entire stack from the project root using the scripts defined in [package.json](file:///d:/Spreetail_Project/package.json):

* **Build the Project**:
  ```bash
  npm run build
  ```
  This installs frontend dependencies and runs the Vite compiler, writing all static assets directly to `backend/public/`.

* **Start in Production**:
  ```bash
  npm start
  ```
  Launches the production Node.js Express server to host both the REST API and the React SPA client on port 3000.

* **Local Development Backend**:
  ```bash
  npm run dev:backend
  ```
  Runs the backend with Nodemon to auto-reload on file edits.

* **Local Development Frontend**:
  ```bash
  npm run dev:frontend
  ```
  Runs the local Vite client (port 5173). Calls to `/api` are automatically proxied to port 3000.

---

## 4. Render Deployment Checklist

We deploy this repository as a single Node.js Web Service on Render.

1. **Create Web Service**: Connect your GitHub repository to Render.
2. **Environment**: Select `Node` environment.
3. **Build Command**:
   ```bash
   npm run build && cd backend && npx prisma generate && npx prisma migrate deploy
   ```
4. **Start Command**:
   ```bash
   npm start
   ```
5. **Environment Variables**: Add these in the Render console:
   - `DATABASE_URL`: Your Neon PostgreSQL database string.
   - `JWT_SECRET`: A secure random string for signing access tokens.
   - `JWT_REFRESH_SECRET`: A secure random string for signing refresh tokens.
   - `NODE_ENV`: `production`
