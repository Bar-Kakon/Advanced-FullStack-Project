# Blokta

A coordination platform for construction contractors. Contractors, professionals and suppliers
register a business, build a network, run projects with a real construction sequence, and
coordinate schedule changes between the parties who are actually affected by them.

The interface is Hebrew-first (RTL) with a full English translation; every screen renders in both.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Redux Toolkit, MUI, Emotion, Axios |
| Backend | Node 20+, Express 5, TypeScript, Mongoose 9 |
| Database | MongoDB |
| Auth | JWT access tokens + HttpOnly refresh-token cookie, bcrypt, Google Sign-In |
| Email | Brevo SMTP via Nodemailer |
| Billing | PayPal Subscriptions (Sandbox) |
| Maps | Google Routes API + Places API (New), server-side only |
| Verification | Custom TypeScript suites over the real HTTP API; Playwright for browser suites |

## Repository structure

```
Backend/
  src/
    app.ts  server.ts         Express application and its entry point
    config/                   environment loading and validation
    db/                       Mongoose connection
    middleware/               validation, rate limiting, error handling
    routes/                   route composition
    features/                 one folder per domain (see below)
  scripts/                    verification, migration and seed scripts
Frontend/
  src/
    App.tsx  main.tsx         router and React root
    api/                      typed API client, one module per domain
    auth/                     session, token storage, route guards
    store/                    Redux Toolkit store and slices
    i18n/                     Hebrew and English string resources
    components/               shared UI
    features/                 one folder per screen area
docs/                         database design and decision map
```

Backend domains under `Backend/src/features/`: `auth`, `users`, `companies`, `projects`,
`projectaccess`, `projectmembers`, `projectdashboard`, `tasks`, `coordination`, `workplans`,
`calendar`, `flexibility`, `browse`, `network`, `connections`, `blocks`, `mutes`, `reports`,
`moderation`, `billing`, `contact`, `dashboard`, `files`, `location`, `ratings`, `workentries`,
`messaging`, `notifications`, `settings`, `scheduleexceptions`.

---

## Implemented features

**Authentication.** Registration for business owners and for employees claiming an invited seat,
with a recorded Terms of Use acceptance carrying its version. Login, logout, forgot/reset password,
and token-version invalidation so a password change ends every existing session. Google Sign-In
verifies the ID token server-side against Google's published keys; there is no client secret.

**Profiles and discovery.** Profile with specialties, location and travel radius, avatar and
completed-work entries. Browse contractors with filters, ratings and a flexibility score. Public
profile with server-enforced phone visibility. Connections, and blocks.

**Projects.** Create and edit projects with type, size and a working calendar. Project members and
invitations. Per-project permission grants plus a Full Authority flag, and reusable permission
templates. Project dashboard.

**Tasks.** Create, view and assign tasks; start and complete; private per-person sub-task lists;
work plans with versioning; a project stage graph with dependencies and gates.

**Schedule coordination.** Date-change proposals, cascade computation across dependent work,
counters, alternatives, partial release, and responsibility handoff. Every step writes to the
project audit trail.

**Confidential Delegation.** A responsible professional may hand work to a delegate who stays
invisible to the project. Eligibility is the account/company-level `contractorCategory` being
`subcontractor` (קבלן משנה) and nothing else — a project role never grants it, and a
קבלן ביצוע ראשי account is never offered it. The project-facing responsible party remains the
delegator everywhere: task DTOs, audit, members, notifications and reports.

**Moderation and platform audit.** User reports, an admin moderation queue, account restriction and
its removal. A separate append-only platform audit log records administrative actions, with an
admin-only paginated read surface at `/admin/audit`.

**Account lifecycle.** Account deletion is recoverable: the record and all history are preserved,
access is blocked, and restoration is an explicit admin action that is itself audited.

**Subscriptions.** Plan catalogue, current plan, checkout and scheduled plan changes through the
PayPal provider. With no PayPal configuration the provider is `none`: the Free plan works
completely and checkout answers `BILLING_PROVIDER_NOT_CONFIGURED`.

