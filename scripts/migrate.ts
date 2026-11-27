import { pool, createTables, applyMigrations, SCHEMA_MIGRATION_VERSION } from '../backend/db';

async function runMigrate() {
  console.log(`[db:migrate] Running schema migrations up to version ${SCHEMA_MIGRATION_VERSION}...`);
  try {
    await createTables(pool);
    await applyMigrations(pool);
    console.log(`[db:migrate] Successfully applied schema version ${SCHEMA_MIGRATION_VERSION}.`);
  } catch (err) {
    console.error('[db:migrate] Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

void runMigrate();
