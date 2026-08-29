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
| `npm run verify:employee-lifecycle` | Walks invite → employee registers → `pending_company_approval` → owner approves → `active`, including the bulk approval. **Needs a freshly started server** |

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
│   └── companies/         company, membership, and the employee-management module
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

### The session payload — `SessionUser` and `CompanyContext`

Login and `GET /api/auth/me` answer the **same shape**, so a client never has two ideas of who is
signed in. Register does not: it creates an account and opens no session, so its 201 carries the
plain `AuthenticatedUser` with no company half.

| Route | Answers | Issues a token |
|---|---|---|
| `POST /api/auth/login` | `{ accessToken, user: SessionUser }` | ✅ access + rotating refresh cookie |
| `GET /api/auth/me` | `{ user: SessionUser }` | ❌ nothing — a pure read |
| `POST /api/auth/register` | `{ user: AuthenticatedUser }` | ❌ no session at all |

```ts
interface SessionUser extends AuthenticatedUser {   // id, email, firstName, lastName,
  company: CompanyContext | null;                   // language, profileComplete
}

interface CompanyContext {
  id: string;
  standing: 'owner' | 'employee';
  membershipStatus: 'pending_company_approval' | 'active';
  permissions: readonly CompanyPermission[];
  employeeSetupComplete: boolean;
}
```

**`membershipStatus` is carried as the code it is, not reduced to a boolean.** Waiting for a
company's approval and having left that company are different facts, and no boolean separates them —
a client that could not tell them apart would show an ex-employee the Waiting for Approval screen.