**Contact and Terms.** A Landing contact form stored server-side and announced by email, and the
Terms of Use modal shown at registration.

**Messaging.** Inbox and threads, private conversations and project rooms. A connection never gates
a first message: first contact opens a **message request**, which the recipient accepts or declines.
Deleting a chat is a **per-user hide** — no history is removed, the other participant's copy is
untouched, and the next message from either side restores the same conversation with all of it.
Project rooms read live active project membership, so an invited-but-not-accepted member has no
access. A **work agreement** is a structured message inside the thread; accepting it creates the
canonical Task exactly once. Message reports go into the existing moderation queue. Every message
shows its persisted send time, with the date rendered once per calendar day.

**Notifications and Settings.** Fifteen notification types with a fixed blocking/non-blocking class;
blocking notices appear in-app on every plan and open a 90-minute grace window before the email is
sent, cancelled if the notice is read inside it. Non-blocking events aggregate into a daily digest.
Settings holds language, notification preferences, operational email opt-in and contact visibility.
Mute has all three approved scopes — project, conversation and contractor — on one canonical model.
It is a delivery preference and nothing else: a muted target still writes its domain event, still
delivers a blocking in-app notice, and loses only the email channel and digest inclusion. It never
changes access, authority or domain state, and it is not a block.

**Edit Task and Schedule Exceptions.** Editing an existing task is gated on its own `task.edit`
permission, never on `task.create`; committed project dates still change through the
Proposal/Cascade path. Schedule exceptions record working days that will not be worked and rest
days that will, with an approval workflow and an append-only history.

**Redux.** `Frontend/src/store/` holds exactly the state that is genuinely shared across screens:
the UI language (`uiSlice` — read by every screen through `useLanguage`, written by the navbar
toggle) and the unread notification count (`sessionSlice` — fetched once per mount and rendered by
the navbar on every screen). Who is signed in is deliberately NOT in the store: route guards read
it synchronously on the first render and it must survive a reload, so it stays owned by
`AuthContext` over `tokenStorage`. Server data keeps to its own API modules and is never copied
into Redux, and no form state goes near it.

**Lazy loading.** Every route past the entry screens is code-split with `React.lazy` behind a single `Suspense` inside the
router. Landing, Login and the 404 screen stay in the initial bundle because they are the first
paint. The production build emits 69 chunks and no longer trips the 500 kB chunk warning.

### Known gaps

Real-time delivery is out of scope: the notification count and conversation history are as fresh as
the screen the person just opened. Message attachments are modelled but no upload endpoint is wired
to them yet.

---

## Deployment structure

Two services, deployed separately, talking over HTTPS.

```
  Browser
     |
     |  https  (VITE_API_URL)
     v
  Vercel  ──────────────►  Render  ──────────────►  MongoDB Atlas
  React SPA                Express API
  static build             long-lived process
                                |
                                └──►  PayPal Sandbox webhook
                                      POST {API_PUBLIC_URL}/api/billing/provider-events
```

**Frontend — Vercel.** A static Vite build; there is no server-side rendering and no Node runtime.
Build command `npm run build`, output directory `dist`, root directory `Frontend`. Because the
router owns every path, Vercel must rewrite unmatched requests to `index.html`, or a refresh on
`/messages` returns a 404 from the CDN rather than reaching React.

**Backend — Render.** A Node web service running the compiled Express app: build `npm install &&
npm run build`, start `npm start`, root directory `Backend`. It needs a persistent URL because
PayPal posts callbacks to it, which is what `API_PUBLIC_URL` names.

**The two must agree on three values, or authentication silently fails:**

1. `VITE_API_URL` (Vercel) points at the Render service, including the `/api` prefix.
2. `CORS_ORIGINS` (Render) names the exact Vercel origin. It can never be `*` — the refresh token
   travels as a credentialed cookie, and the specification forbids a wildcard origin with
   credentials.
3. `FRONTEND_URL` (Render) is the Vercel origin, because password-reset emails build their link
   from it.

Cross-site cookies also require the Render service to be reached over HTTPS, which it is by
default.

## Before production traffic

