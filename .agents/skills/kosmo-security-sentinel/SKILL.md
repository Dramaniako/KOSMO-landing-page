---
name: kosmo-security-sentinel
description: Security auditing, secret detection, token handling, and pre-commit security verification for KOSMO. Activates when dealing with credentials, authentication, passwords, JWT tokens, RBAC roles, payment gateways, file uploads, or CI secret configurations.
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - security
  - secret-scanning
  - rbac
  - jwt
  - bcrypt
  - kyc
  - midtrans
  - cloudinary
---

# KOSMO Security Sentinel: Auditing, Secret Hygiene & Access Control

## 1. Overview & Triggers
`kosmo-security-sentinel` enforces zero-trust security invariants across the KOSMO platform. It defends against credential leakage, improper privilege escalation, unauthenticated state mutations, malicious file uploads, and unauthorized financial actions.

### Activation Triggers
- Editing authentication flows (`backend/router.ts`, `backend/services/jwt.ts`, `backend/services/auth.ts`).
- Modifying `.env*`, `package.json`, `.github/workflows/ci.yml`, or build configurations.
- Implementing destructive endpoints (property deletion, rental termination, balance withdrawal).
- Handling third-party integrations (Midtrans Payment Gateway, Cloudinary CDN, TiDB Cloud).
- Pre-commit security verification before staging git commits.

---

## 2. Threat Modeling & Core Security Invariants

### 2.1 Secret Protection & Leak Prevention
- **No Hardcoded Secrets**: Under NO circumstance should database passwords, JWT secrets, Cloudinary secrets, or Midtrans keys be hardcoded in code, tests, or CI workflow files.
- **Strict Environment Resolution**: In CI (`.github/workflows/ci.yml`), secrets must be read strictly from `${{ secrets.<NAME> }}` without leaking fallback defaults into source control.
- **Gitignore Enforcement**: All `.env` files (except non-sensitive `.env.example`) must be ignored. Never run `git add .` or `git add -A`.

### 2.2 Password Security & Verification Gates
- **Bcrypt Hashing**: All passwords must be salted and hashed via `bcryptjs` with high cost factors. Plaintext passwords must never touch the database.
- **Password Confirmation Gate (`/api/auth/verify-password`)**: Destructive actions (deleting properties, terminating active leases, initiating large withdrawals) require the user to re-enter their current password before execution.
- **Root Admin Deletion Guard**: The system must enforce a hardcoded guard preventing deletion or de-escalation of the root administrator account (`admin@kosmo.id`).

### 2.3 Strict Role-Based Access Control (RBAC)
- **Canonical Roles**: Strict union `'admin' | 'landlord' | 'tenant'`.
- **Enforcement Middleware**: Endpoints must enforce role authorization using `requireRole(['admin'])` or ownership verification helpers.
- **Ownership Verification**:
  - Landlords may only edit or delete properties they own (`landlord_id = req.user.id`).
  - Tenants may only view or terminate their own rentals (`tenant_id = req.user.id`).
  - Users may only view or modify their own profiles unless caller has `admin` role.

### 2.4 Sensitive Data Exposure
- Query responses (`/api/users`, `/api/auth/me`) must strictly strip `password_hash`, reset tokens, and raw banking secrets before sending JSON responses to clients.

### 2.5 Media & Document Upload Security
- **MIME Type Allowlist**: Only `image/jpeg`, `image/png`, `image/webp`, and `application/pdf` are accepted. SVG and executable formats (`.exe`, `.sh`, `.php`, `.js`) are strictly rejected.
- **Size Limitation**: File upload stream buffers are capped at a strict 5MB limit (`MAX_FILE_SIZE = 5 * 1024 * 1024`).

---

## 3. Step-by-Step Security Audit Runbook

### Step 1: Pre-Commit Secret Scan
Run targeted ripgrep searches to detect accidental secret commits:

```powershell
# Windows PowerShell
# Check for leaked TiDB credentials, connection strings, or embedded passwords
rg "tidbcloud\.com" -g "!*.log" -g "!.env*" -g "!*.md"
rg "(password|secret|key|token)\s*[:=]\s*['\"][A-Za-z0-9+/=_-]{16,}['\"]" -g "!*.log" -g "!.env*"

# Check for hardcoded private keys or tokens
rg "ghp_[A-Za-z0-9_]{30,}" -g "!*.log" -g "!.env*"
rg "Mid-server-[A-Za-z0-9]+" -g "!*.log" -g "!.env*"
```

```bash
# POSIX Bash
rg "tidbcloud\.com" -g "!*.log" -g "!.env*" -g "!*.md"
rg "(password|secret|key|token)\s*[:=]\s*['\"][A-Za-z0-9+/=_-]{16,}['\"]" -g "!*.log" -g "!.env*"
rg "ghp_[A-Za-z0-9_]{30,}" -g "!*.log" -g "!.env*"
```

### Step 2: Validate Git Staging
Ensure untracked environment files or scratch logs are not staged:
```bash
git status --porcelain
```
*(If any `.env`, `.log`, or `.system_generated` appears in staged files, unstage immediately via `git reset HEAD <file>`.)*

### Step 3: Verify Security Unit Tests
Run security and authentication unit tests:
```powershell
node --import tsx --test --test-force-exit tests/auth.test.ts
node --import tsx --test --test-force-exit tests/jwt.test.ts
node --import tsx --test --test-force-exit tests/upload.test.ts
```

---

## 4. Failure Modes & Automated Triage Matrix

| Failure Mode | Root Cause | Immediate Action |
|---|---|---|
| Leaked password or API key in git commit | Secret was committed to git history | 1. Rotate the credential immediately in the upstream service (TiDB Cloud, Midtrans, GitHub).<br>2. Remove secret from file.<br>3. Inform repository administrator to rewrite git history if pushed. |
| User receives 403 Forbidden on authorized action | RBAC role check failed or user token has stale role claims | Re-authenticate to issue fresh JWT with updated database role claims. |
| Malformed token error on API calls | JWT signature mismatch or expired token | Verify client transmits `Authorization: Bearer <token>`. Ensure server `JWT_SECRET` matches token issue secret. |
| Upload endpoint returns 400 Invalid MIME | File uploaded does not match allowed MIME types | Ensure client sends genuine JPEG, PNG, WEBP, or PDF. Inspect multipart file magic bytes. |

---

## 5. Security & Verification Guardrails
1. **Never commit `.env` files**: Keep `.env` strictly in `.gitignore`.
2. **Never mock security checks in production**: Guards like `requireRole` and `verifyPassword` must never have bypass flags enabled in production code.
3. **Always use parameterized SQL queries**: Prepared statements prevent SQL injection across all database touchpoints.
