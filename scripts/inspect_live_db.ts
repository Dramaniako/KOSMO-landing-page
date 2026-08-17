import { pool } from '../backend/db';

async function main() {
  console.log('=== Inspecting Connected Database ===');
  console.log('Host:', process.env.DB_HOST);
  console.log('Database:', process.env.DB_NAME);
  console.log('User:', process.env.DB_USER);

  try {
    const [properties] = await pool.query('SELECT id, name, district, price, totalRooms, occupiedRooms FROM properties');
    console.log('\n--- Properties in DB ---');
    console.table(properties);

    const [kosTes] = await pool.query("SELECT * FROM properties WHERE name LIKE '%kos tes%' OR name LIKE '%tes%'");
    console.log('\n--- Search for "kos tes" or "tes" ---');
    console.log(kosTes);

    const [users] = await pool.query('SELECT id, email, role, name FROM users');
    console.log('\n--- Users in DB ---');
    console.table(users);

    const [reviews] = await pool.query('SELECT id, propertyId, propertyName, userName, rating, comment FROM reviews');
    console.log('\n--- Reviews in DB ---');
    console.table(reviews);
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    process.exit(0);
  }
}

main();
