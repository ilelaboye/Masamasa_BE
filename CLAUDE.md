# Masamasa Backend — Claude Context

## Project Overview

**Masamasa** is a multi-chain crypto wallet and fintech platform. Users can hold cryptocurrency across 7 blockchains, pay utility bills (airtime, data, electricity, TV), make P2P transfers, and withdraw to external wallets. Admins manage exchange rates, KYC verification, and wallet operations.

**Stack**: NestJS 10 · TypeScript 5 · PostgreSQL (TypeORM) · Redis (caching + Bull queues) · Node.js ≥ 20.18.1

---

## Directory Structure

```
src/
├── main.ts                         # Bootstrap: CORS, Helmet, compression, Swagger
├── app.module.ts                   # Root module
├── constants.ts                    # Cookie names, email template IDs
├── definitions.ts                  # Shared TypeScript types (UserRequest, AdminRequest)
├── validations.ts                  # Joi schema for required env vars
├── config/
│   ├── app.ts                      # Config factory (reads all env vars)
│   └── typeorm.config.ts           # TypeORM datasource (migrations, no synchronize)
├── core/
│   ├── utils/                      # Mailer, hashing, encryption helpers
│   ├── helpers/                    # Misc helpers
│   └── lib/                        # Shared library code
├── db/
│   ├── migrations/                 # TypeORM migrations (source of truth for schema)
│   └── seeds/                      # Database seeders
├── guards/
│   ├── auth.guard.ts               # User JWT + cookie guard
│   ├── admin-auth.guard.ts         # Admin JWT + cookie guard
│   └── decorator/                  # @CurrentUser, etc.
├── pipes/
│   └── joi.validation.pipe.ts      # Joi-based validation pipe
└── modules/
    ├── users/                      # Auth, profile, KYC, PIN, withdrawal
    ├── wallet/                     # Wallet addresses per user per chain
    ├── transactions/               # Transaction history
    ├── transfers/                  # P2P transfers
    ├── purchases/                  # Airtime, data, electricity, TV
    ├── web3/                       # Blockchain wallet generation, balance, sweep
    ├── administrator/              # Admin panel, logs, exchange rates
    ├── exchange-rates/             # Crypto/fiat exchange rate management
    ├── notifications/              # Push/in-app notifications
    └── global/
        ├── public/                 # Public routes + webhooks (Flutterwave, Nomba)
        ├── bank-verification/      # BVN/KYC via Prembly
        ├── beneficiaries/          # Saved bank beneficiaries
        ├── cache-container/        # Redis cache service wrapper
        ├── cloudinary/             # Image upload service
        ├── jobs/
        │   ├── cron/               # Scheduled jobs (balance sync, tx verification)
        │   └── scheduled-task/     # Bull queue task processors
        ├── filters/                # HttpExceptionFilter, GlobalExceptionFilter
        ├── interceptors/           # GlobalHTTPInterceptor (standardizes responses)
        └── logger/                 # Winston logger service
```

---

## Key Entities and Relationships

| Entity | Key Fields | Relations |
|---|---|---|
| `User` | email (unique), phone, password, pin, status (active/pending/archived), kyc_status | → Wallet (1:M), → Notification (1:M) |
| `Wallet` | network, currency, wallet_address (unique), user_id, status | → User (M:1) |
| `Transaction` | amount, dollar_amount, coin_amount, network, currency, status, mode (credit/debit), entity_type, masamasa_ref | → User (M:1), → ExchangeRate (M:1) |
| `Transfer` | user_id (sender), receiver_id, amount | — |
| `PurchaseRequest` | amount, total, commission, type (airtime/electricity_bill/tv_subscription/data), status, masamasa_ref (unique) | → User (M:1) |
| `Administrator` | email, password, roles (admin/system_admin/super_admin), status (active/suspend) | → AdminLogs (1:M) |
| `ExchangeRate` | currency (usdt/eth/usdc/btc/sol/bnb/doge/xrp/ada), rate, status | — |
| `Notification` | user_id, message, tag, is_read, metadata | → User (M:1) |
| `AdminLogs` | admin_id, user_id, entity, note, metadata | → Administrator (M:1) |
| `Beneficiary` | user_id, bank_code, bank_name, account_name, account_number | — |