**`company` is `null` for somebody holding no *current* relationship** — never joined, or ended.
See [One person, one company](#one-person-one-company) for why an ended row is not a current one.

`CompanyContext` deliberately carries **no company name, office phone or availability**. Those
belong to the profile feature; a session payload that grows a second copy of them is a second answer
waiting to disagree with the first.

**`GET /api/auth/me` exists because an Access Token is stateless.** Nothing that happens after one is
minted — an employer approving a membership, most of all — can reach the copy a client is holding.
This is how the client asks, and it is what the Waiting for Approval screen's *Check status* calls.
It issues nothing, rotates nothing, and leaves the Refresh cookie untouched.

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
permission, not a project role, not a job title — and it is **required**: there is no default,
because a request that does not say which registration it is should be answered rather than
guessed at.

| | `standing: 'owner'` | `standing: 'employee'` |
|---|---|---|
| Writes | company + user + owner membership | user, and **claims an existing seat** |
| `companyName` | required — the business being created | required — the business that invited them, **matched, never trusted** |
| `companyPosition` | refused | **required** — part of what identifies the seat |
| `officePhone` | optional | **refused** — see below |
| `availability` | optional | **refused** — D14 |
| `businessPhone` · `specialty` · `city` · `region` | optional / required as before | **the same** — these are the person's, not the company's |
| Membership status | `active` | `pending_company_approval` |
| Permissions | the four approved owner defaults | **none** |

### The employee lifecycle

```
  OWNER                                    EMPLOYEE
    │
    │ POST /companies/employees/invitations
    │   { fullName, companyPosition }
    ▼
  ┌──────────┐   no user yet. The seat records the name and the job
  │ invited  │   it will be matched on, and carries no permissions.
  └──────────┘
    │                                         │ POST /auth/register
    │                                         │   standing: employee
    │                                         │   companyName + companyPosition + full name
    │                                         ▼
    │   ┌───────────────────────────────────────────────────────┐
    │   │ match: a company of that NAME, an `invited` seat with  │
    │   │ that invitedFullName and that companyPosition          │
    │   │   no match  ──► 409 INVITATION_NOT_FOUND, nothing written
    │   │   >1 match  ──► 409 INVITATION_AMBIGUOUS
    │   └───────────────────────────────────────────────────────┘
    │                                         ▼
    │                          ┌──────────────────────────┐
    │                          │ pending_company_approval │  bound to the account,
    │                          └──────────────────────────┘  still not a member
    │ POST /companies/employees/:id/approve            │
    │ POST /companies/employees/approve-all            │
    ▼                                                  ▼
  ┌────────┐  active. Still no permissions — approval admits them,
  │ active │  it does not grant them anything.
  └────────┘
```

**A company name alone never grants membership.** It only narrows the search for a seat somebody
already opened, and the name is not unique, so every company holding it is searched and **more than
one match is refused rather than guessed at**. There is no email, phone or one-time-code matching:
none of those is part of the model.

**Nothing is written when no seat matches.** The match runs *before* the transaction, so a
registration with no invitation creates no user, no company and no membership. The claim itself is
conditional on the seat still being `invited`, so two registrations racing for one seat cannot both
win, and it commits inside the same transaction as the account.

**Authority never comes from standing or from a job title.** `companyPosition` is descriptive.
Capabilities come only from `permissions`, and an employee is created with none — approval does not
change that. Project and task creation need `project.create` / `task.create`, granted explicitly.

**The six `companyPosition` codes** are `main_contractor`, `construction_manager`,
`regional_construction_manager`, `site_manager`, `contractor` and `employee`. They are stable
identifiers and are never renamed to follow a label: the Hebrew wording for a site manager was
reworded twice while `site_manager` stayed exactly what it was.
`regional_construction_manager` was added 2026-08-29 on owner instruction, naming a role the
terminology already distinguished in words but had no code for. On the same day
**`main_contractor`'s Hebrew label moved to `קבלן ביצוע ראשי`** — because the old `קבלן ראשי` is
already the Hebrew for the *per-project role* `gc`, and a company job title must not share a string
with a project role — and, as the rule above predicts, **the code did not move**.

#### What the client does between Login and `active`

The lifecycle above is the server half. The two client-visible states it produces:

```
  employee Registers        → 201, NO session. Login is still the boundary.
  employee Logs in          → 200. They are a fully authenticated User.
                              company.membershipStatus = 'pending_company_approval'
    ▼
  Waiting for Approval      tokens intact · not signed out · not sent back to Register
                            · not treated as banned. They simply hold no ACTIVE
                            membership, so company-dependent areas stay closed.
    │  Check status  ─────►  GET /api/auth/me   (same token, nothing reissued)
    ▼
  owner approves            → membershipStatus = 'active'
                            → the next /auth/me moves them on
```

**No re-registration, no approval token, and no second Login** is required merely because the owner
approved somebody — the Access Token they already hold keeps working, and `/auth/me` is how its
holder learns the membership changed. There is **no real-time infrastructure**: no WebSockets, no
SSE, no polling and no short-interval timers. The manual check plus ordinary session revalidation is
the whole mechanism.

### Employee management endpoints

All authenticated, and all authorised by the caller's own recorded `company.invite_employees`
permission on an **active** membership — never by their standing and never by their position.

| Route | Does |
|---|---|
| `POST /api/companies/employees/invitations` | opens a seat: `{ fullName, companyPosition }` |
| `GET /api/companies/employees` | this company's memberships, so the owner can see who is waiting |
| `POST /api/companies/employees/:membershipId/approve` | one activation → `active` |
| `POST /api/companies/employees/approve-all` | every waiting activation at once |
| `POST /api/companies/employee-setup/complete` | records that this company has been through employee setup |

`COMPANY_PERMISSION_DENIED` (403) when the permission is missing, `NO_ACTIVE_COMPANY` (403) when the
caller has no active membership, `PENDING_ACTIVATION_NOT_FOUND` (404) when nothing matched.

**The invitation body is two fields and only two: `fullName` and `companyPosition`.** No email, no
password, no phone, no availability and no permissions — the person supplies their own account
details when they register against the seat. **The company is never in the body**: it is derived from
the caller's own active membership, so an owner cannot open a seat at a company that is not theirs,
and there is nothing for a client to select or spoof. The employee side still matches on the approved
combination — `invitedFullName` + company name + `companyPosition` — and no fourth key was added.

`POST /api/companies/employee-setup/complete` sits outside `/employees` because it records a fact
about the **company**, and it is recorded whether or not anybody was ever invited:

- authenticated, and gated by the same `company.invite_employees` capability as the routes above;
- writes `companies.employeeSetupCompletedAt`, and nothing else;
- **Skip and Finish are the same call** — both mean the business was offered the step and dealt with
  it, and a separate `skipped` state would be a distinction nothing downstream asks about;
- **idempotent**, and the first stamp is the one kept: a later call must not rewrite the day it
  actually happened;
- answers `200 { employeeSetupComplete: true }`;
- **grants no permissions** and **changes no membership lifecycle state**. It is not an approval.

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
                                                    regional_construction_manager,
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
`user_current_unique` enforces one company per person — see the next section.

### One person, one company

**A user belongs to exactly one company at a time.** The two states that mean *in a company* are
`pending_company_approval` and `active`, and a person may hold **at most one row in either**. These
states do not exist in this model, and the database refuses to store them:

- active at company A **and** pending at company B;
- two pending memberships;
- two active memberships.

```js
companyMembershipSchema.index(
  { user: 1 },
  {
    name: 'user_current_unique',
    unique: true,
    partialFilterExpression: { status: { $in: ['pending_company_approval', 'active'] } },
  },
);
```

Two kinds of row sit **outside** the filter, on purpose:

- **an unclaimed `invited` seat carries no user at all**, so a company may hold as many open seats as
  it likes;
- **an `inactive` row is history.** Leaving a company does not bar somebody from later joining
  another one — the ended row stays stored and stays out of the constraint.

> **Superseded.** The earlier `user_1` index made only *activation* exclusive, so "active at A,
> pending at B" was writable. Uniqueness no longer applies to `active` alone, and any description
> that still says so is stale.

#### Migrating the index

The two indexes share the `{ user: 1 }` key, so Mongoose's `autoIndex` raises `IndexOptionsConflict`
and **skips the new one** — the constraint would be in the code and absent from the database. Run
once per environment:

```bash
npm run migrate:membership-uniqueness
```

It drops `user_1`, syncs `user_current_unique`, and prints the resulting indexes. If any user already
holds more than one live membership it **reports them and exits non-zero instead of guessing how to
merge them** — that is a data question, not a script's call. This is an engineering migration and
settles no product rule of its own.

### Current company, and history

`CompanyContext` answers the caller's **current** relationship, and an ended one is not current:

| Membership rows the user holds | `company` on the session payload |
|---|---|
| none | `null` |
| one `pending_company_approval` | that context — what the Waiting for Approval screen runs on |
| one `active` | that context — normal access |
| `inactive` / ended only | `null` |

`findCurrentByUser` reads only the pending-or-active row. `user_current_unique` guarantees at most
one match, so there is nothing to choose between and no ordering rule to get wrong.

**Historical permissions are stored, and are never current capabilities.** When a membership becomes
`inactive` its `permissions` array is **preserved for history and audit** and is deliberately **not**
cleared — an audit trail that erases what somebody was allowed to do cannot answer what they were
allowed to do. Being history, it:

- is **not** returned as a current capability;
- is **not** exposed through `CompanyContext`;
- grants **no** Employee Management access;
- grants **no** company or project authority;
- affects **no** routing.

**Stored historically ≠ currently authorized.** The read is what enforces it: an ended row never
becomes a company context, so its permission list has nowhere to reach.

### The employee flow — built, and what is still owed around it

The lifecycle in [The employee lifecycle](#the-employee-lifecycle) is **implemented**: the owner's
invitation endpoint, the matching claim inside Register, single approval, and approving every
waiting activation at once. Approving *several* is the single-approval route called per row; a
subset endpoint is a small addition if a screen wants one call for it.

Because the pending list is *the invited row itself*, somebody who merely types a company name has
no row to claim and **can never appear in it**. That is structural, not a filter that could be
forgotten.

**Still owed around it, and none of it is invented here:**

- **The Employee Management screen exists as a defined feature and is not wired to these
  endpoints yet.** It owns company member management, opening invitations, employee status, pending
  approvals, individual and bulk approval, and member details — these four routes are what it will
  call. Until it is integrated, an owner can invite and approve over the API only.
- **No public Register affordance for the employee path on the web client** beyond the fields the
  screen now collects — see the client's own notes.
- **Browse must exclude employees.** Browse selects people holding an `owner` membership, and
  Browse is not built, so there is nothing to enforce it in yet. The rule is recorded, not coded.
- **Employee availability is a separate future concept.** It must never reuse or overwrite
  `companies.availability`, and its vocabulary is not invented yet.
- **Leaving a company** has no endpoint: `inactive` exists in the enum with no path to it.
- **A second live membership is refused by `user_current_unique`**, which surfaces as a driver error
  rather than a named failure. It cannot happen through Register — a registration creates a new
  account — so it is a gap that only opens when a joining flow for existing accounts is built, and
  that flow will need a named error of its own.

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
| `INVITATION_NOT_FOUND` | 409 | Employee registration matched no open seat |
| `INVITATION_AMBIGUOUS` | 409 | Employee registration matched more than one open seat |
| `COMPANY_PERMISSION_DENIED` | 403 | The caller lacks `company.invite_employees` |
| `NO_ACTIVE_COMPANY` | 403 | The caller holds no active company membership |
| `PENDING_ACTIVATION_NOT_FOUND` | 404 | No pending activation matched in this company |
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
