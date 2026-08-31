// scripts/create_github_issues.mjs
// Usage: $env:GITHUB_TOKEN="your_pat_with_issues_write_permission"; node scripts/create_github_issues.mjs

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = 'Dramaniako/KOSMO-landing-page';

if (!GITHUB_TOKEN) {
  console.error('❌ Error: GITHUB_TOKEN or GH_TOKEN environment variable is required to open GitHub issues.');
  console.log('\nMake sure your Fine-Grained Personal Access Token (or Classic Token with "repo" scope) has:');
  console.log('  👉 Repository permissions -> Issues: Read and write');
  console.log('\nRun in PowerShell:');
  console.log('  $env:GITHUB_TOKEN="your_token_here"; node scripts/create_github_issues.mjs');
  process.exit(1);
}

const allIssues = [
  {
    title: '🛡️ Security & Integrity: Enforce Upper Bound Limit on Base64 Canvas Signature Payloads',
    body: `### Overview\nDigital signature payloads submitted to \`POST /api/rentals/contract/sign\` and \`POST /api/rentals/contract/preview\` must have a strict upper size limit (1MB) to prevent memory bloat and CPU denial-of-service during PDF generation.\n\n### Affected Files\n- \`backend/middleware/validation.ts\` (\`signContractSchema\`, \`previewContractSchema\`)\n- \`backend/services/contract.ts\`\n\n### Resolution Applied\nAdded \`.max(1_000_000)\` validation constraint in Zod schemas and added boundary test coverage in \`tests/validation.test.ts\`.`,
    labels: ['security', 'enhancement']
  },
  {
    title: '⚖️ Legal & Contract Integrity: Persist duration_months in rentals Table and Contract Queries',
    body: `### Overview\nPreviously, multi-month leases (e.g., 3, 6, 12 months) calculated the upfront price correctly during initial signing, but \`rentals\` table lacked a \`duration_months\` column, causing \`GET /api/rentals/:id/contract\` to regenerate PDFs with a default 1-month duration.\n\n### Affected Files\n- \`backend/db.ts\`\n- \`backend/router.ts\` (\`POST /rentals/contract/sign\`, \`GET /rentals/:id/contract\`, \`POST /rentals\`)\n- \`backend/types/index.ts\`\n- \`frontend/src/types/index.ts\`\n\n### Resolution Applied\nAdded non-destructive migration \`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS duration_months INT DEFAULT 1\` and bound \`duration_months\` to contract generation, database storage, and retrieval flows.`,
    labels: ['bug', 'legal']
  },
  {
    title: '💳 Payment Reconciliation: Multi-Month and Admin Fee Reconciliation in Payment Webhook',
    body: `### Overview\n\`POST /api/payment/webhook\` previously compared incoming \`gross_amount\` strictly to \`rental.price\` (monthly base rate). For multi-month tenancies or bookings with the flat Rp 5,000 platform admin fee, this caused gross amount validation to fail with HTTP 400.\n\n### Affected Files\n- \`backend/router.ts\` (\`POST /payment/webhook\`)\n\n### Resolution Applied\nUpdated payment webhook gross amount reconciliation to validate against \`(monthlyPrice * durationMonths) + adminFee\` and \`monthlyPrice * durationMonths\`, accurately crediting full lease revenue to landlord balance.`,
    labels: ['bug', 'payment']
  },
  {
    title: '⚡ Performance: Safe In-Memory PDFKit Stream Cleanup & Buffer Discard',
    body: `### Overview\nEnsure in-memory PDF generation streams properly clear internal chunk buffers upon error events to prevent buffer retention and memory leaks during high concurrent load.\n\n### Affected Files\n- \`backend/services/contract.ts\` (\`generateRentalContractBuffer\`)\n\n### Resolution Applied\nImplemented stream lifecycle tracking to discard buffers immediately on stream error and ensure complete resolution on stream end.`,
    labels: ['performance']
  },
  {
    title: '🛡️ Security: Hardcoded Default API Keys in Router and Cloudinary Service',
    body: `### Overview\nFallback API keys and placeholder identifiers are present in source code.\n\n### Affected Files\n- \`backend/router.ts\` (lines 2124-2125, 2282)\n- \`backend/services/cloudinary.ts\` (lines 25-27)\n\n### Impact\nUsing static placeholder keys instead of enforcing environment variables can mask misconfigurations and risk unintentional mock behavior in production.\n\n### Recommended Fix\nRequire environment variables (\`MIDTRANS_SERVER_KEY\`, \`MIDTRANS_CLIENT_KEY\`, \`CLOUDINARY_*\`) and throw explicit errors if unconfigured in production/staging.`,
    labels: ['bug']
  },
  {
    title: '🧩 Code Health: Code Duplication: formatRupiah in AdminDashboard',
    body: `### Overview\n\`formatRupiah\` is defined as a standalone inline function inside \`AdminDashboard.tsx\`.\n\n### Affected File\n- \`frontend/src/pages/AdminDashboard.tsx\` (line 705)\n\n### Recommended Fix\nExtract currency formatting to a shared utility \`frontend/src/utils/format.ts\` with a module-level cached \`Intl.NumberFormat\` instance.`,
    labels: ['enhancement']
  },
  {
    title: '🛡️ Security: Missing Authentication on Review Creation (POST /api/reviews)',
    body: `### Overview\nThe \`POST /api/reviews\` endpoint is completely unauthenticated.\n\n### Affected File\n- \`backend/router.ts\` (line 844)\n\n### Impact\nAny caller can submit arbitrary \`userId\`, \`userName\`, and manipulate property ratings without logging in.\n\n### Recommended Fix\nAdd \`authenticateToken\` middleware and enforce that \`userId\` matches \`req.user.id\`.`,
    labels: ['bug']
  },
  {
    title: '🛡️ Security: Insecure Default Database Credentials in Database Configuration',
    body: `### Overview\nDatabase connection config falls back to \`root\` with an empty string password.\n\n### Affected File\n- \`backend/db.ts\` (lines 44-45)\n\n### Impact\nRisks unauthenticated root database access if environment variables are not supplied.\n\n### Recommended Fix\nRequire \`DB_USER\` and \`DB_PASSWORD\` or fail loudly if credentials are not configured.`,
    labels: ['bug']
  },
  {
    title: '🛡️ Security: Path Traversal in Contract PDF Generation',
    body: `### Overview\n\`data.rentalId\` is concatenated directly into the output filename without sanitization.\n\n### Affected File\n- \`backend/services/contract.ts\` (lines 34-35)\n\n### Impact\nA crafted \`rentalId\` containing directory traversal characters (\`../\`) could write files outside the target directory.\n\n### Recommended Fix\nSanitize \`rentalId\` using regex validation \`/^[a-zA-Z0-9_-]+$/\` and \`path.basename\`.`,
    labels: ['bug']
  },
  {
    title: '🛡️ Security: Overly Permissive CORS Policy in Express Server',
    body: `### Overview\n\`cors()\` is initialized with no arguments, allowing wildcard \`*\` origins across all routes.\n\n### Affected File\n- \`backend/server.ts\` (line 46)\n\n### Impact\nAllows unauthorized cross-origin requests from arbitrary websites.\n\n### Recommended Fix\nConfigure origin whitelist checking against \`process.env.FRONTEND_URL\` / authorized domains.`,
    labels: ['bug']
  },
  {
    title: '🧪 Testing: Untested API Middleware DB Connection Export',
    body: `### Overview\n\`ensureDbInitialized()\` is exported from \`backend/server.ts\` and the serverless middleware database check has no test coverage.\n\n### Affected File\n- \`backend/server.ts\` (lines 53, 58-71)\n\n### Recommended Fix\nAdd unit tests verifying \`ensureDbInitialized()\` export and middleware behavior under connection success/failure.`,
    labels: ['enhancement']
  },
  {
    title: '⚡ Performance: Sequential Inserts and DDL Checks in Data Migration',
    body: `### Overview\n\`ensureIndexes()\` and multiple seed queries inside \`initDb()\` execute sequentially.\n\n### Affected File\n- \`backend/db.ts\` (lines 96-117, 310-368)\n\n### Impact\nAdds latency to database cold starts in serverless and containerized environments.\n\n### Recommended Fix\nExecute index migrations and seeding in transactional batches or with \`Promise.allSettled\`.`,
    labels: ['enhancement']
  },
  {
    title: '⚡ Performance: Suboptimal Filtering Loop Array Allocation in Properties Endpoint',
    body: `### Overview\nInside \`properties.filter()\`, \`(p.facilities || []).map(...)\` allocates a new array on each comparison in the inner loop.\n\n### Affected File\n- \`backend/router.ts\` (lines 571-573)\n\n### Impact\nUnnecessary memory allocations and GC pressure during catalog filtering under load.\n\n### Recommended Fix\nPre-lowercase property facilities into a \`Set\` once per property.`,
    labels: ['enhancement']
  },
  {
    title: '⚡ Performance: N+1 Query in Property Facility Creation',
    body: `### Overview\nCreating a property runs individual \`INSERT INTO property_facilities\` statements inside a \`for\` loop.\n\n### Affected File\n- \`backend/router.ts\` (lines 640-645)\n\n### Impact\nCauses \`N\` round-trips to the database for each facility.\n\n### Recommended Fix\nUse multi-row bulk insert: \`INSERT INTO property_facilities (propertyId, facility) VALUES ?\`.`,
    labels: ['enhancement']
  },
  {
    title: '⚡ Performance: N+1 Query in Property Facility Update',
    body: `### Overview\nUpdating property facilities runs individual \`INSERT\` queries in a \`for\` loop.\n\n### Affected File\n- \`backend/router.ts\` (lines 704-708)\n\n### Impact\nCauses \`N\` SQL round-trips during property facility updates.\n\n### Recommended Fix\nUse single multi-row bulk insert statement.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Code Duplication: formatRupiah in BookingModal',
    body: `### Overview\n\`formatRupiah\` is declared as an inline helper inside \`BookingModal.tsx\`.\n\n### Affected File\n- \`frontend/src/components/BookingModal.tsx\` (line 59)\n\n### Recommended Fix\nImport shared \`formatRupiah\` utility from \`frontend/src/utils/format.ts\`.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Code Duplication: formatRupiah in KosCard',
    body: `### Overview\n\`formatRupiah\` is declared as an inline helper inside \`KosCard.tsx\`.\n\n### Affected File\n- \`frontend/src/components/KosCard.tsx\` (line 25)\n\n### Recommended Fix\nImport shared \`formatRupiah\` utility from \`frontend/src/utils/format.ts\`.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Unused Import: NextFunction in router.ts',
    body: `### Overview\n\`NextFunction\` is imported from \`express\` but never used in \`backend/router.ts\`.\n\n### Affected File\n- \`backend/router.ts\` (line 2)\n\n### Recommended Fix\nRemove unused \`NextFunction\` from import statement.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Unused Import: useEffect in LanguageContext.tsx',
    body: `### Overview\n\`useEffect\` is imported from \`react\` but never used in \`LanguageContext.tsx\`.\n\n### Affected File\n- \`frontend/src/context/LanguageContext.tsx\` (line 1)\n\n### Recommended Fix\nRemove unused \`useEffect\` from import statement.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Unused Import: UserRole in Login.tsx',
    body: `### Overview\n\`UserRole\` is imported from \`../types/index\` but never used in \`Login.tsx\`.\n\n### Affected File\n- \`frontend/src/pages/Login.tsx\` (line 4)\n\n### Recommended Fix\nRemove unused \`UserRole\` from import statement.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: Code Duplication: formatRupiah in LandlordDashboard',
    body: `### Overview\n\`formatRupiah\` is declared as an inline helper inside \`LandlordDashboard.tsx\`.\n\n### Affected File\n- \`frontend/src/pages/LandlordDashboard.tsx\` (line 429)\n\n### Recommended Fix\nImport shared \`formatRupiah\` utility from \`frontend/src/utils/format.ts\`.`,
    labels: ['enhancement']
  },
  {
    title: '🧪 Testing: Missing Catch Test for Language Profile API Update',
    body: `### Overview\nThe background language profile sync in \`LanguageContext.tsx\` has a \`.catch(() => {})\` branch that is not tested.\n\n### Affected Files\n- \`frontend/src/context/LanguageContext.tsx\` (line 324)\n- \`frontend/src/components/__tests__/context.test.tsx\`\n\n### Recommended Fix\nAdd a unit test simulating API failure on language update to verify silent fallback.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: High Code Complexity: initDb in Database Initialization',
    body: `### Overview\n\`initDb()\` in \`backend/db.ts\` spans ~260 lines and combines DDL, migrations, index checks, and 4 seed models.\n\n### Affected File\n- \`backend/db.ts\` (lines 119-379)\n\n### Recommended Fix\nDecompose \`initDb\` into modular helper functions (\`createTables\`, \`applyMigrations\`, \`seedDatabase\`).`,
    labels: ['enhancement']
  },
  {
    title: '⚡ Performance: Sequential Password Update Queries on Database Initialization',
    body: `### Overview\n\`initDb()\` iterates over existing users and executes \`UPDATE users SET password = ? WHERE id = ?\` sequentially.\n\n### Affected File\n- \`backend/db.ts\` (lines 326-334)\n\n### Recommended Fix\nBatch password migration updates or run them in parallel.`,
    labels: ['enhancement']
  },
  {
    title: '🧪 Testing: Missing Catch Test for Theme LocalStorage Access Error',
    body: `### Overview\n\`ThemeContext.tsx\` handles \`localStorage\` access in try/catch blocks, but there is no test verifying behavior when \`localStorage\` throws.\n\n### Affected Files\n- \`frontend/src/context/ThemeContext.tsx\` (lines 23, 38)\n- \`frontend/src/components/__tests__/context.test.tsx\`\n\n### Recommended Fix\nAdd a test mocking \`localStorage.getItem\` throwing an error to ensure graceful fallback to default theme.`,
    labels: ['enhancement']
  },
  {
    title: '🧪 Testing: Missing Serverless Middleware DB Error Catch Test',
    body: `### Overview\nThe serverless database readiness middleware returns 500 on failure, but this catch block is not tested.\n\n### Affected Files\n- \`backend/server.ts\` (lines 62-68)\n- \`tests/router.test.ts\`\n\n### Recommended Fix\nAdd an integration test covering database connection failure in the Express middleware.`,
    labels: ['enhancement']
  },
  {
    title: '🧪 Testing: Missing Catch Test for PDF Document Error Stream',
    body: `### Overview\n\`generateRentalContractPdf()\` registers \`doc.on(\"error\", reject)\`, but stream errors are not tested in \`tests/contract.test.ts\`.\n\n### Affected Files\n- \`backend/services/contract.ts\` (line 54)\n- \`tests/contract.test.ts\`\n\n### Recommended Fix\nAdd a test case verifying promise rejection when the PDFKit stream encounters an error.`,
    labels: ['enhancement']
  },
  {
    title: '🧩 Code Health: High Code Complexity: normalizePropertySummary',
    body: `### Overview\n\`normalizePropertySummary\` and \`normalizeProperty\` in \`backend/router.ts\` handle several manual type casts and fallbacks inline.\n\n### Affected File\n- \`backend/router.ts\` (lines 496-517)\n\n### Recommended Fix\nExtract property normalization and response sanitization to a dedicated data transformer module.`,
    labels: ['enhancement']
  },
  {
    title: '🛡️ Security & Privacy: Involuntary Notification Setting Reset on Partial Profile Update',
    body: `### Overview\nIn \`PUT /api/users/profile/:id\` and \`PUT /api/auth/profile\`, \`notifVal\` defaults to \`1\` when \`notifications\` is undefined in the request body. If a user previously set notifications to disabled (\`0\`), updating any other field (e.g. phone or address) involuntarily resets notifications to enabled (\`1\`).\n\n### Affected File\n- \`backend/router.ts\` (lines 413, 486)\n\n### Recommended Fix\nUse \`notifications !== undefined ? (notifications ? 1 : 0) : null\` and \`notifications = COALESCE(?, notifications)\` in the SQL update statement to preserve existing user preference.`,
    labels: ['bug', 'security']
  },
  {
    title: '🛡️ Security & Financial Integrity: Guard Property Deletion Against Pending Rental Leases',
    body: `### Overview\n\`DELETE /api/properties/:id\` strictly checks for \`status = 'active'\` rentals, allowing deletion when there are \`pending\` rentals. If a tenant completes payment on a pending rental after property deletion, Midtrans webhook settlement will attempt to settle and activate a rental for a non-existent property.\n\n### Affected File\n- \`backend/router.ts\` (lines 895-905)\n\n### Recommended Fix\nExtend deletion guard to check \`status IN ('active', 'pending')\` to prevent orphaned payments.`,
    labels: ['bug', 'security']
  },
  {
    title: '⚡ Performance & Cache Integrity: Missing Rental Cache Invalidation on Rental Termination',
    body: `### Overview\n\`POST /api/rentals/:id/terminate\` calls \`apiCache.invalidatePattern('properties')\` but misses \`apiCache.invalidatePattern('rentals')\`, leaving stale rental statuses in API cache responses until TTL expires.\n\n### Affected File\n- \`backend/router.ts\` (line 2660)\n\n### Recommended Fix\nAdd \`apiCache.invalidatePattern('rentals')\` to the rental termination handler.`,
    labels: ['bug', 'performance']
  },
  {
    title: '⚖️ Legal & Audit Compliance: Persist Explicit terminated_at Timestamp for Tenancy Lifecycle',
    body: `### Overview\nWhen a rental is terminated, only the \`status\` column is updated to \`'terminated'\`. Lacking a \`terminated_at\` DATETIME audit column makes statutory dispute resolution and lease duration verification ambiguous under Indonesian Civil Code (KUHPerdata) and UU ITE standards.\n\n### Affected Files\n- \`backend/db.ts\`\n- \`backend/router.ts\` (\`POST /api/rentals/:id/terminate\`)\n- \`backend/types/index.ts\`\n\n### Recommended Fix\nAdd non-destructive migration \`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS terminated_at DATETIME NULL\` and populate \`terminated_at = NOW()\` on termination.`,
    labels: ['enhancement', 'legal']
  },
  {
    title: '⚡ Performance: Missing Composite Database Indexes on rentals Table for Status Filtering',
    body: `### Overview\n\`rentals\` queries frequently query by \`(propertyId, status)\` and \`(tenantId, status)\`. Under high concurrency and large rental history tables, these queries cause full table scans without composite indexes.\n\n### Affected File\n- \`backend/db.ts\` (\`ensureIndexes\`)\n\n### Recommended Fix\nAdd composite indexes \`idx_rentals_property_status (propertyId, status)\` and \`idx_rentals_tenant_status (tenantId, status)\` during schema initialization.`,
    labels: ['performance', 'enhancement']
  },
  {
    title: '🧩 Code Health: Extract Shared User Formatter to Transformers Service',
    body: `### Overview\n\`formatSafeUser\` is declared as a local helper in \`backend/router.ts\` rather than being shared through \`backend/services/transformers.ts\` alongside other domain sanitizers.\n\n### Affected Files\n- \`backend/router.ts\`\n- \`backend/services/transformers.ts\`\n\n### Recommended Fix\nMove \`formatSafeUser\` to \`backend/services/transformers.ts\` with strict typing and unit test coverage.`,
    labels: ['enhancement']
  },
  {
    title: '🧪 Testing: Adversarial Concurrent Booking Overbooking Race Condition Test',
    body: `### Overview\nWhile transaction locking (\`SELECT ... FOR UPDATE\`) is implemented for room allocations in \`settleRentalPayment\`, there is no explicit concurrency test simulating two simultaneous payments competing for the last remaining room.\n\n### Affected File\n- \`tests/perf_api.test.ts\` / \`tests/challenger_m3_rbac.test.ts\`\n\n### Recommended Fix\nAdd an adversarial integration test asserting that when 2 concurrent settlement requests compete for 1 remaining room, exactly one succeeds (200) and the other is safely rejected (409 Overbooking).`,
    labels: ['testing', 'security']
  }
];

async function createIssues() {
  console.log(`Starting creation of ${allIssues.length} issues on ${REPO}...`);
  const created = [];
  for (let i = 0; i < allIssues.length; i++) {
    const issue = allIssues[i];
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'node',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(issue)
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[${i + 1}/${allIssues.length}] Created Issue #${data.number}: ${issue.title}`);
        created.push({ number: data.number, title: issue.title, url: data.html_url });
      } else {
        console.error(`[${i + 1}/${allIssues.length}] Failed to create "${issue.title}":`, data.message || data);
      }
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.error(`[${i + 1}/${allIssues.length}] Network error on "${issue.title}":`, e.message);
    }
  }
  console.log(`\n🎉 Completed! Successfully created ${created.length} issues.`);
}

createIssues();