Run once against the production database, from `Backend/`, after the environment is set:

```bash
npm run seed:plans                    # the plan catalogue the Subscriptions screen reads
npm run migrate:report-indexes        # the partial unique index behind one-open-report-per-pair
npm run migrate:membership-uniqueness # one active company membership per person
npm run migrate:work-plan-indexes     # work-plan version indexes
npm run migrate:owner-main-contractor # backfills the owner seat's company position
npm run migrate:rating-context        # rating work-context backfill
```

Every one is idempotent and safe to re-run. Mongoose creates ordinary indexes on connection; these
scripts exist for the partial and unique ones, which a schema definition alone will not repair on a
collection that already holds rows.

To grant the first platform administrator:

```bash
npm run admin:grant <email>
```

Once the Render URL exists, create the PayPal Sandbox webhook against
`{API_PUBLIC_URL}/api/billing/provider-events`, subscribed to the events listed in
`Backend/.env.example`, then set `PAYPAL_WEBHOOK_ID` and `API_PUBLIC_URL` and redeploy. Plans must
also exist at PayPal: `npm run provision:paypal-plans` (idempotent).

---

## Environment setup

Requires Node 20+ and a running MongoDB (local `mongod` or a MongoDB Atlas URI).

### Backend

```bash
cd Backend
npm install
cp .env.example .env      # then fill it in
npm run dev               # http://localhost:3000
```

Environment variable **names** only — real values go in `Backend/.env`, which is gitignored and
must never be committed:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV`, `PORT` | no | runtime mode and listen port |
| `MONGODB_URI` | yes | MongoDB connection string |
| `CORS_ORIGINS` | yes | exact browser origins, never `*` |
| `ACCESS_TOKEN_SECRET` | yes | signs access tokens (min 32 chars) |
| `REFRESH_TOKEN_SECRET` | yes | signs refresh tokens; must differ from the above |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` | no | token lifetimes |
| `FRONTEND_URL` | yes | where the client is served; password-reset links build on it |
| `TERMS_VERSION` | no | version recorded with each consent |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | all or none | Brevo SMTP; unset runs in log mode |
| `CONTACT_INBOX` | no | where contact messages are announced |
| `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_TIMEOUT_MS` | no | server-side Routes + Places; unset disables location endpoints |
| `GOOGLE_OAUTH_CLIENT_ID` | no | Google Sign-In audience; unset disables Google login only |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | all or none | PayPal Sandbox; unset runs with provider `none` |
| `PAYPAL_BASE_URL`, `PAYPAL_TIMEOUT_MS` | no | defaults to the PayPal Sandbox endpoint |
| `API_PUBLIC_URL` | with PayPal | public HTTPS base the provider posts callbacks to |

The all-or-none groups are enforced at startup: a partial SMTP or PayPal set stops the server
rather than booting into a deployment that looks configured and fails on first use.

### Frontend

```bash
cd Frontend
npm install
cp .env.example .env      # then fill it in
npm run dev               # http://localhost:5173
```

`VITE_GOOGLE_OAUTH_CLIENT_ID` must match the backend's `GOOGLE_OAUTH_CLIENT_ID`.

---

## API overview

