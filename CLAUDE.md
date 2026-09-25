# Masamasa Backend — Claude Context

## Project Overview

**Masamasa** is a multi-chain crypto wallet and fintech platform. Users hold cryptocurrency across 7 blockchains, pay utility bills (airtime, data, electricity, TV), make P2P transfers, and withdraw to external bank accounts. Admins manage exchange rates, KYC verification, withdrawal wallets, and blockchain operations.

**Stack**: NestJS 10 · TypeScript 5 · PostgreSQL (TypeORM 0.3.20) · Redis (caching + Bull queues) · Node.js ≥ 20.18.1

---

## Directory Structure

```
src/
├── main.ts                         # Bootstrap: CORS, Helmet, compression, Swagger, global filters
├── app.module.ts                   # Root module
├── constants.ts                    # Cookie names (_AUTH_COOKIE_NAME_, _ADMIN_AUTH_COOKIE_NAME_), TTLs
├── definitions.ts                  # Shared types (UserRequest, AdminRequest, SystemCache, iCookieData)
├── validations.ts                  # Joi schema for required env vars (validated at startup)
├── config/
│   ├── app.ts                      # appConfig object — reads all env vars
│   └── typeorm.config.ts           # TypeORM datasource (synchronize: false, migrations-based)
├── core/
│   ├── utils/
│   │   ├── extractDataFromCookie.ts  # encryptData/decryptData, extractDataFromCookie, extractAdminDataFromCookie
│   │   ├── hashing.ts              # hashResource (async), hashResourceSync, verifyHash (bcrypt)
│   │   ├── axiosClient.ts          # Thin axios wrapper (set timeout: 15000 on all calls)
│   │   ├── general.ts              # verifyNombaWebhook, generateVtpassRequestId, generateSignature
│   │   ├── mailer.ts               # sendMailJetWithTemplate, sendZohoMailWithTemplate
│   │   └── flutterwave.ts          # transferWithFlutterWave, verifyTransfer, getBanks
│   ├── helpers/
│   │   ├── generateAlphaNumericString.ts  # generateMasamasaRef()
│   │   ├── generateRandomNumber.ts        # generateRandomNumberString(6) — OTP generation
│   │   ├── withRetry.ts            # Exponential backoff retry helper (currently unused — should be used)
│   │   └── paginate.ts             # paginate(total, page, limit) → metadata
│   └── lib/
│       └── Crypto                  # encrypt/decrypt used for cookie data
├── db/
│   ├── migrations/                 # TypeORM migrations — source of truth for schema
│   └── seeds/                      # Database seeders
├── guards/
│   ├── auth.guard.ts               # User: decrypts cookie → jwtService.verifyAsync() → req.user
│   └── admin-auth.guard.ts         # Admin: decrypts cookie → jwtService.verifyAsync() → checks status → req.admin
├── pipes/
│   └── joi.validation.pipe.ts      # Applied via @UsePipes(new JoiValidationPipe(Schema))
└── modules/
    ├── users/                      # Auth, profile, KYC, PIN, withdrawal, transfer, account deletion
    ├── wallet/                     # Wallet addresses per user per chain
    ├── transactions/               # Transaction history and balance calculation
    ├── transfers/                  # P2P transfer records
    ├── purchases/                  # Airtime, data, electricity, TV subscriptions (VTPass)
    ├── web3/                       # Blockchain wallet generation, balance, sweep, disposable wallets
    │   ├── entity/
    │   │   ├── withdrawal-wallet.entity.ts   # Master withdrawal destinations (coin+network unique)
    │   │   ├── withdrawal.entity.ts          # Individual withdrawal records
    │   │   └── disposable-wallet.entity.ts   # One-time deposit wallets per user/network
    │   ├── services/
    │   │   └── disposable-wallet.service.ts
    │   ├── hd-wallet.ts            # EVM HD wallet (BIP44)
    │   ├── sol-hd-wallet.ts        # Solana HD wallet
    │   ├── tron-hd-wallet.ts       # Tron HD wallet
    │   ├── btc-hd-wallet.ts        # Bitcoin HD wallet
    │   ├── ada-hd-wallet.ts        # Cardano HD wallet
    │   ├── doge-hd-wallet.ts       # Dogecoin HD wallet
    │   ├── xrp-hd-wallet.ts        # Ripple HD wallet
    │   └── web3.service.ts         # ~2000-line service: wallet creation, balances, sweep, withdraw
    ├── administrator/              # Admin panel: user mgmt, KYC, logs, exchange rates, withdrawal wallets
    │   ├── controllers/
    │   │   ├── admin-auth.controller.ts      # POST /admin/auth/login
    │   │   └── administrator.controller.ts   # All other /admin/* routes
    │   ├── services/
    │   │   ├── admin-auth.service.ts
    │   │   └── administrator.service.ts
    │   └── guards/
    │       └── admin-login.guard.ts
    ├── exchange-rates/             # Crypto/fiat rate management
    ├── notifications/              # Push/in-app notifications
    └── global/
        ├── public/                 # Unauthenticated routes + webhooks (Flutterwave, Nomba, transaction)
        ├── bank-verification/      # Identity/KYC via Prembly; AccessToken entity for Nomba OAuth
        ├── beneficiaries/          # Saved bank beneficiaries
        ├── cache-container/        # CacheService wrapper over Redis cache-manager
        ├── cloudinary/             # Image upload service
        ├── jobs/
        │   ├── cron/               # CronService (@Interval) + CronJob (verifyTransactions, generateNombaAccessToken)
        │   └── scheduled-task/     # Bull queue processors
        ├── filters/                # HttpExceptionFilter, GlobalExceptionFilter
        ├── interceptors/           # GlobalHTTPInterceptor — standardizes all responses
        └── logger/                 # Winston logger service
```