**Soft deletes**: User, PurchaseRequest, Administrator use `deleted_at` (TypeORM `@DeleteDateColumn`).

---

## Authentication

**User auth**:
- JWT stored in encrypted HTTP-only cookie (`__8139a745d54__`)
- Guard: `AuthGuard` — decrypts cookie → verifies JWT → attaches `req.user`
- Cookie: `httpOnly, secure, sameSite: "none"`, expires 7 days
- Secret env vars: `JWT_SECRET`, `COOKIE_SECRET`

**Admin auth**:
- Same pattern, different cookie: `__18p36s745d09__`
- Guard: `AdminAuthGuard`

**Authenticated request types** (from `src/definitions.ts`):
```ts
UserRequest = Request & { user: User }
AdminRequest = Request & { admin: Administrator }
```

**Security middleware**: Helmet, ThrottlerGuard (50 req/min prod, 100 dev), CORS with `ALLOWED_ORIGINS`.

---

## Validation Pattern

Requests use Joi schemas, not class-validator DTOs:
```ts
@UsePipes(new JoiValidationPipe(SomeJoiSchema))
@Post('/endpoint')
async handler(@Body() body: SomeDto) { ... }
```

Each module has a `validations/` or `validation.ts` file with its Joi schemas.

---

## Response Format

Standardized by `GlobalHTTPInterceptor`:
```json
{ "data": { ... }, "message": "optional" }
```

---

## Web3 / Blockchain Integration

**Supported chains** and their libraries:

| Chain | Library | Mnemonic Env Var | RPC Env Var |
|---|---|---|---|
| EVM (BSC, ETH, Base, Polygon) | ethers.js | `MASTER_MNEMONIC` | `EVM_RPC_URL`, `ETH_RPC_URL`, `BASE_RPC_URL`, `POLY_RPC_URL` |
| Solana | @solana/web3.js | `SOL_MASTER_MNEMONIC` | `SOL_RPC_URL` |
| Bitcoin | bitcoinjs-lib + bip32/bip39 | `BTC_MASTER_MNEMONIC` | — |
| Tron | tronweb | `TRX_MASTER_MNEMONIC` | `TRX_API_KEY` |
| Cardano | @emurgo/cardano-serialization-lib-nodejs | `ADA_MASTER_MNEMONIC` | — |
| Ripple (XRP) | xrpl | — | `XRP_RPC_URL` |
| Dogecoin | bitcoinjs-lib (BTC-compatible) | `MASTER_MNEMONIC` | — |

**HD Wallet classes** (in `src/modules/web3/`):
- `HDWallet` — EVM chains (BIP44 path: `m/44'/60'/0'/0`)
- `SolHDWallet`, `BtcHDWallet`, `TronHDWallet`, `CardanoHDWallet`, `DogeHDWallet`, `XrpHDWallet`

**Custody model**:
1. Each user gets a derived wallet address per chain (deterministic from mnemonic + user index)
2. Deposits arrive at derived addresses
3. Cron jobs detect on-chain deposits → sweep funds to master wallet
4. Withdrawals are processed from master wallet
5. Master private key stored in `ETH_PRIVATE_KEY`

---

## Cron Jobs and Queues

- **Cron jobs** (`src/modules/global/jobs/cron/`): wallet balance sync, transaction status verification, failed payment retries
- **Bull queues** (`src/modules/global/jobs/scheduled-task/`): async task processing backed by Redis

---

## External Service Integrations

