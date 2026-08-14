# Admin Roles & Permissions

How access to the `/admin` API is controlled, and what to do when adding a role or an endpoint.

---

## The model in one line

**Every admin route is `super_admin`-only unless it is explicitly opened.** A new route added without a decorator is protected automatically.

---

## Roles

Defined by `AdministratorRoles` in `src/modules/administrator/entities/administrator.entity.ts`, stored in `administrators.role`:

| Role | Meaning |
|---|---|
| `super_admin` | Full access to everything. The default for existing and seeded accounts. |
| `marketer` | Dashboard analytics only. No user records, no KYC, no money movement. |

`super_admin` passes every check and never needs to be listed in a decorator.

### Account status

`AdminStatus` on the same entity, stored in `administrators.status`:

| Status | Can log in? | Meaning |
|---|---|---|
| `active` | yes | Normal working account. |
| `suspend` | no | Disabled by a super admin. |
| `pending` | no | Invited, has not set a password yet. |

Both `AdminAuthGuard` (session) and `AdminLoginGuard` (login) reject anything other than `active`.

---

## The three moving parts

**1. `AdminAuthGuard`** — `src/guards/admin-auth.guard.ts`

Verifies the cookie's JWT, loads the `Administrator` **from the database on every request**, rejects non-`active` accounts, and puts the row on `req.admin`.

Because it re-reads rather than trusting the token, a role change or a suspension takes effect on the admin's next request — no re-login, no cookie reissue.

**2. `AdminRoleGuard`** — `src/guards/admin-role.guard.ts`

Reads `req.admin.role` and decides. Order of checks:

1. `super_admin` → allow
2. handler marked `@AllowAllAdmins()` → allow
3. `req.admin.role` listed in the handler's `@AllowRoles(...)` → allow
4. otherwise → `403 Forbidden`

Step 4 is what makes the system default-deny: a route with no decorator has no metadata, the lookup returns `undefined`, and control falls through to the throw.

**3. The decorators** — `src/guards/decorator/roles.decorator.ts`

```ts
@AllowRoles(AdministratorRoles.marketer)   // named roles (super_admin implied)
@AllowAllAdmins()                          // any logged-in admin, whatever the role
```

Use `@AllowAllAdmins()` **only** for self-service routes — an admin acting on their own account. Writing those as a role list means a role added later is silently locked out of its own profile.

### Wiring

Both guards are applied once, at class scope on `AdministratorController`:

```ts
@UseGuards(AdminAuthGuard, AdminRoleGuard)
```

**Order matters.** `AdminAuthGuard` must run first because it populates `req.admin`, which `AdminRoleGuard` reads. Reversed, every request hits the role guard's "not authenticated" branch.

---

## Current access map

### Any logged-in admin — `@AllowAllAdmins()`

| Route | |
|---|---|
| `GET /admin/profile` | own profile |
| `PATCH /admin/profile` | own profile |
| `POST /admin/change-password` | own password |
| `DELETE /admin/logout` | own session |

### Marketer — `@AllowRoles(AdministratorRoles.marketer)`

All aggregate figures. None of these return per-user rows.

| Route | |
|---|---|
| `GET /admin/analytics/overview` | totals |
| `GET /admin/analytics/volume` | time series |
| `GET /admin/analytics/cash-flow` | daily inflow/outflow |
| `GET /admin/analytics/crypto-deposits` | grouped by coin |
| `GET /admin/analytics/daily-users` | counts |
| `GET /admin/analytics/kyc-funnel` | counts |
| `GET /admin/analytics/locations` | grouped by country/state |
| `GET /admin/dashboard-kpi` | dashboard tiles |

### super_admin only — no decorator

Everything else, including:

- **User records** — `GET /admin/users`, `GET /admin/user/:id`, `GET /admin/user/:id/transactions`, `PATCH /admin/user/:id/status`, `GET /admin/quidax/sub-accounts`
- **KYC** — `GET /admin/get-pending-kyc`, `GET /admin/verify-kyc/:id`, `POST /admin/decline-kyc`
- **Money** — `POST /admin/web3/withdraw-token`, `GET /admin/web3/balances`, `GET /admin/withdrawal-wallets`, `GET /admin/withdraw/history`, `POST /admin/create-exchange-rate`, `GET /admin/exchange-rates`
- **Transactions** — `GET /admin/transactions`, `GET /admin/transaction/:id`
- **Notifications** — `GET /admin/notifications`, `POST /admin/notifications/broadcast`
- **Staff management** — `POST /admin/staff/invite`, `GET /admin/staff`, `PATCH /admin/staff/:id/status`, `POST /admin/staff/:id/resend-invite`

