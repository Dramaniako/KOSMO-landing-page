import { pool, ensureDbReady } from '../backend/db';
import type { RowDataPacket } from 'mysql2/promise';

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  district: string;
  totalRooms: number;
  occupiedRooms: number;
}

interface RentalCountRow extends RowDataPacket {
  propertyId: string;
  activeCount: number;
}

async function checkPropertyOccupancy(): Promise<void> {
  console.log('==============================================');
  console.log(' 🔍 Property Room Occupancy & Rental Integrity');
  console.log('==============================================');

  await ensureDbReady();

  try {
    const [properties] = await pool.query<PropertyRow[]>(
      'SELECT id, name, district, totalRooms, occupiedRooms FROM properties ORDER BY name ASC'
    );

    const [rentalCounts] = await pool.query<RentalCountRow[]>(
      "SELECT propertyId, COUNT(*) AS activeCount FROM rentals WHERE status = 'active' GROUP BY propertyId"
    );

    const activeMap = new Map<string, number>();
    for (const r of rentalCounts) {
      activeMap.set(r.propertyId, Number(r.activeCount));
    }

    console.log(`Found ${properties.length} properties in database.\n`);

    let inconsistencies = 0;
    const report = properties.map((prop) => {
      const activeRentals = activeMap.get(prop.id) || 0;
      const isMismatch = prop.occupiedRooms !== activeRentals;
      const isOverCapacity = prop.occupiedRooms > prop.totalRooms;
      if (isMismatch || isOverCapacity) {
        inconsistencies++;
      }

      return {
        ID: prop.id,
        Name: prop.name.substring(0, 30),
        District: prop.district,
        TotalRooms: prop.totalRooms,
        OccupiedRooms: prop.occupiedRooms,
        ActiveRentals: activeRentals,
        Status: isOverCapacity ? '⚠️ OVER CAPACITY' : isMismatch ? '⚠️ MISMATCH' : '✅ OK'
      };
    });

    console.table(report);

    const shouldSync = process.argv.includes('--sync') || process.argv.includes('--fix');

    if (inconsistencies > 0) {
      if (shouldSync) {
        console.log('\n🔧 Synchronizing occupiedRooms to match active rentals count...');
        for (const prop of properties) {
          const activeRentals = activeMap.get(prop.id) || 0;
          if (prop.occupiedRooms !== activeRentals) {
            await pool.query('UPDATE properties SET occupiedRooms = ? WHERE id = ?', [
              activeRentals,
              prop.id
            ]);
            console.log(`Synced property ${prop.id} (${prop.name}) -> occupiedRooms set to ${activeRentals}`);
          }
        }
        console.log('✅ Synchronization complete.');
      } else {
        console.warn(`\n⚠️ Found ${inconsistencies} property integrity warning(s). Run with --sync to auto-fix.`);
      }
    } else {
      console.log('\n✅ All property occupancy counts are perfectly consistent with active rentals!');
    }

    console.log('==============================================');
  } catch (err) {
    console.error('❌ Error checking property occupancy:', err);
  } finally {
    process.exit(0);
  }
}

checkPropertyOccupancy().catch((err) => {
  console.error('Fatal occupancy check error:', err);
  process.exit(1);
});
