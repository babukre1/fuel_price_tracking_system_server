# FuelTrack - Backend API

Node.js/Express REST API powering the Fuel Price Tracking System for Mogadishu, Somalia. Serves both the Flutter supplier mobile app and the React admin dashboard.

## Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** + **Express 5** | Server framework |
| **MongoDB** + **Mongoose 9** | Database & ODM |
| **JWT** + **bcryptjs** | Authentication |
| **Zod** | Input validation |
| **Multer** | File uploads |
| **AWS SDK v3 S3** | Cloudflare R2 storage |

## Features

- **Admin Module** — Signup, login (rate-limited), CRUD, password changes
- **Supplier Module** — Registration (PENDING status), login with status checks, profile CRUD, file uploads to Cloudflare R2, device tokens for push notifications
- **Station Module** — CRUD, geospatial nearby search (`$nearSphere`), activate/deactivate, supplier access control
- **Fuel Price Module** — CRUD, bulk creation, atomic v2 price set with transactions, price history, fat-finger detection (flags prices >5x or <1/5 of previous)
- **Customer Module** — Registration, login, profile CRUD, location updates with GeoJSON
- **Supplier Reports** — Stations, prices, price history, flagged changes, follower analytics

## API Endpoints

### Authentication
| Endpoint | Method | Auth |
|---|---|---|
| `/api/v1/admin/signup` | POST | Public |
| `/api/v1/admin/login` | POST | Public |
| `/api/v1/supplier/signup` | POST | Public |
| `/api/v1/supplier/login` | POST | Public |
| `/api/v1/supplier/verify-email` | POST | Public |
| `/api/v1/supplier/resend-verification` | POST | Public |
| `/api/v1/users/register` | POST | Public |
| `/api/v1/users/login` | POST | Public |
| `/api/v1/users/verify-email` | POST | Public |
| `/api/v1/users/resend-verification` | POST | Public |

New mobile signups receive a six-digit code that expires after 15 minutes.
Verification accepts `{"email":"person@example.com","code":"123456"}`;
resending accepts `{"email":"person@example.com"}`. Codes allow five attempts
and can be resent after 60 seconds. Existing accounts remain verified.
Supplier email verification does not replace administrator approval.

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the backend environment.
Create an API key in the Resend dashboard, verify a sending domain there,
add the DNS records Resend supplies, then use an address on that domain for
`RESEND_FROM_EMAIL`. Keep the API key on the backend only.

### Admin
| Endpoint | Method | Role |
|---|---|---|
| `/api/v1/admin/users` | GET / POST | Admin |
| `/api/v1/admin/users/:id` | PATCH | Admin |
| `/api/v1/admin/users/:id/password` | PATCH | Admin |

### Suppliers
| Endpoint | Method | Role |
|---|---|---|
| `/api/v1/supplier/profile` | GET / PATCH | Supplier |
| `/api/v1/supplier/change-password` | PUT | Supplier |
| `/api/v1/supplier/device-token` | POST / DELETE | Supplier |
| `/api/v1/supplier` | GET / POST | Admin |
| `/api/v1/supplier/:id` | GET / PATCH / DELETE | Admin |

### Supplier Reports
| Endpoint | Role |
|---|---|
| `/api/v1/supplier/reports/my-stations` | Supplier |
| `/api/v1/supplier/reports/my-prices` | Supplier |
| `/api/v1/supplier/reports/price-history` | Supplier |
| `/api/v1/supplier/reports/flagged-changes` | Supplier |
| `/api/v1/supplier/reports/followers` | Supplier |

### Stations
| Endpoint | Method | Role |
|---|---|---|
| `/api/v1/stations` | POST / GET | Supplier/Admin |
| `/api/v1/stations/nearby` | GET | Public |
| `/api/v1/stations/:id` | GET / PATCH / DELETE | Supplier/Admin |
| `/api/v1/stations/:id/activate` | PATCH | Admin |
| `/api/v1/stations/:id/deactivate` | PATCH | Admin |

### Fuel Prices
| Endpoint | Method | Role |
|---|---|---|
| `/api/v1/fuel-prices/stations/:stationId` | POST / GET | Supplier/Admin |
| `/api/v1/fuel-prices/stations/:stationId/current` | GET | Supplier/Admin |
| `/api/v1/fuel-prices/v2/stations/:stationId` | POST | Supplier/Admin |
| `/api/v1/fuel-prices/bulk` | POST | Supplier/Admin |
| `/api/v1/fuel-prices/:id` | PATCH / DELETE | Supplier/Admin |
| `/api/v1/fuel-prices` | GET | Supplier/Admin |

### Customers
| Endpoint | Method | Role |
|---|---|---|
| `/api/v1/users/profile` | GET / PATCH | User |
| `/api/v1/users/change-password` | PATCH | User |
| `/api/v1/users/location` | PATCH | User |
| `/api/v1/users` | GET / POST | Admin |
| `/api/v1/users/:id` | GET / PATCH / DELETE | Admin |

### Health
| `/api/v1/health` | GET | Public |

## Architecture

```
├── app.js                  # Express setup (CORS, JSON, routes)
├── service.js              # Server entry (MongoDB connect, listen)
├── config/r2.js            # Cloudflare R2 S3 client
├── middleware/
│   ├── authenticate.js     # JWT verification (role-based)
│   ├── validate.js         # Zod schema validation
│   └── uploadImage.js      # Multer config (memory storage)
├── admin/                  # Admin module (model, routes, controller)
├── supplier/               # Supplier module (model, schemas, routes, controller)
├── station/                # Station module (model, schemas, routes, controller)
├── fuelPrice/              # Fuel price module (models, routes, controllers)
└── User/                   # Customer module (model, routes, controller)
```

## Getting Started

```bash
npm install
cp .env.example .env   # Configure environment variables
npm run dev            # or: node service.js
```

### Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 5000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public URL base |

## Architectural Decisions

- **JWT roles** — Tokens contain `{ id, role }` with roles: `admin`, `supplier`, `user`
- **Atomic prices** — Mongoose transactions close old + create new current price atomically
- **Fat-finger detection** — Flags price changes >5x or <1/5 of previous value
- **Dual price collections** — `FuelPrice` (full history + actor tracking) + `StationCurrentPrice` (lightweight denormalized current price)
