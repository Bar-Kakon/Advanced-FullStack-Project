# Backend

Express + Mongoose API server for the Contractor Coordination Platform. TypeScript only.

The project source of truth is [`../Contractor Coordination Platform — Pro.md`](../Contractor%20Coordination%20Platform%20—%20Pro.md);
the schema reference is [`../docs/database-design.html`](../docs/database-design.html). Permanent
rules for working on this directory are in [`CLAUDE.md`](CLAUDE.md).

## Run it

```bash
cd Backend
npm install
cp .env.example .env        # fill in MONGODB_URI, CORS_ORIGINS and both token secrets
npm run dev                 # watch mode
```

**MongoDB must run as a replica set** — Register commits three documents in one transaction, and
transactions are unavailable on a standalone `mongod`. A single-member set is enough locally:

```bash
mongod --replSet rs0 --dbpath <your data dir>
mongosh --eval 'rs.initiate()'      # once
```

Generate the two token secrets separately — the server refuses to start if they match:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **If your `.env` predates a variable, nothing tells you.** Copying `.env.example` only helps a
> `.env` that does not exist yet. Today exactly one variable is affected: `TERMS_VERSION` is absent
> from local `.env` files and silently defaults to `draft`. That is the correct value while no Terms
> document exists — and the wrong one the day after one is published, because the version is written
> verbatim into `users.termsAcceptances[]`, which is appended to and never rewritten. Compare the two
> files before trusting a long-lived `.env`:
>
> ```bash
> diff <(grep -o '^[A-Z_]*=' .env.example | sort) <(grep -o '^[A-Z_]*=' .env | sort)
> ```

| Script | Does |
|---|---|
| `npm run dev` | Runs `src/server.ts` in watch mode |
| `npm run build` | Type-checks and emits `dist/` |
| `npm start` | Runs the built `dist/server.js` |
| `npm run typecheck` | Type-checks `src/` and `scripts/` without emitting |
| `npm run verify:register-txn` | Proves the Register transaction is all-or-nothing (needs a database) |
| `npm run verify:password-reset` | Walks Register → Login → forgot → reset → Login against the running server and the real database. **Needs a freshly started server** — it spends much of the auth rate-limit budget |
| `npm run verify:rate-limit` | Proves each auth limiter fires, at its configured budget, through the project error contract. **Needs a freshly started server** |