---

## Key Entities

| Entity | Table | Key Fields | Notes |
|---|---|---|---|
| `User` | `users` | email (unique), password†, pin†, google_id†, status, kyc_status, kyc_tier, withdrawal_limit, remember_token† | † = `select: false` |
| `Wallet` | `wallet` | network, currency, wallet_address (unique), user_id, status | One per user per chain |
| `Transactions` | `transactions` | amount, dollar_amount, mode (credit/debit), entity_type, status, masamasa_ref, session_id, metadata | No soft delete |
| `Transfer` | `transfers` | user_id, receiver_id, amount | — |
| `PurchaseRequest` | `purchase_requests` | type, status, masamasa_ref (unique), total, commission†, metadata | Soft delete |
| `Administrator` | `administrators` | email, password†, roles (admin/system_admin/super_admin), status (active/suspend) | Soft delete |
| `ExchangeRate` | `exchange_rates` | currency, rate, status (active/disabled), admin_id | — |
| `Notification` | `notifications` | user_id, message, tag, is_read, metadata | — |
| `AdminLogs` | `admin_logs` | admin_id, user_id, entity, note, visible, metadata | — |
| `Beneficiary` | `beneficiaries` | user_id, bank_code, bank_name, account_name, account_number | — |
| `WithdrawalWallet` | `withdrawal_wallets` | coin, network, address, admin_id | UNIQUE(coin, network) |
| `Withdrawal` | `withdrawals` | amount, withdrawal_wallet_id, admin_id, transaction_hash?, metadata? | Immutable record |
| `DisposableWallet` | `disposable_wallets` | address (unique), network, token_symbol, user_id?, derivation_index, status, expires_at | UUID pk |

---

## Authentication

### User Auth
- Cookie name: `__8139a745d54__` (from `_AUTH_COOKIE_NAME_`)
- Set in `auth.controller.ts` as `res.cookie(name, encryptData({ token, user }), CookieOptions)`
- Guard (`auth.guard.ts`): `extractDataFromCookie(req)` → `Crypto.decrypt` → `jwtService.verifyAsync(token)` → `req.user = payload`
- `CookieOptions`: `httpOnly: true, secure: true, sameSite: "none", maxAge: 7 days`

### Admin Auth
- Cookie name: `__18p36s745d09__` (from `_ADMIN_AUTH_COOKIE_NAME_`)
- Set in `admin-auth.controller.ts` as `res.cookie(name, encryptData({ token, admin }), CookieOptions)`
- Guard (`admin-auth.guard.ts`): `extractAdminDataFromCookie(req)` → `Crypto.decrypt` → `jwtService.verifyAsync(token)` → DB lookup by `payload.id` → checks `status !== suspend` → `req.admin = details`
- **Both guards are now symmetric** — cookie encrypted/decrypted the same way, JWT verified on every request

### Authenticated Request Types
```ts
UserRequest  = Request & { user: User }         // src/definitions.ts
AdminRequest = Request & { admin: Administrator }
```

---

## Financial Safety — Race Condition Pattern

Both `withdrawal()` and `transfer()` in `users.service.ts` use a **`SELECT FOR UPDATE` lock** to prevent concurrent requests from overdrawing a balance. Always follow this pattern for any new debit operation:

```ts
const queryRunner = this.dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
let result;
try {
  // 1. Lock the sender row
  await queryRunner.manager
    .createQueryBuilder(User, "user")
    .setLock("pessimistic_write")
    .where("user.id = :id", { id: userId })
    .getOne();

  // 2. Re-read balance inside the transaction
  const { balance } = await queryRunner.manager
    .createQueryBuilder(Transactions, "t")
    .select(`SUM(CASE WHEN mode=:credit AND status=:success THEN amount ELSE 0 END) -
             SUM(CASE WHEN mode=:debit AND status IN (:success,:processing) THEN amount ELSE 0 END)`, "balance")
    .where("t.user_id = :userId", { userId })
    .setParameters({ credit: "credit", debit: "debit", success: "success", processing: "processing" })
    .getRawOne();

  if ((parseFloat(balance) || 0) < amount) throw new BadRequestException("Insufficient wallet balance");

  // 3. Write all records atomically
  result = await queryRunner.manager.save(...);
  await queryRunner.commitTransaction();
} catch (e) {
  await queryRunner.rollbackTransaction();
  throw e;
} finally {
  await queryRunner.release();
}
```

> **Never** call external HTTP APIs (Nomba, VTPass, etc.) inside an open transaction — commit first, then call.

---

## KYC tiers

Three tiers. Tier 1 is every registered account with a verified email (₦50,000 daily withdrawal); tier 2 is identity verified (₦5,000,000); tier 3 is address verified (₦10,000,000). `users.kyc_tier` is what the app shows; `users.withdrawal_limit` is what a withdrawal is actually held to, because an admin can adjust an individual account. Never derive one from the other at the point of use.

### The provider table

[`identity-providers.ts`](src/modules/global/bank-verification/identity-providers.ts) is the centre of this. Each Prembly endpoint takes a different request body and answers in a different shape, so the differences live there as data — one entry per ID type with `url`, `body()`, `verified()`, `names()` and `dob()`. Adding an ID type is a new entry, not a new branch. The file is pure and covered by `identity-providers.spec.ts`; **the mobile app mirrors it** in `masamasa_mobile/lib/screens/Dashboard/kyc/kyc_flow.dart` and the two must agree.

Per-endpoint traps the table already accounts for:

- NIN returns `birthdate` as **DD-MM-YYYY**, which `new Date()` cannot parse at all. Use `normaliseDob`, never `new Date(...)`, on a provider date.
- The driver's licence endpoint returns **no user details** — FRSC matches the name and date of birth we send and answers with a verdict. `names()` returns `null` there, meaning "already matched by the provider", which is not the same as "no names found".
- Document scans are matched on **name only**. A date of birth read by OCR would reject legitimate users over a misread digit.

### Failures: whose problem is it

**Prembly answers HTTP 200 for failures too** and puts the verdict in `response_code` (`00` ok, `01` not found, `02` service down, `03` our wallet is empty, `07` blocked). A 200 is not a pass — always go through `classifyResponse` / `classifyHttpError`.

`FailureReason` splits into two groups and the split is the point. A wrong number or a mismatched name is the user's to fix and rejects the submission. `03` (our prepaid Prembly balance), 401/403 (our key), 429 and 5xx are **ours** — they never reach the user as a rejection, never mark the account `failed`, and are written to the Winston error log, because a drained wallet otherwise surfaces only as users mysteriously failing KYC.

### Flow

`POST /user/kyc` takes **either** `number` + `dob` **or** `front_image` (base64), never neither — enforced by Joi `.or()`/`.and()`. Outcomes: verified → tier 2 + raised ceiling; mismatch → `failed` + `kyc_error`; provider unavailable → `pending` for admin review if a document was supplied, otherwise "try again later" (there is nothing for an admin to look at without one).

The selfie arrives as base64 in that same body and is uploaded to Cloudinary alongside the document, with whatever verdict came back. There is **no liveness check** — it was removed along with the `POST /user/kyc/selfie` endpoint it lived in, so nothing verifies that a selfie is a live face.

Both admin approval (`administrator.service.ts`) and the automated path must set `kyc_tier` alongside `kyc_status` and `withdrawal_limit` — they are two routes to the same transition.

### Gotchas

- Images arrive as base64 in the JSON body because Prembly reads them before anything is stored. `main.ts` raises the body-parser limit to 12mb for this; Express's 100kb default rejects every photo.
- One government ID verifies one account. `assertNotAlreadyUsed` compares a stored excerpt plus a bcrypt hash — the full number is never stored, and a document is deduped on the number Prembly reads off it.
- `bank_verifications.type` is a **varchar**, not a pg enum, so a new ID type does not need an `ALTER TYPE`.

### Tier 3 (address verification)