| Service | Purpose | Key Env Vars |
|---|---|---|
| Flutterwave | Payment gateway + webhooks | `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY` |
| Nomba | Bank transfer + webhooks | `NOMBA_*` |
| Paystack | Payments | `PAYSTACK_SECRET_KEY` |
| VTPass | Airtime, data, electricity, TV | `VTPASS_*` |
| Prembly | BVN/KYC identity verification | `PREMBLY_IDENTITY_*` |
| Cloudinary | Image/media uploads | `CLOUDINARYNAME`, `CLOUDINARYAPIKEY`, `CLOUDINARYAPISECRET` |
| Mailjet | Transactional email | `MAILJET_APIKEY_PUBLIC`, `MAILJET_APIKEY_PRIVATE` |
| Moralis | On-chain data | `MORALIS_API_KEY` |
| Block.io | Blockchain API | `BLOCK_API_KEY` |

---

## Database

- **ORM**: TypeORM 0.3.20 with `synchronize: false` — always use migrations
- **Timezone**: UTC+1 in TypeORM config
- **Migrations**: `src/db/migrations/` — run with `npm run db:migration-up`

```bash
npm run db:migration-create   # Generate new migration
npm run db:migration-up       # Apply pending migrations
npm run db:migration-down     # Revert last migration
npm run db:migration-fresh    # Rollback all + re-run (destructive)
npm run seed:run              # Run seeders
```

---

## Caching (Redis)

- Cache-manager with Redis store
- Default TTL: 20 minutes, max 5000 entries
- Cache key pattern: `${SystemCache[key]}_${user_id}`
- Cache is fully cleared on user logout

---

## Scripts

```bash
npm run dev          # Start with file watch (development)
npm run build        # Compile TypeScript
npm run prod         # Run compiled dist/main
npm run lint         # ESLint with auto-fix
npm run format       # Prettier
npm test             # Unit tests (Jest)
npm run test:e2e     # End-to-end tests
npm run test:cov     # Test coverage
npm run documentation  # Compodoc API docs
```

---

## API Documentation

- Swagger UI at `/documentation` and `/docs`
- Protected by HTTP basic auth: username `masamasa`, password from `SWAGGER_PASSWORD` env var

---

## Required Environment Variables

**Must be set** (validated at startup via Joi in `src/validations.ts`):

```
APP_NAME, APP_FRONTEND, WEB_FRONTEND, APP_URL
BCRYPT_SALT, JWT_SECRET, COOKIE_SECRET, JWT_EXPIRES_IN
FILE_UPLOAD_PATH
MAILJET_FROM, MAILJET_FROM_NAME, MAILJET_APIKEY_PUBLIC, MAILJET_APIKEY_PRIVATE
CLOUDINARYNAME, CLOUDINARYAPIKEY, CLOUDINARYAPISECRET
CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_CLOUD_NAME
SWAGGER_PASSWORD
REDIS_HOST
DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME
```

**Optional with defaults**: `PORT=4000`, `DB_PORT=5432`, `REDIS_PORT=6379`, `ENV=dev`

---

## Conventions to Follow

- **Module structure**: controller → service → repository (TypeORM). Keep business logic in services.
- **Validation**: Use Joi schemas + `JoiValidationPipe` — do not use `class-validator` / `class-transformer`.
- **Guards**: Apply `@UseGuards(AuthGuard)` or `@UseGuards(AdminAuthGuard)` at controller or route level.
- **Migrations**: Never use `synchronize: true`. Always generate a migration for schema changes.
- **Caching**: Use `CacheContainerService` for all cache reads/writes. Clear relevant cache keys on mutations.
- **Responses**: Let `GlobalHTTPInterceptor` wrap responses — return plain objects from controllers.
- **Errors**: Throw NestJS `HttpException` subtypes. The global exception filter handles formatting.
- **Logging**: Use the Winston `LoggerService` from the global module, not `console.log`.
- **Passwords/PINs**: Always select: false on entity fields, hash with bcrypt before storing.
- **Transactions (DB)**: Use TypeORM query runner for multi-step operations that must be atomic.
