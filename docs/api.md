# KOSMO REST API Documentation

All API endpoints are served under the `/api` prefix and communicate using JSON payloads (except binary downloads).

---

## 1. Authentication & Security Headers

### Authorization Header
Protected routes require a JSON Web Token (JWT) supplied in the standard `Authorization` header:

```http
Authorization: Bearer <jwt_token>
```

### Short-Lived Download Tokens
For browser file downloads (Excel sheets or PDF leases), client applications may either:
1. Fetch the file via authenticated `fetch()` requesting a binary `Blob`, or
2. Request a 60-second single-use download token via `POST /api/reports/download-token` and pass `?downloadToken=<token>` in the download request.

---

## 2. Endpoints Reference

### Authentication & Profiles

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns user profile with signed 7d JWT |
| `POST` | `/api/auth/register` | Public | Creates a new user account (`tenant` role by default) |
| `POST` | `/api/auth/verify-password` | Protected | Password confirmation gate required before executing destructive actions |
| `GET` | `/api/auth/me` | Protected | Returns claims and verified user profile for the current authenticated token |
| `GET` | `/api/users/profile/:id` | Protected | Retrieves full profile details for user `id` (restricted to self or admin) |
| `PUT` | `/api/users/profile/:id` | Protected | Updates profile, KYC identity fields (NIK / Passport), and emergency contact |
| `PUT` | `/api/auth/profile` | Protected | Updates preferences (language: `id`/`en`, notifications toggle) |

#### `POST /api/auth/login`
**Request Body:**
```json
{
  "email": "landlord@kosmo.com",
  "password": "landlordPassword123"
}
```
**Response (200 OK):**
```json
{
  "message": "Login berhasil!",
  "user": {
    "id": "user-landlord",
    "email": "landlord@kosmo.com",
    "name": "Admin Landlord",
    "role": "landlord",
    "phone": "+62 811-2233-4455"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Properties & Listings

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/properties` | Public | Retrieves listings with filters (`district`, `priceMin`, `priceMax`, `q`) |
| `GET` | `/api/properties/:id` | Public | Retrieves detailed property profile including facilities and owner info |
| `POST` | `/api/properties` | Landlord / Admin | Creates a new property listing with facilities |
| `PUT` | `/api/properties/:id` | Landlord / Admin | Updates property details, price, or capacity (restricted to owner or admin) |
| `DELETE`| `/api/properties/:id` | Landlord / Admin | Deletes property (requires password verification & zero active tenancies) |

#### `GET /api/properties` Query Parameters:
- `district` *(optional, string)*: Filter by Bali district (`Denpasar`, `Badung`, `Gianyar`, `Tabanan`).
- `priceMin` *(optional, number)*: Lower bound monthly price in IDR.
- `priceMax` *(optional, number)*: Upper bound monthly price in IDR.
- `q` *(optional, string)*: Search keyword matching title, district, or address.

---

### Rooms & Inventory Allocation

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/properties/:id/rooms` | Public | Lists all rooms for property `id` with current occupancy status |
| `POST` | `/api/properties/:id/rooms` | Landlord / Admin | Adds a new room to property `id` (enforces total room capacity constraints) |
| `PUT` | `/api/properties/:id/rooms/:roomId` | Landlord / Admin | Updates room details, price, or status (`available`, `occupied`, `maintenance`) |
| `DELETE`| `/api/properties/:id/rooms/:roomId` | Landlord / Admin | Deletes room (requires password verification; rejects if currently occupied) |

---

### Leases & Digital Contracts

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tenant/rentals` | Tenant | Retrieves active and past leases for the authenticated tenant |
| `POST` | `/api/rentals` | Tenant | Creates a new rental agreement with digital canvas signature |
| `POST` | `/api/rentals/:id/terminate` | Tenant / Admin | Terminates rental with password verification and releases occupancy |
| `GET` | `/api/rentals/:id/contract` | Protected | Generates and streams bilingual PDF lease agreement with embedded signature |
| `POST` | `/api/contracts/preview` | Public / Tenant | Generates preview PDF buffer without saving to database |

---

### Payments (Midtrans Snap)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/payment/token` | Tenant | Enforces single active tenancy and generates Midtrans Snap token |
| `POST` | `/api/payment/webhook` | Public (Signed) | Asynchronous webhook notification validated via SHA-512 signature |

#### Midtrans Webhook Verification Formula:
$$\text{Signature} = \text{SHA-512}\left(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{MIDTRANS\_SERVER\_KEY}\right)$$

---

### Landlord Operations & Financial Ledgers

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/landlord/stats` | Landlord / Admin | Real-time occupancy metrics, room counts, and active lease totals |
| `GET` | `/api/landlord/financials`| Landlord / Admin | SQL-aggregated monthly revenue and transaction statistics |
| `GET` | `/api/landlord/rentals` | Landlord / Admin | Tenant roster with lease dates and emergency contact information |
| `POST` | `/api/withdraw` | Landlord / Admin | Requests payout with transactional deduction and row locking |
| `GET` | `/api/withdrawals/me` | Landlord / Admin | Payout history for authenticated landlord |
| `GET` | `/api/reports/landlord/excel`| Landlord / Admin | Streams `.xlsx` spreadsheet of landlord earnings and transactions |

---

### Admin Governance, Moderation & Audit Reports

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Admin | Global marketplace analytics (GMV, listings, user distributions) |
| `GET` | `/api/admin/users` | Admin | Full user registry with role filtering |
| `POST` | `/api/users` | Admin | Provision new user account directly |
| `PUT` | `/api/users/:id` | Admin | Modify user role, status, or contact details |
| `DELETE`| `/api/users/:id` | Admin | Delete user account (requires password; default admin protected) |
| `GET` | `/api/admin/withdrawals` | Admin | Audit queue of all pending and completed payout requests |
| `POST` | `/api/admin/withdrawals/:id/process` | Admin | Approves withdrawal and records external bank reference ID |
| `POST` | `/api/admin/withdrawals/:id/reject` | Admin | Rejects withdrawal and atomically refunds balance to landlord |
| `GET` | `/api/admin/tracking-history` | Admin | Visual traffic logs aggregated by 24h, 7d, and 30d windows |
| `GET` | `/api/reports/tracking/excel` | Admin | Streams `.xlsx` spreadsheet of visitor traffic and marketplace summary |
| `POST` | `/api/reports/download-token` | Protected | Issues 60-second download token for secure direct file links |

---

## 3. Standard HTTP Status Codes

- `200 OK`: Request succeeded with returned data payload.
- `201 Created`: Resource successfully created (e.g. user registration, rental created).
- `400 Bad Request`: Validation failure (malformed Zod body, missing required fields).
- `401 Unauthorized`: Authentication missing, expired token, or invalid password gate.
- `403 Forbidden`: Token valid but role does not possess permissions for this resource.
- `404 Not Found`: Target entity does not exist in the database.
- `409 Conflict`: Business rule violation (e.g. active tenancy conflict, deleting property with active lease).
- `429 Too Many Requests`: Rate limit exceeded (auth limiter: 20 req/15 min, tracking limiter: 60 req/min).
- `500 Internal Server Error`: Unhandled server exception (logged with structured stack trace).