Verify it is up:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptimeSeconds":3,"timestamp":"…","database":"connected"}
```

## Layout

Organised by responsibility, not by frontend screen. A branch named after a screen adds code to the
domain module that owns the responsibility, so two screens sharing a responsibility share one module.

```
src/
├── server.ts              process entry: env file → config → database → listen → graceful shutdown
├── app.ts                 Express application factory; importable without starting a listener
├── config/
│   ├── env.ts             the only reader of process.env; validates and returns AppConfig
│   └── cors.ts            turns the configured allowlist into CorsOptions
├── db/
│   └── mongoose.ts        connect / disconnect / status / runInTransaction
├── middleware/
│   ├── validateRequest.ts JOI request-validation boundary
│   ├── notFoundHandler.ts unmatched route → AppError(…, 404, 'ROUTE_NOT_FOUND')
│   └── errorHandler.ts    the single place a failure becomes a response
├── routes/
│   ├── index.ts           API composition root — where feature routers mount
│   ├── health.routes.ts   infrastructure-only GET /api/health
│   └── healthAuth.routes.ts  protected GET /api/health-auth — proves the Access Token path
├── features/
│   ├── companies/
│   │   ├── company.model.ts                Mongoose Company — the business + work availability
│   │   ├── company.repository.ts           create
│   │   ├── companyMembership.model.ts      person × company: standing, status, position,
│   │   │                                   permissions — and the enums for all four
│   │   └── companyMembership.repository.ts create
│   ├── users/
│   │   ├── user.model.ts       Mongoose User — a PERSON: identity, trade, location. No company fields
│   │   └── user.repository.ts  the only module that queries users for auth
│   └── auth/
│       ├── auth.module.ts              the feature's composition root; the only file given config
│       ├── auth.routes.ts              POST /register, /login, /refresh,
│       │                               /forgot-password, /reset-password
│       ├── auth.controller.ts          HTTP boundary: read validated input, call a use case, respond
│       ├── auth.service.ts             the login and refresh use cases
│       ├── registration.service.ts     the register use case
│       ├── passwordReset.service.ts    the forgot-password and reset-password use cases
│       ├── passwordResetToken.model.ts      one row per issued reset link (hash only)
│       ├── passwordResetToken.repository.ts mint / look up / spend a reset link
│       ├── auth.validation.ts          JOI schemas for the register and login bodies
│       ├── auth.errors.ts              INVALID_CREDENTIALS / UNAUTHENTICATED / INVALID_RESET_TOKEN /
│       │                               INVALID_REFRESH_TOKEN / EMAIL_ALREADY_REGISTERED
│       ├── authenticatedUser.mapper.ts document → safe wire representation
│       ├── password.service.ts         the only module that calls bcrypt
│       ├── refreshToken.model.ts       stored Refresh Tokens (SHA-256 hashes, TTL-expired)
│       ├── refreshToken.repository.ts  save / look up / retire / revoke a family
│       ├── refreshTokenCookie.ts       HttpOnly cookie transport policy
│       ├── requireAccessToken.middleware.ts  who is making this request, and is the token still current
│       └── tokens/
│           ├── token.types.ts          claims, and the `typ` purpose marker
│           ├── accessToken.service.ts  issue + verify Access Tokens
│           ├── refreshToken.service.ts issue + verify Refresh Tokens
│           └── tokenPair.service.ts    sign a pair and record it — shared by Register and Login
├── mail/
│   ├── mailer.ts          Nodemailer over Brevo SMTP, or log mode when unconfigured
│   └── passwordResetEmail.ts  the reset message, composed in one place
└── shared/
    ├── errors.ts          AppError
    └── logger.ts          the single stdout/stderr boundary
```

Feature modules land in `src/features/<domain>/` and mount in `routes/index.ts` with one line.

## Authentication

Two credentials with different jobs, kept apart by three independent mechanisms — a different
secret, an explicit `typ` claim checked after verification, and separate verify functions. Expiry is
never what distinguishes them.

| | Access Token | Refresh Token |
|---|---|---|
| Answers | *who is this request from?* | *may I have a new Access Token?* |
| Travels in | `Authorization: Bearer …` | HttpOnly cookie, `Path=/api/auth` |
| Default lifetime | 900s (15 min) | 604800s (7 days) |
| Accepted by | any protected route | `POST /api/auth/refresh` only |
| Stored server-side | no | yes — SHA-256 hash only, never the token |

Refresh Tokens **rotate**: each one may be spent once, and spending it issues a replacement in the
same family. Replaying a spent token means a copy is in circulation, so the whole family is revoked —
the stolen copy and the legitimate one both stop working, which surfaces the theft instead of
hiding it. Expired rows are removed by a TTL index.

Request collection for every case: [`requests/auth.http`](requests/auth.http).

## Register

`POST /api/auth/register` — the only way to create an account. It **does not authenticate anybody**.
Creating an account and starting a session are two things, and Login is the one that starts a
session: the approved flow is `Register → Login → Personal dashboard`. So Register issues no Access
Token, issues no Refresh Token, writes no `refreshtokens` row and sets no cookie. It answers
`201 { user }`, and the client goes to Login.

> Until 2026-08-29 it did authenticate immediately, issuing the same pair Login issues. That was
> removed rather than kept as an option — a credential the flow guarantees nobody uses is worth
> removing, not tolerating.

`standing` decides what a registration means. It is **organizational standing only** — not a
permission, not a project role, not a job title — and it defaults to `owner`, which is what public
Register has always created.

| | `standing: 'owner'` | `standing: 'employee'` |
|---|---|---|
| Writes | company + user + owner membership | **the user, and nothing else** |
| `companyName` | **required** | **refused** |
| `officePhone` | optional | **refused** |
| `availability` | optional, defaults `open` | **refused** |
| Permissions | the four approved owner defaults | **none** |

**Why an employee registration creates no membership.** A company name is public, so accepting one
as evidence of employment would hand anybody a seat in any business. The approved path is an owner
opening an `invited` seat that a later registration claims — and **no endpoint creates one yet**, so
an employee registration currently produces an account with no company relationship. That is a
reported gap, not a design.

**The three company-scoped fields are refused rather than ignored**, using the same `Joi.when` idiom
`specialtyOther` already uses. Refusing is the security property: the endpoint cannot receive a
company name on a path that could act on it.

**No authority is ever inferred.** Not from `standing`, and not from `companyPosition` — which
public Register does not set at all.

One owner signup writes **three** documents inside **one transaction**:

```
POST /api/auth/register            (owner path)
  │
  ├─ 0. rate limiter                10 per hour per IP
  ├─ 1. JOI validates the body      unknown keys stripped, so isAdmin / status
  │                                 / passwordHash in a body go nowhere
  ├─ 2. email already taken? ───────► 409 EMAIL_ALREADY_REGISTERED, nothing written
  ├─ 3. bcrypt hash (cost 12)       ← OUTSIDE the transaction: ~250ms of CPU
  │                                    must not hold one open
  │  ╔═ TRANSACTION ═══════════════════════════════════════════╗
  ├──╢ 4. create the Company         name, officePhone?, availability
  │  ║ 5. create the User            a PERSON — no company fields
  │  ║ 6. create the owner membership standing 'owner', status 'active',
  │  ║                               permissions = owner defaults
  │  ║    any throw, including a unique-index violation
  │  ║    ────────────────────────► ABORT ALL THREE
  │  ╚═════════════════════════════════════════════════════════╝
  └─ 7. 201 { user }                no token, no cookie, no session
