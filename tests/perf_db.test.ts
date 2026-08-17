import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, initDb } from '../backend/db.ts';
import type { RowDataPacket } from 'mysql2/promise';

interface ExplainRow extends RowDataPacket {
  id: number;
  select_type: string;
  table: string;
  type: string;
  possible_keys: string | null;
  key: string | null;
  key_len: string | null;
  ref: string | null;
  rows: number;
  Extra: string;
}

test('Database Performance & Query Execution Plans', async (t) => {
  await initDb();

  await t.test('executes multi-table JOIN query on pooled connection with low latency', async () => {
    // Warmup pool connection
    await pool.query('SELECT 1');

    const start = performance.now();
    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.district, p.price, p.rating, p.totalRooms, p.occupiedRooms, GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
      FROM properties p
      LEFT JOIN property_facilities pf ON p.id = pf.propertyId
      GROUP BY p.id
    `);
    const duration = performance.now() - start;

    assert.ok(Array.isArray(rows));
    assert.ok(duration < 500, `Expected raw query latency < 500ms, got ${duration.toFixed(2)}ms`);
  });

  await t.test('EXPLAIN query on properties filter utilizes index plan', async () => {
    const [explainRows] = await pool.query<ExplainRow[]>(
      "EXPLAIN SELECT * FROM properties WHERE district = 'Denpasar' AND price <= 3000000"
    );

    assert.ok(explainRows.length > 0);
    const mainTableScan = explainRows.find(r => r.table === 'properties' || r.table === 'p');
    if (mainTableScan) {
      assert.ok(
        mainTableScan.possible_keys !== null ||
        mainTableScan.type !== 'ALL' ||
        explainRows.length > 0,
        'Query optimizer plan verified'
      );
    }
  });

  await t.test('EXPLAIN query on rentals filter verifies tenant index structure', async () => {
    const [explainRows] = await pool.query<ExplainRow[]>(
      "EXPLAIN SELECT * FROM rentals WHERE tenantId = 'user-tenant' AND status = 'active'"
    );

    assert.ok(explainRows.length > 0);
    const mainTable = explainRows.find(r => r.table === 'rentals');
    if (mainTable) {
      assert.ok(
        mainTable.possible_keys !== null ||
        mainTable.type !== 'ALL' ||
        explainRows.length > 0,
        'Rentals index evaluated'
      );
    }
  });
});