**Tier 3 is reviewed by a person, not a provider.** There is no Prembly call
on this path at all: `POST /user/kyc/address` records the address and its
proof, sets `address_status = pending` and stops. An admin approves or declines
it from the KYC page in `masamasa-admin2`, and `verifyAddressKyc` is the only
thing that moves `kyc_tier` to 3 and `withdrawal_limit` to
`WITHDRAWAL_MAX_ADDRESS_VERIFIED`. So there is no poller, no `job_id` and no
instant-success path — **the closing screen in the app is always "in review"**.

(Prembly *does* sell an asynchronous address check — `POST
/verification/address` returns a `job_id`, a person visits the address, a
verdict takes 48h minimum, and the real state is `data.addressStatus`, not the
`verification.status` field, which reads `"VERIFIED"` for a merely *accepted*
request. None of that is wired up. Adding it means a `CronJob` polling
`/verification/address/status` and the extra fields it wants — `street`, `lga`,
`landmark` — which `users` does not have.)

**Tier 3 has its own columns and its own queue.** `address_status`,
`address_proof_type`, `address_proof_image` and `address_error` exist because a
tier 3 submission arrives when the account is already `kyc_status = success`:
sharing the `kyc_*` columns would hit `userKyc`'s early return, and the identity
queue (`kyc_status = pending`) would read every address submission as an ID
review. `GET /admin/get-pending-kyc?type=address` is the tier 3 queue;
`verify-address-kyc/:id` and `decline-address-kyc` are its decisions. They are
separate endpoints from the tier 2 pair on purpose — they write different
columns.

Two things that are easy to get wrong:

- **Tier 3 sits on top of tier 2.** `submitAddressKyc` refuses an account whose
  `kyc_status` is not `success`, or tier 3 limits would be granted to someone
  nobody has identified.
- **`WITHDRAWAL_MAX_PER_DAY` (₦5m) is the tier 2 ceiling, not the system
  maximum.** Both Joi schemas — `WithdrawalValidation` and
  `UpdateWithdrawalLimitValidation` — cap at `WITHDRAWAL_MAX_ADDRESS_VERIFIED`
  (₦10m). Capping either at the tier 2 figure silently makes tier 3 unusable.

A decline only moves `address_*`; the account keeps the tier 2 status and
ceiling it already earned.

---

## Known issues

- **`public/logs/*.log` is publicly served.** `main.ts` calls `app.useStaticAssets(join(__dirname, "..", "public"))` *before* registering the `basicAuth` guard that lists `/logs`. Express runs middleware in registration order and `express.static` sends a file it finds without calling `next()`, so the auth never runs and `GET /logs/combined.log` returns the error log. Fix by moving the `basicAuth` block above `useStaticAssets` and relocating the log directory out of `public/`.

---

## Validation Pattern

Use Joi schemas — **not** `class-validator`. Every route that accepts a body should have a schema:

```ts
@Post("/endpoint")
@UsePipes(new JoiValidationPipe(SomeJoiSchema))
async handler(@Body() body: SomeDto) { ... }
```

Schema files live in a `validations/` folder inside each module.

---

## Response Format

`GlobalHTTPInterceptor` wraps every response automatically:
```json
{ "data": { ... }, "message": "optional string" }
```
Return plain objects from controllers — do not wrap manually.

---

## Web3 / Blockchain

| Chain | Library | Mnemonic Env Var | HD Wallet Class |
|---|---|---|---|
| EVM (BSC, ETH, Base, Polygon) | ethers.js | `MASTER_MNEMONIC` | `HDWallet` (hd-wallet.ts) |
| Solana | @solana/web3.js | `SOL_MASTER_MNEMONIC` | `SolHDWallet` |
| Bitcoin | bitcoinjs-lib | `BTC_MASTER_MNEMONIC` | `BtcHDWallet` |
| Tron | tronweb | `TRX_MASTER_MNEMONIC` | `TronHDWallet` |
| Cardano | @emurgo/cardano-serialization-lib | `ADA_MASTER_MNEMONIC` | `CardanoHDWallet` |
| Ripple | xrpl | — | `XrpHDWallet` |
| Dogecoin | bitcoinjs-lib | `MASTER_MNEMONIC` | `DogeHDWallet` |

**Custody model**: User deposits → derived wallet → sweep cron moves funds to master wallet → withdrawals processed from master wallet (`ETH_PRIVATE_KEY`).

**Disposable wallets** (`DisposableWallet` entity): One-time deposit addresses with expiry. Status lifecycle: `pending → funded → swept` or `expired/failed`.

---

## Database

- **Never use `synchronize: true`** — always generate a migration for schema changes
- Timezone: `UTC+1` in TypeORM config