```

**There is no partial Register state.** Either the company, the person and the owner relationship
all exist, or none of them does — no orphan company, and no user who belongs to nothing.

The `email` unique index is the real guarantee; step 2 is a courtesy that makes the ordinary
duplicate cheap. `runInTransaction` lives in `db/mongoose.ts`, beside the connection it uses; the
service receives it as a dependency and never imports the database library itself.

> **Transactions require a replica set.** A standalone `mongod` rejects the session. That is a
> configuration failure rather than something to fall back from — a half-created account is not a
> lesser kind of success. Local dev runs a single-member replica set.

| Register field | Required | Stored as |
|---|---|---|
| `firstName`, `lastName` | ✅ | `users.firstName`, `users.lastName` |
| `companyName` | ✅ | `companies.name` |
| `email` | ✅ | `users.email` (unique, lowercased) |
| `password` | ✅ (min 8) | `users.passwordHash` — bcrypt only |
| `confirmPassword` | ✅ | **never stored** — validation only |
| `specialty` | ✅ (enum) | `users.specialties: [code]` |
| `specialtyOther` | only when `specialty` is `other` | `users.specialtyOther` |
| `city` | ✅ | `users.location.city` |
| `region` | ✅ (enum code) | `users.location.region` |
| `officePhone` | ➖ | **`companies.officePhone`** — the business's number |
| *(derived)* | — | **`companymemberships`**: `standing: 'owner'` · `status: 'active'` · owner permissions |
| `businessPhone` | ➖ | **`users.businessPhone`** — the person's number |
| `availability` | ➖ (default `open`) | **`companies.availability`** |
| `acceptedTerms` | ✅ must be `true` | **`users.termsAcceptances[]`** — the version + a timestamp. The boolean itself is not stored |

## Password reset

Two endpoints, and one rule that shapes both: **nothing either of them returns says whether an
account exists.**

```
POST /api/auth/forgot-password        { email }
  │
  ├─ 1. JOI validates the body
  ├─ 2. look the address up
  │     ├─ no such account, or not active ──► stop here, quietly
  │     └─ found
  │        ├─ 3. invalidate every live reset token that user holds
  │        ├─ 4. randomBytes(32) → the raw token, hex          goes in the email
  │        ├─ 5. store SHA-256(raw) + expiresAt = now + 30min  goes in the database
  │        └─ 6. hand the email to the mailer WITHOUT awaiting it
  └─ 200 { status: 'ok' }            ← identical on every path above

