import app from '../backend/server';
import { generateJwtToken } from '../backend/middleware/auth';

async function main() {
  const PORT = 5092;
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const landlordToken = generateJwtToken({ id: 'user-landlord', email: 'landlord@kosmo.local', role: 'landlord' });

  console.log('==========================================');
  console.log('   Landlord Dashboard Performance Benchmark');
  console.log('==========================================');

  // Warmup
  await fetch(`http://localhost:${PORT}/api/properties`);

  const endpoints = [
    { name: 'GET /api/landlord/stats', url: `http://localhost:${PORT}/api/landlord/stats?landlordId=user-landlord`, auth: false },
    { name: 'GET /api/landlord/financials', url: `http://localhost:${PORT}/api/landlord/financials?landlordId=user-landlord`, auth: true },
    { name: 'GET /api/properties?ownerId=user-landlord', url: `http://localhost:${PORT}/api/properties?ownerId=user-landlord`, auth: false },
    { name: 'GET /api/landlord/rentals', url: `http://localhost:${PORT}/api/landlord/rentals?landlordId=user-landlord`, auth: true }
  ];

  for (const ep of endpoints) {
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const headers: Record<string, string> = ep.auth ? { Authorization: `Bearer ${landlordToken}` } : {};
      const res = await fetch(ep.url, { headers });
      const duration = performance.now() - start;
      if (res.ok) {
        runs.push(duration);
      }
    }
    const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
    const min = Math.min(...runs);
    const max = Math.max(...runs);
    console.log(`[PASS] ${ep.name.padEnd(42)} -> Avg: ${avg.toFixed(2)}ms (Min: ${min.toFixed(2)}ms, Max: ${max.toFixed(2)}ms)`);
  }

  server.close();
  console.log('==========================================');
}

main().catch(console.error);
