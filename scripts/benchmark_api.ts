process.env.NO_LISTEN = 'true';
import app from '../backend/server.ts';

async function main() {
  const PORT = 5055;
  const server = app.listen(PORT, async () => {
    try {
      console.log(`Benchmark test server running on port ${PORT}`);

      // Warmup request
      await fetch(`http://localhost:${PORT}/api/properties`);

      // Benchmark consecutive requests
      const times: number[] = [];
      let totalBytes = 0;

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await fetch(`http://localhost:${PORT}/api/properties`);
        const text = await res.text();
        const duration = performance.now() - start;
        times.push(duration);
        totalBytes = Buffer.byteLength(text, 'utf8');
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log('====================================');
      console.log('API Performance Benchmark Results:');
      console.log('====================================');
      console.log(`Endpoint:        GET /api/properties`);
      console.log(`Payload Size:    ${(totalBytes / 1024).toFixed(2)} KB`);
      console.log(`Average Latency: ${avgTime.toFixed(2)} ms`);
      console.log(`Min Latency:     ${minTime.toFixed(2)} ms`);
      console.log(`Max Latency:     ${maxTime.toFixed(2)} ms`);
      console.log('====================================');

      if (avgTime > 300) {
        console.warn(`⚠️ Warning: Average latency ${avgTime.toFixed(2)}ms is above 300ms SLA.`);
      } else {
        console.log(`✅ SLA Met: Average latency ${avgTime.toFixed(2)}ms is well under 300ms!`);
      }
    } catch (err) {
      console.error('Benchmark error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

main();