POST /api/auth/reset-password         { token, newPassword }
  │
  ├─ 1. JOI validates the body        password rules are Register's, applied here independently
  ├─ 2. SHA-256 the supplied token and look the hash up
  ├─ 3. refuse unless: found · not used · not superseded · not expired · account still active
  ├─ 4. bcrypt the new password       OUTSIDE the transaction — ~250ms of CPU
  │  ╔═ TRANSACTION ═══════════════════════════════════════════╗
  ├──╢ 5. write the new passwordHash                           ║
  │  ║ 6. mark the reset token used                            ║
  │  ║ 7. revoke EVERY Refresh Token the user holds            ║
  │  ╚═════════════════════════════════════════════════════════╝
  └─ 200 { status: 'ok' }            no token, no cookie — the person signs in
```

**The email is written in the account's own `users.language`** — Hebrew for a Hebrew account,
English for an English one, never both. There is no second email-language setting, and the language
is read well away from the response: the answer this endpoint gives is identical whether or not the
account exists, so it can carry no such fact.

**Why the email is not awaited.** Reaching an SMTP relay takes far longer than any database work on
this path. Awaiting it would make a known address answer measurably slower than an unknown one,
which is an account-enumeration oracle by stopwatch — the same class of leak the unified
`INVALID_CREDENTIALS` answer exists to close.

**Why a collection and not two fields on the user.** A reset token has a lifecycle: issued,
superseded, spent, expired. `security.resetTokenHash` + `security.resetTokenExpiresAt` on the user
document cannot tell a spent token from an absent one, cannot record that a newer request replaced
an older link, and put security state in the permanent identity document. `passwordresettokens`
mirrors `refreshtokens`, because it is the same kind of object.

| | Refresh Token | Password-reset token |
|---|---|---|
| Stored | SHA-256 hash | SHA-256 hash |
| Lifetime | 7 days | **30 minutes** |
| Reuse | rotates — spend once, get a replacement | **spend once, then dead** |
| Superseded by | rotation, within a family | a newer forgot-password request |
| Swept by | TTL index on `expiresAt` | TTL index on `expiresAt` |

**One usable link at a time.** A second forgot-password request invalidates the first link. Asking
again says the earlier email is not the one being held, and two live links widen the window an
intercepted email is useful in.

**Every reset failure answers `401 INVALID_RESET_TOKEN`** — unknown, expired, superseded and
already-spent alike. The person holding a dead link learns it is dead and nothing else.

**After a reset, both credentials stop working, and they stop for different reasons.**

*Refresh Tokens* are rows, so they are revoked: every un-revoked row that user holds is stamped
inside the same transaction, through the `refreshtokens` collection the rotation and
replay-detection logic already uses. There is no second session mechanism.

*Access Tokens* are stateless JWTs with no server-side record, so there is nothing to revoke. They
are invalidated instead — the reset writes **`users.security.passwordChangedAt`**, and
`requireAccessToken` refuses any token whose `iat` predates it:

```
Authorization: Bearer …
      │
      ├─ 1. signature + `typ: access`        the token is genuine
      ├─ 2. look the account up               ONE indexed read, two projected fields
      ├─ 3. no such account?          ──────► 401 UNAUTHENTICATED
      ├─ 4. isSessionPermitted(status)? ─no─► 401 UNAUTHENTICATED
      ├─ 5. iat < security.passwordChangedAt? 401 UNAUTHENTICATED
      └─ 6. res.locals.auth = { userId }
