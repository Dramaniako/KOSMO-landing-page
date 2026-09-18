# KOSMO — Bali Co-Living & Long-Term Rental Marketplace

<div align="center">

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%20%7C%20Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express.js](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/TiDB%20Cloud-MySQL%208.0-E3002B?style=for-the-badge&logo=mysql&logoColor=white)](https://www.pingcap.com/tidb-cloud/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E%20Tests-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-Unit%20Tests-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)

<p align="center">
  <strong>An all-inclusive, digital-first co-living marketplace built for Bali, Indonesia.</strong><br/>
  Seamless property discovery, bilingual digital lease agreements, Midtrans Snap cashless checkout, live financial ledgers, and end-to-end platform governance.
</p>

[🏗️ System Architecture](docs/architecture.md) • [📡 API Reference](docs/api.md) • [📦 Deployment Guide](docs/deployment.md) • [🔒 Security & Verification](docs/security.md)

---

</div>

## 📌 Executive Summary

**KOSMO** is a specialized co-living and rental ecosystem engineered for Bali's thriving resident, expatriate, and digital nomad communities across **Denpasar**, **Badung** (Canggu, Seminyak, Kuta), **Gianyar** (Ubud), and **Tabanan**.

Unlike conventional classified listings, KOSMO operates on a transparent, **all-inclusive model**:
- ⚡ **Zero Hidden Utility Fees:** Monthly rates bundle PLN electricity token, filtered water, and high-speed dedicated 100 Mbps fiber internet.
- 🧹 **Hospitality Services:** Bi-weekly professional housekeeping, regular linen change, and trash disposal included.
- 🔒 **Security & Convenience:** 24/7 smart lock keyless access, on-site security, and designated motorbike/car parking.
- 📜 **Legally Binding Digital Contracts:** Interactive bilingual (ID/EN) digital agreements with embedded canvas signatures, SHA-256 tamper-evident hashing, and dynamic PDF generation.
- 💳 **Integrated Cashless Settlement:** Real-time checkout powered by the Midtrans Snap payment gateway with SHA-512 cryptographic webhook verification.

---

## 📚 Detailed Documentation

For in-depth technical specifications, please consult the dedicated documentation modules:

| Document | Description |
| :--- | :--- |
| [🏗️ **System Architecture & Database Design**](docs/architecture.md) | High-level system architecture diagrams, tech stack matrix, complete TiDB relational ER schema, and composite index strategies. |
| [📡 **REST API Reference**](docs/api.md) | Comprehensive API endpoint specifications, query parameters, request/response payloads, and authentication standards. |
| [📦 **Deployment & Operations Runbook**](docs/deployment.md) | Production setup instructions for Standalone Node.js (PM2/Docker) and Vercel Serverless, database diagnostics, and health probes. |
| [🔒 **Security & Verification Standards**](docs/security.md) | JWT token policies, asynchronous bcrypt hashing, destructive action password gates, row-level concurrency locking, and webhook integrity. |

---

## 🌟 Key Features

### 🏠 Tenant Experience (`/tenant`)
- **Dual Min/Max Budget Filtering:** Real-time range filtering (`priceMin` & `priceMax`) with instant out-of-bounds short-circuiting.
- **Interactive Geospatial Exploration:** Integrated Leaflet OpenStreetMap view rendering verified Bali coordinates and property cards.
- **Bilingual Digital Contract (E-Sign):** Canvas signature pad generating legally valid, tamper-proof lease agreements.
- **Dynamic PDF Lease Generator:** Programmatic PDF contract generation with embedded digital signature, downloadable directly from the dashboard.
- **Cashless Midtrans Snap Checkout:** Instant payment processing supporting Indonesian Virtual Accounts (BCA, Mandiri, BNI, BRI), QRIS, GoPay, and Credit Cards.
- **Single Active Tenancy Guard:** Concurrency rule preventing overlapping active leases to protect both tenants and property inventory.
- **Next Payment & Due Date Engine:** Automatic calculation of monthly lease anniversary cycles, days remaining, and proactive due date badges.
- **Secure Lease Termination Gate:** Password-verified workflow with atomic occupancy release.

### 🏢 Landlord Operations (`/landlord`)
- **Real-Time Property Portfolio CRUD:** Multi-photo uploads streamed to Cloudinary CDN with automatic responsive URL generation.
- **Occupancy Rate Tracking:** Dynamic calculations (`occupiedRooms / totalRooms`) with live occupancy indicators.
- **SQL-Aggregated Financial Ledger:** Real-time monthly revenue and transaction aggregations calculated directly in the database.
- **Active Tenant Roster:** View active leaseholders, contact channels (WhatsApp/Phone), and contract start dates.
- **Atomic Balance & Withdrawal Engine:** Dedicated payout requests with upfront balance deduction, row-level locking (`SELECT ... FOR UPDATE`), and atomic refund rollbacks on admin rejection.
- **Secure Excel Ledger Downloads:** Authenticated blob downloads eliminating sensitive JWT tokens from URL query strings.

### 🛡️ Platform Administration & Governance (`/admin`)
- **Marketplace Metrics Overview:** Gross transaction volume (GMV), total active listings, overall occupancy rate, and user distribution.
- **Visitor Traffic & Analytics:** Real-time IP and User-Agent tracking with 24h, 7d, and 30d visual historical traffic charts.
- **Financial Payout Approval Pipeline:** Review pending withdrawal requests, complete payouts, or reject with reason and automatic fund reversal.
- **Excel Audit Reports:** Generate and stream `.xlsx` financial and traffic audit reports via authenticated binary blobs.
- **Property & User Moderation:** High-privilege management guarded by re-authentication gates.

### 🌐 Cross-Cutting System Capabilities
- **Bilingual Internationalization (i18n):** Native support for **Bahasa Indonesia (`id`)** and **English (`en`)**, persisted in `localStorage` and synchronized with user profiles.
- **Adaptive Theme System:** Dark and Light mode toggling with `prefers-color-scheme` auto-detection and zero Cumulative Layout Shift (CLS).
- **Declarative Route Protection (`<ProtectedRoute>`):** Centralized role-based routing preventing unauthorized layout flash across all dashboard views.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Node.js:** `>= 18.0.0` (LTS Node 20+ recommended)
- **npm:** `>= 9.0.0`
- **Database:** MySQL 8.0+ or a [TiDB Serverless](https://www.pingcap.com/tidb-cloud/) cluster

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Dramaniako/KOSMO-landing-page.git
cd KOSMO-landing-page

# Install root and workspace dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (see [`.env.example`](.env.example) and [Deployment Guide](docs/deployment.md)):

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=kosmo_db
DB_SSL=false
JWT_SECRET=super-secret-jwt-key-with-high-entropy-minimum-32-chars
```

### 4. Database Initialization & Seeding
```bash
# Run schema migration & seed curated Bali properties, reviews, and test accounts
npm run db:seed
```

### 5. Running the Application
```bash
# Terminal 1: Start Backend API (http://localhost:5000)
npm run dev:backend

# Terminal 2: Start Frontend Client (http://localhost:5173)
npm --prefix frontend run dev
```

---

## 🔑 Demo Accounts (Pre-Seeded)

| Role | Email | Password | Primary Dashboard |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@kosmo.com` | `admin` | [`/admin`](http://localhost:5173/admin) |
| **Landlord (Pemilik)** | `landlord@kosmo.com` | `landlord` | [`/landlord`](http://localhost:5173/landlord) |
| **Tenant (Penyewa)** | `tenant@kosmo.com` | `tenant` | [`/tenant`](http://localhost:5173/tenant) |

---

## 🧪 Testing & Quality Assurance

KOSMO enforces a deterministic **5-Gate Verification Pipeline** (`./scripts/verify.sh` or `scripts/verify.ps1`):

```bash
# Run complete verification pipeline
./scripts/verify.sh
```

### Individual Test Commands

```bash
# 1. Strict TypeScript Type Check (Zero-Any Policy)
npm run type-check

# 2. Backend Unit & Domain Test Suite (Node.js Native Test Runner)
npm test

# 3. Frontend Component Tests (Vitest & React Testing Library)
npm --prefix frontend test -- --run

# 4. Live Database Integration & Concurrency Tests
npm run test:integration

# 5. End-to-End Browser Journeys (Playwright)
npm run test:e2e
```

---

## 📂 Project Structure

```
KOSMO-landing-page/
├── docs/                           # Architectural & operational documentation
│   ├── architecture.md             # System design, tech stack & ER diagram
│   ├── api.md                      # Comprehensive REST API reference
│   ├── deployment.md               # Production runbook (Node.js & Vercel)
│   └── security.md                 # Security controls, JWT & concurrency locks
├── api/                            # Vercel Serverless entrypoint
│   └── index.js                    # Bundled backend production artifact
├── backend/                        # Backend REST API architecture
│   ├── middleware/                 # Auth, upload, and Zod validation middleware
│   ├── routes/                     # Domain-partitioned express route handlers
│   ├── services/                   # Cache, Cloudinary, and PDF contract services
│   ├── types/                      # Domain TypeScript interfaces
│   ├── db.ts                       # TiDB / MySQL pool & schema lifecycle
│   ├── router.ts                   # Central router registration
│   └── server.ts                   # Express server entrypoint & middleware pipeline
├── frontend/                       # React 19 Client SPA
│   ├── src/
│   │   ├── components/             # Reusable UI components & ProtectedRoute
│   │   ├── context/                # Theme & Language Context Providers
│   │   ├── pages/                  # Admin, Landlord, and Tenant Dashboards
│   │   ├── services/               # HTTP client & API adapters
│   │   ├── types/                  # Frontend interfaces & Leaflet declarations
│   │   └── App.tsx                 # Root router with declarative route guards
│   └── vite.config.ts              # Vite bundler configuration & API proxy
├── scripts/                        # Operational & maintenance scripts
└── tests/                          # Automated test suites (Unit, Integration, E2E)
```

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>Built with ❤️ for Bali's Co-Living Community by the KOSMO Engineering Team.</sub>
</div>