> `GET /admin/analytics/transactions-per-user` sits here despite the `analytics/` prefix — it selects `first_name`, `last_name` and `email` per user, so it is not an aggregate.

### Unauthenticated

`StaffInviteController` (`@Controller("admin/staff")`) carries **no guards** — an invitee has no session yet.

| Route | |
|---|---|
| `GET /admin/staff/:token/check` | pre-fills the registration form |
| `POST /admin/staff/accept-invite` | sets password + phone, activates |

The raw invite token is the only credential. It is single-use and expires after 48 hours.

---

## Staff invites

1. A super admin calls `POST /admin/staff/invite` with `{ first_name, last_name, email, role }`.
2. The account is created with `status: pending` and **no password**.
3. A 32-byte token is generated. Only its **SHA-256 hash** is stored in `invite_token`; the raw value exists solely in the emailed link.
4. The email links to `${ADMIN_FRONTEND}/staff/invite/<token>` — a route in the admin panel, not the API.
5. The invitee sets a password and phone. Status becomes `active` and the token is cleared.

**Only `marketer` can be invited.** `CreateStaffValidation` rejects any other value, so the invite flow can never mint a `super_admin` even if the request body is tampered with. Promoting someone is a manual database change.

Expired, already-used and never-existed tokens all fail identically, so the endpoint cannot be used to probe for valid invites. A login attempt against a `pending` account returns the same "incorrect details" as a wrong password, for the same reason.

---

## Adding a new admin endpoint

Add it to `AdministratorController` and it is `super_admin`-only. That is usually what you want — decide deliberately before widening it.

To open it up:

```ts
@AllowRoles(AdministratorRoles.marketer)
@Get("analytics/whatever")
```

Before opening an `analytics/` route, **check what the query actually selects.** The prefix is not a guarantee — see `transactions-per-user` above. If it returns per-user rows, leave it closed.

### The one gap to remember

The default-deny guarantee comes from the class-level `@UseGuards` on `AdministratorController`. A **new controller** does not inherit it. If you add, say, `AdminReportsController` and forget the guards, its routes are open to the public internet with no authentication at all.

> New route on the existing controller → safe by default.
> New admin controller → you must add `@UseGuards(AdminAuthGuard, AdminRoleGuard)` yourself.

Closing that gap properly means registering both guards globally via `APP_GUARD` and marking public routes with a `@Public()` decorator. That inverts the default for the whole app, including every user-facing and webhook route, so it is a deliberate change rather than a quick one.

---

## Adding a role

1. Add the value to `AdministratorRoles`.
2. Write a migration adding it to the `administrators_role_enum` Postgres type (`ALTER TYPE ... ADD VALUE`, wrapped to swallow `duplicate_object`).
3. Add it to `@AllowRoles(...)` on the routes it should reach.
4. If it should be invitable, widen `CreateStaffValidation` — otherwise accounts must be created by hand.
5. On the frontend, add it to `roleOptions` (assignable) and `roleLabels` (display).

Self-service routes need no change: `@AllowAllAdmins()` already covers every role.

---

## Frontend

The admin panel hides controls with `v-if` on `admin.role`, which the API returns on both `POST /admin/auth/login` and `GET /admin/profile`.

**That is presentation, not enforcement.** `v-if` hides a button; `AdminRoleGuard` is what actually stops the request. Both exist on purpose — the guard is the security boundary, and the `v-if` keeps the UI honest. Never rely on the `v-if` alone.

Two lists on the staff page do related but different jobs:

- `roleOptions` — roles that can be **assigned** (marketer only, matching the API)
- `roleLabels` — display names for roles **already in the table**, so existing `super_admin` rows still render readably

---

## Caching caveat

`AdministratorService.getWithId()` caches the admin under `admin:${id}`, and `AdminAuthGuard` reads through that cache. Any write that changes whether or how an admin may act **must invalidate that key**, or the change won't take effect until the entry expires (default 20 minutes).

Already handled in `updateStaffStatus()` and on logout. Remember it if you add a route that changes `role` or `status`.

Note the two key shapes in play: the `SystemCache` loop on logout uses `${SystemCache[key]}_${id}`, which is **not** the same key as `admin:${id}`. Both need clearing.