```

**Step 4 is the same rule Login and Refresh apply** — the one `isSessionPermitted` function, given a
status rather than a whole user so all three callers can ask it. A ban therefore reaches a token
already in circulation, immediately, instead of waiting for it to expire. **It closes access and
nothing else:** no task, project, membership, message or consent record is touched.

**The cost is one indexed `findById` per authenticated request**, projected to
`security.passwordChangedAt` alone. That is the price of making a stateless token revocable, and it
is paid on every protected route rather than only after a reset — there is no way to know a token
is stale without asking. If it ever matters, the answer is a short-lived cache keyed by user id,
not a weaker check.

**One second of granularity, stated rather than hidden.** A JWT's `iat` is whole seconds, so
`passwordChangedAt` is stored truncated to the second and compared in the same unit. A token minted
in the *same second* as the reset therefore survives. Rounding the other way closes that window and
opens a worse one: it rejects the token Login mints moments later, which is a legitimate sign-in
failing. The sub-second window needs an attacker who already has the password and hits the same
second as the victim's reset.

**Register does not set it.** Absent means the password has never been changed, which is exactly
what a new account means.

## Outgoing mail

`src/mail/` — one service, so no controller ever constructs a transport.

```
src/mail/
├── mailer.ts               createMailer(config.mail) → { send, mode }
│                           smtp mode: Nodemailer over Brevo's SMTP relay
│                           log  mode: writes a warning instead of sending
└── passwordResetEmail.ts   composes subject + text + html from the reset URL
```

**Brevo is the email service; Nodemailer is the client that talks to it.** Ordinary authenticated
SMTP, so there is no vendor SDK in the dependency tree and no API key in the application.

`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are **all-or-nothing**: three of the four is a
deployment that looks configured and fails on the first send, so the server refuses to start on a
partial set. With none of them set it starts in **log mode** — nothing is sent, every attempt logs a
warning, and the reset link is written to the log so the flow can still be walked locally. A
configured server never logs a token.

`FRONTEND_URL` is **required**. The reset link is `${FRONTEND_URL}/reset-password?token=<raw token>`,
and an email carrying the wrong link is worse than a server that will not boot.

### Recording consent

`acceptedTerms` must be `true` or the request is rejected, and the consent is **persisted, not
discarded** (approved 2026-08-28). A boolean alone cannot prove *what* was agreed to once the Terms
change, so each acceptance records the version and when it happened:

```
users.termsAcceptances: [ { version: "draft", acceptedAt: 2026-08-28T16:11:39Z } ]
```

**Appended to, never overwritten.** Agreeing to a later version adds an entry rather than replacing
the earlier one, so the proof of the first acceptance survives. It embeds rather than becoming a
collection because it is small and bounded — one entry per Terms version a person has seen.

**The version comes from `TERMS_VERSION` in config, never from the request body.** The server knows
which version it is serving; a client could claim any value. **The boolean itself is not stored** —
it carries nothing the dated record does not.

> No Terms document has been written yet, so the default version is the honest string `draft` and
> the register screen still links to `href="#"`. The deployment sets a real version the moment one
> is published. Whether the client should also echo the version it actually rendered is worth
> deciding then; today there is nothing for it to echo.

### The three phone concepts

Both belong in Register, both are optional, and they are independent — approved 2026-08-28,
closing D27. They live in three places on purpose, so no fallback between them is even reachable:

```
users.phone            personal / login   ← onboarding step 3. Register never asks.
users.businessPhone    the individual     ← Register, optional
companies.officePhone  the organization   ← Register, optional
```

Either optional phone may be present without the other, and omitting both is valid.

### Who belongs to a company, and what they may do

A **User is a person.** There is no "contractor account" and no "employee account" — the relationship
to a business is its own document, so the same person can be an owner today and something else later
without their account changing type.

```
  companies ──────┐
                  │  companymemberships          ┌────── users
                  └─  company ───────────────────┘
                      user            ← null while the seat is unclaimed
                      invitedFullName ← what the owner typed when opening it
                      standing        'owner' | 'employee'
                      status          'invited' → 'pending_company_approval'
                                              → 'active' → 'inactive'
                      companyPosition the JOB      (main_contractor,
                                                    construction_manager,
                                                    site_manager, contractor, employee)
                      permissions     what they MAY DO
```

**`standing`, `companyPosition` and `permissions` are three separate things and none is derived from
another.** `standing` is where the person sits in the business; `companyPosition` is their job;
`permissions` is what they are authorized to do. Being a Site Manager grants nothing.

