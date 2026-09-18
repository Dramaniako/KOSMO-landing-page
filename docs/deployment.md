# KOSMO Deployment & Production Runbook

This guide covers production deployment workflows, database provisioning, environment configurations, and infrastructure health monitoring for **KOSMO**.

---

## 1. Prerequisites & Environment Setup

Ensure the following tools are available on the deployment host:
- **Node.js:** `>= 18.0.0` (LTS Node 20 recommended)
- **npm:** `>= 9.0.0`
- **Database:** MySQL 8.0+ or a [TiDB Serverless](https://www.pingcap.com/tidb-cloud/) cluster (TLSv1.2)
- **Media CDN:** Cloudinary account for photo and contract PDF storage
- **Payment Gateway:** Midtrans account (Sandbox or Production)

### Environment Variable Matrix

Create a production `.env` file in the root directory following this template:

```env
# ==============================================
# Server Runtime
# ==============================================
PORT=5000
NODE_ENV=production

# ==============================================
# Database Configuration (MySQL / TiDB Cloud)
# ==============================================
DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=your_cluster_prefix.root
DB_PASSWORD=your_strong_database_password
DB_NAME=kosmo_db
DB_SSL=true

# ==============================================
# Security & Authentication
# ==============================================
# Minimum 32-character high-entropy secret
JWT_SECRET=super-secret-jwt-key-with-high-entropy-minimum-32-chars

# ==============================================
# Cloudinary CDN Storage
# ==============================================
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ==============================================
# Midtrans Payment Gateway
# ==============================================
MIDTRANS_SERVER_KEY=Mid-server-your-server-key
MIDTRANS_CLIENT_KEY=Mid-client-your-client-key
VITE_MIDTRANS_CLIENT_KEY=Mid-client-your-client-key
MIDTRANS_IS_PRODUCTION=false

# ==============================================
# Client Configuration
# ==============================================
VITE_API_BASE=/api
```

---

## 2. Deployment Strategies

### Strategy A: Standalone Node.js Server (Linux VPS / Docker)

Ideal for dedicated VM hosting (AWS EC2, DigitalOcean Droplet, Hetzner, GCP Compute Engine).

#### 1. Build Production Assets
```bash
# Clone repository
git clone https://github.com/Dramaniako/KOSMO-landing-page.git
cd KOSMO-landing-page

# Install dependencies (workspaces included)
npm install --production=false

# Compile frontend SPA and backend bundle
npm run build
```

#### 2. Run Database Seeder (First Time Only)
```bash
# Run migrations and seed baseline Bali data
npm run db:seed
```

#### 3. Start Production Daemon via PM2
Install PM2 globally if not already present:
```bash
npm install -g pm2
```

Start the application with process monitoring and automatic restarts:
```bash
pm2 start tsx --name "kosmo-api" -- backend/server.ts
pm2 save
pm2 startup
```

---

### Strategy B: Vercel Serverless Deployment

KOSMO is architected out-of-the-box for zero-configuration Vercel deployment:
- **Serverless API:** `backend/api.ts` is bundled via esbuild into a single, self-contained ES module at `api/index.js`.
- **Static Frontend:** The Vite SPA is compiled into `frontend/dist/`.
- **Routing:** `vercel.json` maps `/api/*` to the serverless entrypoint and all remaining routes to `index.html`.

#### 1. Deployment via Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Link and deploy
vercel
vercel --prod
```

#### 2. Vercel Configuration Settings:
In the Vercel Project Dashboard:
- **Framework Preset:** Vite
- **Root Directory:** `./`
- **Build Command:** `npm run build`
- **Output Directory:** `frontend/dist`
- **Install Command:** `npm install`

Add all variables from the `.env` matrix to **Project Settings > Environment Variables**.

---

## 3. Database Maintenance & Diagnostics

### Connection Health Check
Run the standalone diagnostic utility to verify connectivity and SSL handshakes:
```bash
npm run db:diagnose
```

### Composite Index Verification
Ensure all performance-critical composite indexes are active:
```bash
npm run db:check-indexes
```

### Room Occupancy Audit & Synchronization
Audit room counts against active rentals and reconcile discrepancies:
```bash
# Audit without mutating
npm run db:check-occupancy

# Synchronize and fix room counts
npm run db:sync-occupancy
```

---

## 4. Verification & Health Monitoring

The server exposes an unauthenticated health probe for load balancer health checks:

```http
GET /api/health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-09-18T14:00:00.000Z"
}
```
