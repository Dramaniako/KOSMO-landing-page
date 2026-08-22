import { pool, ensureDbReady } from '../backend/db';
import type { RowDataPacket } from 'mysql2/promise';

interface IndexRow extends RowDataPacket {
  Table: string;
  Key_name: string;
  Column_name: string;
  Non_unique: number;
  Seq_in_index: number;
}

async function checkDatabaseIndexes(): Promise<void> {
  console.log('==============================================');
  console.log(' 🔍 KOSMO Database Table Indexes Audit');
  console.log('==============================================');

  await ensureDbReady();

  const domainTables = [
    'users',
    'properties',
    'property_facilities',
    'reviews',
    'withdrawals',
    'visitor_tracking',
    'rentals'
  ];

  for (const tableName of domainTables) {
    try {
      const [indexes] = await pool.query<IndexRow[]>(`SHOW INDEX FROM \`${tableName}\``);
      console.log(`\n📋 Table [${tableName}] (${indexes.length} index keys):`);
      const summary = indexes.map((idx) => ({
        Table: idx.Table,
        Key_name: idx.Key_name,
        Column_name: idx.Column_name,
        Unique: idx.Non_unique === 0 ? 'YES' : 'NO'
      }));
      console.table(summary);
    } catch (err) {
      console.error(`❌ Failed to fetch indexes for table ${tableName}:`, err);
    }
  }

  console.log('\n==============================================');
  console.log('✅ Index audit completed successfully.');
  console.log('==============================================');
  process.exit(0);
}

checkDatabaseIndexes().catch((err) => {
  console.error('Fatal index audit error:', err);
  process.exit(1);
});