**Four approved owner default capabilities, and exactly four codes.**

| Capability | Code | Owner (public Register) | Employee |
|---|---|---|---|
| Create projects | `project.create` | ✅ granted at signup | ❌ never by default |
| Create tasks | `task.create` | ✅ granted at signup | ❌ never by default |
| Manage their own company | `company.manage` | ✅ granted at signup | ❌ never by default |
| Add / invite employees | `company.invite_employees` | ✅ granted at signup | ❌ never by default |

**The list is closed.** `CompanyPermission` is derived from it, so a fifth code is a compile error
until the capability it names is itself implemented and approved — the vocabulary can never run
ahead of the product:

```ts
const p: readonly CompanyPermission[] = ['project.delete'];
// Type '"project.delete"' is not assignable to type
//   '"company.invite_employees" | "company.manage" | "project.create" | "task.create"'.
```

### The future authorization layer

**Nothing reads `permissions` yet** — no endpoint checks them, because none of the four capabilities
is implemented. They are written at signup anyway, so the rule holds for accounts created before the
check exists: no backfill, and no owner who silently has no authority.

Whatever authorization layer is built **must honour this as-is and must not restate the product
rule**: an owner holds all four, an employee holds none by default, and neither set may be derived
from `companyPosition`. Grants beyond the defaults are an explicit act by an owner or an authorized
manager.

Two indexes carry the rules: `{ company, status }` serves "this company's pending activations", and
a **partial unique** index on `{ user }` where `status: 'active'` enforces **one active relationship
per person at a time**.

### Not built here — the future employee flow this model must not block

Public Register creates an **owner** and nothing else. The rest is documented so a later endpoint
cannot contradict the model, and **none of it is implemented**:

```
 1. OWNER INVITES         owner adds staff with full name + company position only.
    (future screen)       The company is known from their own account.
                          → membership { user: null, status: 'invited' }
                          → creates NO user account

 2. EMPLOYEE REGISTERS    a separate path: full name + company name + position.
    (future endpoint)     The backend looks for a matching 'invited' row.
                          no match  → cannot join that company, full stop
                          match     → account created, the SAME row becomes
                                      status: 'pending_company_approval'

 3. OWNER APPROVES        one, several, or all valid pending activations.
    (future screen)       → status: 'active'
```

Because the pending list is *the invited row itself*, somebody who merely types a company name has
no row to claim and **can never appear in it**. That is structural, not a filter that could be
forgotten.

Two further rules recorded here, not implemented: an employee is **not an independent professional
profile and must not appear in Browse** (Browse selects people holding an `owner` membership), and
**employee availability is a separate future concept** — it must never reuse or overwrite
`companies.availability`, and its vocabulary is not invented yet.

### Availability belongs to the business

`companies.availability` is the single source of truth for whether an organization is taking new
work. It is **not** duplicated onto users and there is no per-user override: everyone working under
a company derives their effective availability from it. Browse chooses its own read strategy when
it is built.

This is **work availability of the organization** and nothing else. It is not the personal
availability of each employee: managing staff availability is a separate future concept that must
not touch this field.

## Rate limiting

The four auth entry points are limited per caller IP. Ordinary authenticated application traffic is
**not** limited — that is a separate decision and this is not it.

| Endpoint | Limit | Window | The abuse it answers |
|---|---|---|---|
| `POST /auth/login` | 10 | 15 min | credential stuffing / brute force |
| `POST /auth/register` | 10 | 60 min | automated account creation |
| `POST /auth/forgot-password` | 5 | 15 min | mail flooding, Brevo quota abuse |
| `POST /auth/reset-password` | 10 | 15 min | repeated invalid-token and password attempts |

**These numbers are engineering defaults, not approved product values.** They live in one place —
`AUTH_RATE_LIMITS` in `middleware/rateLimit.ts` — so a route asks for a named limit instead of
carrying a window and a count of its own.

**Keyed on IP, never on the submitted email.** A forgot-password limiter keyed on the address in the
body would let anyone lock a chosen person out of password recovery by spending their quota. IPv6 is
normalised to a /64 block, so one client cannot rotate addresses inside its own prefix for extra
attempts.