```bash
npm run db:migration-create   # Generate new migration file
npm run db:migration-up       # Apply pending migrations
npm run db:migration-down     # Revert last migration
npm run db:migration-fresh    # Rollback all + re-run (destructive — dev only)
npm run seed:run              # Run seeders
```

---

## Caching (Redis)

- `CacheService` (from `global/cache-container/`) wraps all cache reads/writes
- Default TTL: 20 minutes, max 5000 entries
- Cache key pattern: `${SystemCache[key]}_${user_id}`
- Cache cleared on logout (`DELETE /user/logout`, `DELETE /admin/logout`)

---

## External Services

| Service | Purpose | Key Env Vars |
|---|---|---|
| Nomba | Bank transfers + webhooks | `NOMBA_CLIENT_ID`, `NOMBA_PRIVATE_KEY`, `NOMBA_ACCOUNT_ID`, `NOMBA_WEBHOOK_SECRET` |
| Flutterwave | Payment gateway | `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY` |
| VTPass | Airtime/data/electricity/TV | `VTPASS_*` |
| Prembly | Identity/KYC (BVN, NIN, passport, licence, voter card, document scan) | `PREMBLY_IDENTITY_PASSAPIKEY`, `PREMBLY_IDENTITY_PASSAPPID` |
| Cloudinary | Media uploads | `CLOUDINARYNAME`, `CLOUDINARYAPIKEY`, `CLOUDINARYAPISECRET` |
| Mailjet | Transactional email | `MAILJET_APIKEY_PUBLIC`, `MAILJET_APIKEY_PRIVATE` |
| Zoho Mail | Transactional email | `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_AGENT_ID` |
| Moralis | On-chain data | `MORALIS_API_KEY` |
| Paystack | Payments | `PAYSTACK_SECRET_KEY` |

### Webhook Security
- **Nomba**: Call `verifyNombaWebhook(payload, signature, timestamp)` — must throw if invalid (returns `boolean`)
- **Flutterwave**: Verify `verif-hash` header against `FLW_SECRET_KEY`

---

## Required Environment Variables

Validated at startup by Joi in `src/validations.ts`. Missing any of these will crash the app on boot:

```
APP_NAME, APP_FRONTEND, WEB_FRONTEND, APP_URL
BCRYPT_SALT, JWT_SECRET, COOKIE_SECRET, JWT_EXPIRES_IN
FILE_UPLOAD_PATH
MAILJET_FROM, MAILJET_FROM_NAME, MAILJET_APIKEY_PUBLIC, MAILJET_APIKEY_PRIVATE
CLOUDINARYNAME, CLOUDINARYAPIKEY, CLOUDINARYAPISECRET, CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_CLOUD_NAME
SWAGGER_PASSWORD (min 16 chars)
REDIS_HOST
DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME
MASTER_MNEMONIC, ETH_PRIVATE_KEY
SOL_MASTER_MNEMONIC, TRX_MASTER_MNEMONIC, ADA_MASTER_MNEMONIC
NOMBA_WEBHOOK_SECRET, ALLOWED_ORIGINS
```

---

## Scripts

```bash
npm run dev          # Start with file watch
npm run build        # Compile TypeScript → dist/
npm run prod         # Run compiled dist/main
npm run lint         # ESLint with auto-fix
npm run format       # Prettier
npm test             # Jest unit tests (*.spec.ts under src/)
npm run test:e2e     # End-to-end tests (test/*.e2e-spec.ts)
npm run test:cov     # Coverage report
```

---

## Conventions

- **Validation**: Joi + `JoiValidationPipe` only — never `class-validator`/`class-transformer`
- **Guards**: Apply `@UseGuards(AuthGuard)` at controller scope (not per-route) as the safe default
- **Migrations**: All schema changes require a migration file — never `synchronize: true`
- **Debit operations**: Always use `SELECT FOR UPDATE` inside a `QueryRunner` transaction (see pattern above)
- **External HTTP**: Never inside an open DB transaction — commit first
- **Caching**: Use `CacheService` for all cache operations; invalidate on write
- **Passwords/PINs**: `select: false` on entity fields; always hash with `hashResource()` or `hashResourceSync()` before storing — including in `changePassword()`
- **Logging**: Use Winston `LoggerService` — no `console.log` in service/guard code
- **Errors**: Throw NestJS `HttpException` subtypes — `GlobalExceptionFilter` handles formatting
- **`axiosClient`**: Always set `timeout: 15000` — blockchain and payment API calls can hang
- **`withRetry`**: Use `core/helpers/withRetry.ts` for external API calls that should retry on transient failure
