(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import {
  validateMaintenanceTicket,
  VALID_TICKET_CATEGORIES,
  VALID_TICKET_STATUSES,
  type MaintenanceTicket,
  type TicketCategory,
  type TicketStatus
} from '../backend/types/index';
import { createTicketSchema, updateTicketStatusSchema } from '../backend/middleware/validation';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';

test('Tenant Maintenance Ticket System & RBAC Test Suite', async (t) => {
  // =========================================================================
  // Section 1: Zod Schema and Domain Validator Tests
  // =========================================================================
  await t.test('1.1 validates complete MaintenanceTicket entity using validator', () => {
    const validTicket: MaintenanceTicket = {
      id: 'ticket-01',
      rentalId: 'rent-01',
      tenantId: 'user-tenant',
      propertyId: 'prop-01',
      roomId: 'room-101',
      category: 'ac',
      title: 'AC tidak dingin dan menetes',
      description: 'AC meneteskan air sejak kemarin malam di area kasur.',
      photoUrl: 'https://example.com/ac-leak.jpg',
      status: 'open',
      createdAt: new Date().toISOString()
    };

    const result = validateMaintenanceTicket(validTicket);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('1.2 validateMaintenanceTicket rejects missing or malformed fields', () => {
    const invalidTicket = {
      id: '',
      rentalId: '   ',
      tenantId: '',
      propertyId: '',
      category: 'roofing', // invalid category
      title: 'a', // too short (< 3)
      description: 'bad', // too short (< 5)
      status: 'completed' // invalid status ('resolved' is valid)
    };

    const result = validateMaintenanceTicket(invalidTicket);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('id')));
    assert.ok(result.errors.some(e => e.includes('rentalId')));
    assert.ok(result.errors.some(e => e.includes('tenantId')));
    assert.ok(result.errors.some(e => e.includes('propertyId')));
    assert.ok(result.errors.some(e => e.includes('category')));
    assert.ok(result.errors.some(e => e.includes('title')));
    assert.ok(result.errors.some(e => e.includes('description')));
    assert.ok(result.errors.some(e => e.includes('status')));
  });

  await t.test('1.3 createTicketSchema validates input with Zod and enforces valid categories', () => {
    for (const cat of VALID_TICKET_CATEGORIES) {
      const parsed = createTicketSchema.safeParse({
        rentalId: 'rent-101',
        category: cat,
        title: `Pengecekan fasilitas ${cat}`,
        description: `Deskripsi kendala fasilitas ${cat} secara mendalam.`
      });
      assert.equal(parsed.success, true, `Category "${cat}" must be accepted by Zod schema`);
    }

    const badCategory = createTicketSchema.safeParse({
      rentalId: 'rent-101',
      category: 'invalid_cat',
      title: 'Kendala AC',
      description: 'Deskripsi kendala fasilitas.'
    });
    assert.equal(badCategory.success, false);
  });

  await t.test('1.4 updateTicketStatusSchema strictly accepts only valid ticket statuses', () => {
    for (const st of VALID_TICKET_STATUSES) {
      const parsed = updateTicketStatusSchema.safeParse({ status: st });
      assert.equal(parsed.success, true, `Status "${st}" must be accepted by update schema`);
    }

    const badStatus = updateTicketStatusSchema.safeParse({ status: 'done' });
    assert.equal(badStatus.success, false);
  });

  // =========================================================================
  // Section 2: HTTP Integration & RBAC Verification
  // =========================================================================
  await t.test('Section 2: API Endpoints & Role-Scoped Access', async (t2) => {
    await ensureDbReady();

    const app = express();
    app.use(bodyParser.json());
    app.use('/api', router);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    const tag = `tkt-${Date.now()}`;
    const landlordId = `user-ll-${tag}`;
    const otherLandlordId = `user-ll2-${tag}`;
    const adminId = `user-adm-${tag}`;
    const tenantId = `user-ten1-${tag}`;
    const otherTenantId = `user-ten2-${tag}`;

    const propId = `prop-${tag}`;
    const roomId = `room-${tag}`;
    const activeRentalId = `rent-act-${tag}`;
    const terminatedRentalId = `rent-term-${tag}`;

    const landlordToken = generateJwtToken({ id: landlordId, email: `ll-${tag}@kosmo.test`, role: 'landlord' });
    const otherLandlordToken = generateJwtToken({ id: otherLandlordId, email: `ll2-${tag}@kosmo.test`, role: 'landlord' });
    const adminToken = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });
    const tenantToken = generateJwtToken({ id: tenantId, email: `ten1-${tag}@kosmo.test`, role: 'tenant' });
    const otherTenantToken = generateJwtToken({ id: otherTenantId, email: `ten2-${tag}@kosmo.test`, role: 'tenant' });

    const passwordHash = bcrypt.hashSync('Password123!', 10);

    // Setup DB fixtures
    await pool.query(
      `INSERT INTO users (id, name, email, password, role) VALUES
       (?, 'Landlord Satu', ?, ?, 'landlord'),
       (?, 'Landlord Dua', ?, ?, 'landlord'),
       (?, 'Super Admin', ?, ?, 'admin'),
       (?, 'Tenant Satu', ?, ?, 'tenant'),
       (?, 'Tenant Dua', ?, ?, 'tenant')`,
      [
        landlordId, `ll-${tag}@kosmo.test`, passwordHash,
        otherLandlordId, `ll2-${tag}@kosmo.test`, passwordHash,
        adminId, `adm-${tag}@kosmo.test`, passwordHash,
        tenantId, `ten1-${tag}@kosmo.test`, passwordHash,
        otherTenantId, `ten2-${tag}@kosmo.test`, passwordHash
      ]
    );

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'KOSMO Sanur Suite', 'Denpasar', 'Jl. Danau Tamblingan No. 10', 3000000, 5, 1, ?)`,
      [propId, landlordId]
    );

    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
       VALUES (?, ?, '101', 1, 'Standard', 'occupied')`,
      [roomId, propId]
    );

    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, roomId, price, startDate, status) VALUES
       (?, ?, ?, 'KOSMO Sanur Suite', ?, 3000000, '2026-09-01', 'active'),
       (?, ?, ?, 'KOSMO Sanur Suite', ?, 3000000, '2026-08-01', 'terminated')`,
      [activeRentalId, tenantId, propId, roomId, terminatedRentalId, tenantId, propId, roomId]
    );

    let createdTicketId = '';

    t2.after(async () => {
      server.close();
      try {
        await pool.query('DELETE FROM maintenance_tickets WHERE rentalId IN (?, ?) OR propertyId = ?', [
          activeRentalId,
          terminatedRentalId,
          propId
        ]);
        await pool.query('DELETE FROM rentals WHERE id IN (?, ?)', [activeRentalId, terminatedRentalId]);
        await pool.query('DELETE FROM rooms WHERE id = ?', [roomId]);
        await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
        await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)', [
          landlordId,
          otherLandlordId,
          adminId,
          tenantId,
          otherTenantId
        ]);
      } catch (err) {
        console.warn('Cleanup warning:', err);
      }
    });

    // 2.1 Unauthenticated requests rejected with 401
    await t2.test('2.1 rejects unauthenticated ticket requests with 401', async () => {
      const resPost = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentalId: activeRentalId, category: 'ac', title: 'AC bocor', description: 'Air menetes' })
      });
      assert.equal(resPost.status, 401);

      const resGet = await fetch(`${baseUrl}/tickets`);
      assert.equal(resGet.status, 401);

      const resPatch = await fetch(`${baseUrl}/tickets/dummy-id/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' })
      });
      assert.equal(resPatch.status, 401);
    });

    // 2.2 Landlord cannot submit ticket (only tenant or admin)
    await t2.test('2.2 rejects landlord attempting to submit tenant maintenance ticket with 403', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({
          rentalId: activeRentalId,
          category: 'ac',
          title: 'AC bocor',
          description: 'Air menetes di kamar'
        })
      });
      assert.equal(res.status, 403);
    });

    // 2.3 Tenant cannot submit for another tenant's rental
    await t2.test('2.3 rejects tenant submitting ticket for another tenant rental with 403', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherTenantToken}`
        },
        body: JSON.stringify({
          rentalId: activeRentalId,
          category: 'plumbing',
          title: 'Kran bocor',
          description: 'Air mengalir terus'
        })
      });
      assert.equal(res.status, 403);
    });

    // 2.4 Tenant cannot submit for terminated/inactive rental
    await t2.test('2.4 rejects ticket submission for terminated rental with 400', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({
          rentalId: terminatedRentalId,
          category: 'wifi',
          title: 'WiFi lambat',
          description: 'Internet tidak bisa browsing'
        })
      });
      assert.equal(res.status, 400);
    });

    // 2.5 Tenant successfully submits ticket for active rental
    await t2.test('2.5 allows tenant to submit ticket with 201 and initial status "open"', async () => {
      const res = await fetch(`${baseUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({
          rentalId: activeRentalId,
          category: 'ac',
          title: 'AC kamar 101 tidak dingin',
          description: 'AC hanya mengeluarkan angin biasa tanpa hembusan dingin.',
          photoUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a'
        })
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as MaintenanceTicket;
      assert.ok(data.id.startsWith('ticket-'));
      assert.equal(data.status, 'open');
      assert.equal(data.category, 'ac');
      assert.equal(data.title, 'AC kamar 101 tidak dingin');
      assert.equal(data.propertyId, propId);
      assert.equal(data.tenantId, tenantId);
      assert.equal(data.propertyName, 'KOSMO Sanur Suite');
      assert.equal(data.roomNumber, '101');

      createdTicketId = data.id;
    });

    // 2.6 Role-scoped ticket retrieval
    await t2.test('2.6 GET /api/tickets correctly enforces role scoping', async () => {
      // Tenant 1 sees own ticket
      const resTen1 = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(resTen1.status, 200);
      const ten1Tickets = (await resTen1.json()) as MaintenanceTicket[];
      assert.ok(ten1Tickets.some(t => t.id === createdTicketId));

      // Tenant 2 does not see Tenant 1 ticket
      const resTen2 = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${otherTenantToken}` }
      });
      assert.equal(resTen2.status, 200);
      const ten2Tickets = (await resTen2.json()) as MaintenanceTicket[];
      assert.equal(ten2Tickets.some(t => t.id === createdTicketId), false);

      // Landlord 1 owns propId -> sees ticket
      const resLl1 = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${landlordToken}` }
      });
      assert.equal(resLl1.status, 200);
      const ll1Tickets = (await resLl1.json()) as MaintenanceTicket[];
      assert.ok(ll1Tickets.some(t => t.id === createdTicketId));

      // Landlord 2 does NOT own propId -> does not see ticket
      const resLl2 = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${otherLandlordToken}` }
      });
      assert.equal(resLl2.status, 200);
      const ll2Tickets = (await resLl2.json()) as MaintenanceTicket[];
      assert.equal(ll2Tickets.some(t => t.id === createdTicketId), false);

      // Admin sees all tickets
      const resAdm = await fetch(`${baseUrl}/tickets`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resAdm.status, 200);
      const admTickets = (await resAdm.json()) as MaintenanceTicket[];
      assert.ok(admTickets.some(t => t.id === createdTicketId));
    });

    // 2.7 Status update permissions
    await t2.test('2.7 rejects status updates by tenant with 403', async () => {
      const res = await fetch(`${baseUrl}/tickets/${createdTicketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({ status: 'in_progress' })
      });
      assert.equal(res.status, 403);
    });

    await t2.test('2.8 rejects status updates by unauthorized landlord with 403', async () => {
      const res = await fetch(`${baseUrl}/tickets/${createdTicketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherLandlordToken}`
        },
        body: JSON.stringify({ status: 'in_progress' })
      });
      assert.equal(res.status, 403);
    });

    await t2.test('2.9 allows property landlord to transition ticket to "in_progress"', async () => {
      const res = await fetch(`${baseUrl}/tickets/${createdTicketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'in_progress' })
      });

      assert.equal(res.status, 200);
      const updated = (await res.json()) as MaintenanceTicket;
      assert.equal(updated.status, 'in_progress');
      assert.equal(updated.resolvedAt, null);
    });

    await t2.test('2.10 allows property landlord to transition ticket to "resolved" and populates resolvedAt', async () => {
      const res = await fetch(`${baseUrl}/tickets/${createdTicketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'resolved' })
      });

      assert.equal(res.status, 200);
      const updated = (await res.json()) as MaintenanceTicket;
      assert.equal(updated.status, 'resolved');
      assert.ok(updated.resolvedAt !== null && updated.resolvedAt !== undefined);
    });
  });
});
