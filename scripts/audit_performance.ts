process.env.NO_LISTEN = 'true';
import app from '../backend/server.ts';
import { generateJwtToken } from '../backend/middleware/auth.ts';

interface AuditResult {
  endpoint: string;
  category: string;
  status: number;
  latencyMs: number;
  payloadKb: number;
  compression: string;
  cacheControl: string;
}

async function runAudit() {
  const PORT = 5099;
  const server = app.listen(PORT, async () => {
    try {
      console.log(`Starting performance profiling on port ${PORT}...`);

      const adminToken = generateJwtToken({ id: 'user-admin', email: 'admin@kosmo.local', role: 'admin' });
      const tenantToken = generateJwtToken({ id: 'user-tenant', email: 'tenant@kosmo.local', role: 'tenant' });

      const endpoints = [
        { url: `http://localhost:${PORT}/api/properties`, name: 'GET /api/properties', category: 'Public Catalog', headers: {} },
        { url: `http://localhost:${PORT}/api/properties/prop-1`, name: 'GET /api/properties/:id', category: 'Public Catalog', headers: {} },
        { url: `http://localhost:${PORT}/api/reviews`, name: 'GET /api/reviews', category: 'Public Catalog', headers: {} },
        { url: `http://localhost:${PORT}/api/rentals`, name: 'GET /api/rentals', category: 'Tenant Dashboard', headers: { Authorization: `Bearer ${tenantToken}` } },
        { url: `http://localhost:${PORT}/api/admin/withdrawals`, name: 'GET /api/admin/withdrawals', category: 'Admin Dashboard', headers: { Authorization: `Bearer ${adminToken}` } },
        { url: `http://localhost:${PORT}/api/admin/stats`, name: 'GET /api/admin/stats', category: 'Admin Dashboard', headers: { Authorization: `Bearer ${adminToken}` } },
        { url: `http://localhost:${PORT}/api/admin/tracking-history`, name: 'GET /api/admin/tracking-history', category: 'Admin Dashboard', headers: { Authorization: `Bearer ${adminToken}` } },
      ];

      // Warmup
      await fetch(`http://localhost:${PORT}/api/properties`);

      const results: AuditResult[] = [];

      for (const ep of endpoints) {
        const start = performance.now();
        const res = await fetch(ep.url, {
          headers: {
            'Accept-Encoding': 'gzip, deflate, br',
            ...ep.headers
          }
        });
        const buffer = await res.arrayBuffer();
        const duration = performance.now() - start;

        results.push({
          endpoint: ep.name,
          category: ep.category,
          status: res.status,
          latencyMs: parseFloat(duration.toFixed(2)),
          payloadKb: parseFloat((buffer.byteLength / 1024).toFixed(2)),
          compression: res.headers.get('content-encoding') || 'none',
          cacheControl: res.headers.get('cache-control') || 'none'
        });
      }

      console.log('\n========================================================================================================================');
      console.log('                                     FULL-STACK PERFORMANCE & LATENCY PROFILING                                         ');
      console.log('========================================================================================================================');
      console.table(results);
      console.log('========================================================================================================================\n');

    } catch (err) {
      console.error('Audit profiling error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runAudit();
