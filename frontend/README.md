# KOSMO Frontend Client SPA (React 19 + Vite + TypeScript)

> **Client Application Architecture:** Single-Page Application (SPA) powered by React 19, TypeScript 5.3 strict, Vite 5.4, Tailwind CSS 3.4, and Lucide React.

---

## 1. Overview & Architecture

The frontend client serves as the user-facing interface for the **KOSMO** Bali Co-Living Marketplace, supporting three distinct role portals:
- **Tenant Experience (`/tenant`):** Interactive Leaflet maps, multi-photo property gallery, discrete room reservation, digital e-contract signing pad, Midtrans Snap checkout, and ongoing tenancy ledger.
- **Landlord Portal (`/landlord`):** Property & discrete room inventory management, occupancy tracking, photo gallery uploads, and withdrawal payouts.
- **Admin Governance (`/admin`):** Marketplace oversight, user registry, withdrawal verification, and visitor traffic reports with Excel downloads.

---

## 2. Error Handling & Fault Resilience

The frontend implements defense-in-depth error handling to provide self-healing and pleasant recovery experiences:

### 2.1 Self-Healing React `ErrorBoundary` (`src/components/ErrorBoundary.tsx`)
- Wraps the top-level application and can be localized around sensitive UI subsections.
- **State Reset Capability:** Accepts `onReset?: () => void` and `resetKeys?: unknown[]` to recover component rendering state without a destructive full browser reload.
- **Custom Fallbacks:** Accepts `fallback?: ReactNode | ((props: FallbackProps) => ReactNode)` for custom inline error states.
- **Bilingual Support:** Displays error copy in Indonesian (`locale="id"`, default) or English (`locale="en"`).
- **Diagnostic Copying:** Single-click "Salin Detail Masalah" copies timestamped error and stack information to clipboard with feedback checkmarks.
- **WCAG Accessibility:** Formatted with `role="alert"` and `aria-live="assertive"`.

### 2.2 Resilient API Client Layer (`src/services/apiClient.ts`)
- **Typed `ApiError` Class:** Captures HTTP `status`, domain `code`, structured `details`, correlation `requestId`, and server `timestamp`.
- **Automatic Exponential Backoff Retry:** `requestWithRetry<T>()` safely retries idempotent GET requests on transient network drops or HTTP 503 errors.
- **Timeout Management:** Configurable `timeoutMs` utilizing native `AbortController`.
- **Classification Utilities:** `isApiError()`, `isNetworkError()`, `isAuthError()`, and `getErrorMessage()`.

### 2.3 Global Error Context & Toast Alerts (`src/context/ErrorContext.tsx`)
- Provides `useError()` hook:
  ```tsx
  const { showError, showApiError, dismissError } = useError();
  showError('Koneksi terputus. Silakan coba kembali.', { code: 'NETWORK_TIMEOUT', onRetry: handleRetry });
  ```
- Renders floating, accessible toast notifications with error code badges and retry action triggers.

---

## 3. Directory Structure

```
frontend/src/
├── components/                 # Reusable UI components
│   ├── __tests__/              # Vitest component unit tests & Curator audits
│   ├── BookingModal/           # 3-step contract and booking wizard
│   ├── ErrorBoundary.tsx       # Fault-tolerant React error boundary
│   ├── KosCard.tsx             # Mamikos/Airbnb style listing card
│   ├── ProtectedRoute.tsx      # Declarative role-based routing guard
│   └── SearchFilterBar.tsx     # Dual-budget range and facility filters
├── context/                    # React Context Providers
│   ├── CurrencyContext.tsx     # Reactive IDR / USD currency switcher
│   ├── ErrorContext.tsx        # Application error and toast dispatcher
│   ├── LanguageContext.tsx     # Indonesian / English localization
│   └── ThemeContext.tsx        # Dark / Light theme tokens
├── pages/                      # Central Page Views
│   ├── AdminDashboard.tsx      # Platform administration & analytics
│   ├── LandlordDashboard.tsx   # Property & room inventory management
│   ├── LandingPage.tsx         # Catalog discovery & booking entrypoint
│   ├── Login.tsx               # Authentication portal
│   └── TenantDashboard.tsx     # Tenancy contract & payment dashboard
├── services/                   # HTTP client & API adapters
│   ├── apiClient.ts            # Resilient API client with ApiError
│   ├── photosApi.ts            # Property photo gallery API adapter
│   └── roomsApi.ts             # Discrete room inventory API adapter
└── types/                      # Domain TypeScript interfaces
```

---

## 4. Development & Verification Commands

```bash
# Type-check frontend TypeScript
npm run type-check

# Run Vitest component tests (including Error Handling Curator Audit)
npm test -- --run

# Production bundling check
npm run build
```