All routes are prefixed `/api`.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password` |
| Profile | `GET|PATCH /users/me`, `DELETE /users/me`, work entries and avatar |
| Companies | company profile, employees, invitations |
| Browse | `GET /browse/contractors`, `GET /browse/contractors/:userId` |
| Network | `GET /network/connections`, `GET /network/blocks` |
| Connections / Blocks | request, accept, decline, withdraw, remove, block, unblock |
| Projects | `POST|GET /projects`, `GET|PATCH|DELETE /projects/:id`, members, stages |
| Permissions | `GET /permissions`, grants and templates |
| Tasks | `POST|GET /tasks`, `GET /tasks/:id`, start, complete, delegate, private items, work plans |
| Coordination | date-change proposals, counters, alternatives, handoff, audit |
| Reports | `POST /reports/users/:userId` |
| Moderation | `GET /moderation/reports`, claim, resolve, account-action, `GET /moderation/audit`, `POST /moderation/accounts/:userId/restore` |
| Messaging | `GET /conversations`, `POST /conversations/direct/:userId`, `GET /conversations/project/:projectId`, `GET\|POST /conversations/:id/messages`, accept, decline, `DELETE /conversations/:id`, agreements, message report |
| Notifications | `GET /notifications`, unread count, mark seen |
| Schedule exceptions | request, modify, approve, reject |
| Settings | `GET\|PATCH /settings` |
| Billing | `GET /billing/plans`, `/billing/me`, checkout, scheduled change, `POST /billing/provider-events` |
| Contact | `POST /contact` |

---

## Testing and verification

Each suite boots the real application and drives it over real HTTP against MongoDB. Run them one
at a time; several register accounts and share a rate limiter.

```bash
cd Backend
npm run typecheck                 # src and scripts
npm run verify:messaging          # conversations, requests, hide/restore, agreement to task
npm run verify:phone-visibility   # roles open a number, permissions never do
npm run verify:edit-task          # task.edit, and the date boundary
npm run verify:notifications      # classes, grace window and digest
npm run verify:settings           # preferences and entitlements
npm run verify:schedule-exceptions
npm run verify:mute               # project, conversation and contractor scopes
npm run verify:platform-audit     # platform audit log, account deletion and restoration
npm run verify:moderation         # moderation queue and authority
npm run verify:reports            # user reports
npm run verify:cascade            # schedule cascade
npm run verify:audit              # project audit trail
npm run verify:projects           # projects and permissions
npm run verify:create-task        # task creation
npm run verify:task-detail        # task detail and the delegation wall
npm run verify:subscriptions      # billing and the provider boundary
npm run verify:browse             # needs the API already running on :3000
```

```bash
cd Frontend
npm run typecheck
npm run build                     # Vite production build
npm run verify:moderation-ui      # browser suites need the API and the dev server running
```

Migrations and seeds live beside them: `npm run seed:plans`, `npm run migrate:report-indexes`,
`npm run admin:grant <email>`, and others listed in `Backend/package.json`.

---

## External setup requirements

**Google Maps Platform.** A server-side key with the Routes API and Places API (New) enabled,
restricted by IP and to those two APIs. It must never reach the browser. Unset is supported: the
location endpoints answer `LOCATION_SERVICE_NOT_CONFIGURED`.

**Google Sign-In.** An OAuth 2.0 Web client id, with the client origin listed under Authorised
JavaScript origins. Not a secret, and the same value is given to the browser.

**PayPal Sandbox.** The REST app supplies the client id and secret. The webhook must be created in
the PayPal Developer dashboard pointing at `{API_PUBLIC_URL}/api/billing/provider-events` and
subscribed to the subscription and payment events listed in `Backend/.env.example`; its id becomes
`PAYPAL_WEBHOOK_ID`. Plans must also exist at PayPal — `npm run provision:paypal-plans` creates the
product and one billing plan per paid tier, and is idempotent.

> **Webhook status.** The Sandbox credentials are valid; the webhook is created once the backend
> has its public Render URL, because PayPal will not accept a `localhost` callback. Until then the
> three PayPal variables stay unset together, which is the supported `none` state: the server
> starts normally, the Free plan and the plan comparison work, and checkout answers
> `BILLING_PROVIDER_NOT_CONFIGURED` rather than pretending. Setting `API_PUBLIC_URL` to the Render
> URL and adding `PAYPAL_WEBHOOK_ID` is the whole remaining step.

## Live URLs

| Surface | URL |
| --- | --- |
| Frontend (Vercel) | https://blokta.vercel.app |
| Backend API (Render) | https://blokta.onrender.com/api |

The API answers `GET /api/health` with its status and whether the database is connected, which is
the quickest way to tell a sleeping Render instance from a broken one.

## Screenshots

_To be added before submission._ Intended set: Landing, Register (both steps), Personal dashboard,
My projects, Project dashboard, Stage graph, Task detail, Messages (thread with a work agreement),
Notifications, Settings, Subscriptions and the Admin audit log — each in Hebrew and English.
