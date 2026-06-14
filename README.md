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

## 4. Docker & Containerized Execution

This project includes a [Dockerfile](file:///d:/Spreetail_Project/Dockerfile) in the root directory configured for production-ready, single-container deployments (hosting both the Express REST API and the compiled React static assets).

### 4.1 Building the Docker Image

Build the container image from the root of the project:
```bash
docker build -t shared-expenses-app .
```

### 4.2 Running the Container Locally

Run the container locally by forwarding port `3000` and passing the required environment variables:
```bash
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://username:password@host.docker.internal:5432/flat_expenses?sslmode=disable" \
  -e JWT_SECRET="your_secret_access_key" \
  -e JWT_REFRESH_SECRET="your_secret_refresh_key" \
  --name shared-expenses \
  shared-expenses-app
```
> [!NOTE]
> If your PostgreSQL database runs on the host OS (and not inside another Docker container), use `host.docker.internal` in the connection string to allow the container to communicate with the host.

---

## 5. EC2 Deployment Checklist (Docker)

To deploy the containerized application on an AWS EC2 instance:

### 5.1 Prepare the EC2 Instance
1. Launch an EC2 Instance (e.g., Ubuntu Server LTS, `t2.micro` or higher).
2. Configure the **Security Group** to allow inbound traffic on:
   - **Port 22** (SSH) from your IP.
   - **Port 3000** (or port 80/443 if you configure a reverse proxy like Nginx) from anywhere.

### 5.2 Install Docker on EC2
Connect to your instance via SSH and run:
```bash
sudo apt-get update -y
sudo apt-get install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker
# Optional: Add user to the docker group so you don't need 'sudo'
sudo usermod -aG docker $USER
```
*(Log out and back in to apply the group changes.)*

### 5.3 Deploy and Run
1. Clone the repository on the instance, or pull your pre-built image from a registry (e.g., Docker Hub / ECR).
2. If cloning the code, build the image locally on the instance:
   ```bash
   docker build -t shared-expenses-app .
   ```
3. Run the container, ensuring to restart automatically and point to your production database:
   ```bash
   docker run -d \
     -p 3000:3000 \
     --restart always \
     -e DATABASE_URL="your-production-db-connection-string" \
     -e JWT_SECRET="your-secure-jwt-secret" \
     -e JWT_REFRESH_SECRET="your-secure-refresh-jwt-secret" \
     --name shared-expenses-prod \
     shared-expenses-app
   ```

---

## 6. Render Deployment Checklist

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