**The limiter sits in front of validation**, so a flood costs a counter increment rather than a JOI
pass — and on login it never reaches bcrypt.

**`POST /auth/refresh` is deliberately not limited.** It is spent by an HttpOnly cookie the browser
sends on its own, and rotation plus family revocation already answer a replayed one.

**The answer is the project's own error contract**, not the library's default body:
`429 { "code": "TOO_MANY_REQUESTS", "message": … }`, raised as an `AppError` and rendered by the
same error handler as everything else. Standard `RateLimit` headers are sent; the legacy
`X-RateLimit-*` ones are not.

> **Deployment.** Counters are in memory, so each dyno limits independently and a restart clears
> them. `trust proxy` is enabled only in production, where Heroku puts exactly one proxy in front —
> without it every caller behind that proxy would share a single key. Trusting the header anywhere
> else would let a client forge it and buy a fresh quota per request.

## API error contract

Every deliberate failure answers with an HTTP status, a stable machine-readable `code`, and a
human-readable `message`:

```json
{ "code": "ROUTE_NOT_FOUND", "message": "Route GET /api/nope not found" }
```

Anything not deliberately raised answers `500` with
`{ "code": "INTERNAL_SERVER_ERROR", "message": "Internal server error" }`. The exception, its
message and its stack stay server-side.

Codes are added **only** when a concrete expected failure is implemented — no vocabulary is defined
ahead of the conditions that need it. Everything this branch actually implements:

| Code | Status | Condition |
|---|---|---|
| `ROUTE_NOT_FOUND` | 404 | No route matched the request |
| `REQUEST_VALIDATION_FAILED` | 400 | The request failed its JOI schema |
| `MALFORMED_JSON_BODY` | 400 | The body could not be parsed as JSON |
| `REQUEST_BODY_TOO_LARGE` | 413 | The body exceeded the 100kb limit |
| `EMAIL_ALREADY_REGISTERED` | 409 | Register: the email already holds an account |
| `INVALID_CREDENTIALS` | 401 | Login failed — for **any** reason |
| `UNAUTHENTICATED` | 401 | The Access Token was missing, malformed, expired, was not an Access Token, belongs to no account, or was issued before the account's password last changed |
| `INVALID_REFRESH_TOKEN` | 401 | The Refresh Token was missing, malformed, expired, unknown, already spent, revoked, or was not a Refresh Token |
| `INVALID_RESET_TOKEN` | 401 | The reset link was unknown, expired, superseded by a newer request, or already spent |
| `TOO_MANY_REQUESTS` | 429 | An auth endpoint's rate limit was exceeded for the caller's IP |
| `INTERNAL_SERVER_ERROR` | 500 | Anything unexpected |

`INVALID_CREDENTIALS` cannot distinguish an unknown account from a wrong password from a suspended
one, or it would confirm which emails hold accounts — the same anti-enumeration stance the Login
screen's single error message already takes. The two token codes are coarse for the same reason and
because the client's response is identical either way: send the user back to Login.

`EMAIL_ALREADY_REGISTERED` is the deliberate exception, approved 2026-08-28. A signup form has to
say **which field to correct**, and it is already an enumeration surface by nature — anyone may post
an address to it. Login and password reset are unchanged and keep their unified answers.

400 is used for request-shape failures so that 422 keeps the meaning it has in the schema doc's one
documented usage — a well-formed request rejected by a domain invariant.

## Deliberately not decided here

**D16 — 403 vs 404 for a resource the viewer may not see — is open and this branch does not touch
it.** `notFoundHandler` answers "no route matched" and nothing else; there is no reusable
not-found abstraction that an authorization check could pick up and thereby settle D16 by accident.

When D16 is decided it must cover the case where **the existence of a resource or relationship is
itself confidential**. Confidential delegation (§3.3) is exactly that case: a 403 confirms the
resource exists, which is precisely what the visibility model protects, so 404 may be required in
order to conceal existence rather than merely to report absence. The decision therefore belongs
with the Stage-5 viewer-aware serializer, not with route matching.
