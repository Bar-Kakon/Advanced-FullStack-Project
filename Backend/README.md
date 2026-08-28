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

Generate the two token secrets separately — the server refuses to start if they match:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Script | Does |
|---|---|
| `npm run dev` | Runs `src/server.ts` in watch mode |
| `npm run build` | Type-checks and emits `dist/` |
| `npm start` | Runs the built `dist/server.js` |
| `npm run typecheck` | Type-checks without emitting |

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
│   └── mongoose.ts        connect / disconnect / status
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
│   │   ├── company.model.ts       Mongoose Company — the business, and its availability
│   │   └── company.repository.ts  create, and the compensating delete Register needs
│   ├── users/
│   │   ├── user.model.ts       Mongoose User — identity, company link, trade, location
│   │   └── user.repository.ts  the only module that queries users for auth
│   └── auth/
│       ├── auth.module.ts              the feature's composition root; the only file given config
│       ├── auth.routes.ts              POST /register, POST /login, POST /refresh
│       ├── auth.controller.ts          HTTP boundary: read validated input, call a use case, respond
│       ├── auth.service.ts             the login and refresh use cases
│       ├── registration.service.ts     the register use case
│       ├── auth.validation.ts          JOI schemas for the register and login bodies
│       ├── auth.errors.ts              INVALID_CREDENTIALS / UNAUTHENTICATED /
│       │                               INVALID_REFRESH_TOKEN / EMAIL_ALREADY_REGISTERED
│       ├── authenticatedUser.mapper.ts document → safe wire representation
│       ├── password.service.ts         the only module that calls bcrypt
│       ├── refreshToken.model.ts       stored Refresh Tokens (SHA-256 hashes, TTL-expired)
│       ├── refreshToken.repository.ts  save / look up / retire / revoke a family
│       ├── refreshTokenCookie.ts       HttpOnly cookie transport policy
│       ├── requireAccessToken.middleware.ts  who is making this request — and nothing else
│       └── tokens/
│           ├── token.types.ts          claims, and the `typ` purpose marker
│           ├── accessToken.service.ts  issue + verify Access Tokens
│           ├── refreshToken.service.ts issue + verify Refresh Tokens
│           └── tokenPair.service.ts    sign a pair and record it — shared by Register and Login
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

`POST /api/auth/register` — the only way to create an account. It **authenticates the new user
immediately** (approved 2026-08-28), issuing the same Access + Refresh pair Login issues, through
the same `tokenPair` service. There is no second token mechanism and no weaker signup session.

One signup writes **two** documents, because a person and the business they operate through are two
different things:

```
POST /api/auth/register
  │
  ├─ 1. JOI validates the body      unknown keys stripped, so isAdmin / status
  │                                 / passwordHash in a body go nowhere
  ├─ 2. email already taken? ───────► 409 EMAIL_ALREADY_REGISTERED, nothing written
  ├─ 3. bcrypt hash (cost 12)
  ├─ 4. create the company          name, officePhone?, availability
  ├─ 5. create the user             + company id, companyStanding 'owner'
  │        └─ fails? ───────────────► delete ONLY the company from step 4, then 409/500
  ├─ 6. issueTokenPair()            the exact Login path
  └─ 7. 201 { accessToken, user }   + Set-Cookie refreshToken
```

The `email` unique index is the real guarantee; step 2 is a courtesy that makes the ordinary
duplicate cheap. No transaction is used — a standalone `mongod` has none, and the dev setup is one.

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
| `businessPhone` | ➖ | **`users.businessPhone`** — the person's number |
| `availability` | ➖ (default `open`) | **`companies.availability`** |
| `acceptedTerms` | ✅ must be `true` | **never stored** — D25 has not settled the documents |

### The three phone concepts

They live in three places on purpose, so no fallback between them is even reachable:

```
users.phone            personal / login   ← onboarding step 3. Register never asks.
users.businessPhone    the individual     ← Register, optional
companies.officePhone  the organization   ← Register, optional
```

Either optional phone may be present without the other, and omitting both is valid.

### Availability belongs to the business

`companies.availability` is the single source of truth for whether an organization is taking new
work. It is **not** duplicated onto users and there is no per-user override: everyone working under
a company derives their effective availability from it. Browse chooses its own read strategy when
it is built.

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
| `UNAUTHENTICATED` | 401 | The Access Token was missing, malformed, expired, or was not an Access Token |
| `INVALID_REFRESH_TOKEN` | 401 | The Refresh Token was missing, malformed, expired, unknown, already spent, revoked, or was not a Refresh Token |
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
