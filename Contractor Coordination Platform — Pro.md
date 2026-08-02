# Contractor Coordination Platform — Project Source of Truth

> **Living document.** This is the single source of truth for the project: what we're
> building, how it's structured, what's decided, what's still open, what's done, and a
> running log of every bug and every decision *with the reason behind it*.
> Update it **as we go** — before or right after a change, never "later."
>
> Codename: _TBD_ · Owner: _(you)_ · Stack: React (Vite) · Node/Express · MongoDB/Mongoose · JWT · Multer
> Last updated: **2026-08-02**
>
> **Companion document:** the full database design lives in [`docs/database-design.html`](docs/database-design.html)
> — an interactive entity map, per-collection schemas, and the reasoning behind every modelling choice.
> This MD stays the source of truth for *decisions*; that file is the source of truth for the *schema*.
>
> **Where this document lives:** the MD is maintained on **`develop`** and **`main`** only, and is kept
> byte-identical on both — an update is committed on `develop`, then `main` is fast-forwarded to that same
> commit. `feature/*` branches intentionally trail behind by documentation-only commits; that is **expected
> and correct, not drift**. A feature branch picks up the current MD when it merges into `develop`.

---

## How to use this document

**Status markers** (used in the to-do list and feature registry):

| Marker | Meaning |
|---|---|
| `Planned` | Agreed, not started |
| `In progress` | Actively being built |
| `Done` | Built **and** tested |
| `Blocked` | Waiting on a decision or a fix |
| `Cut` | Deliberately dropped (always record why) |

Use `[ ]` / `[x]` checkboxes inside task lists.

**Three golden rules:**

1. **Every change** to the project (code, structure, or scope) gets a one-line entry in the
   [Decision Log](#11-decision-log) with the *reason*. Future-you needs to know *why*, not just *what*.
2. **Every bug or problem solved** gets an entry in the [Bug & Issue Log](#10-bug--issue-log),
   so we never debug the same thing twice.
3. **Every change that touches the data model updates
   [`docs/database-design.html`](docs/database-design.html) in the same sitting** — a new collection,
   a new or renamed field, a changed relationship, an added index, a resolved open decision, or a new
   privacy/visibility rule. That file is a teaching document *and* the schema reference; a stale one is
   worse than none, because it will be trusted. It is data-driven: the whole page renders from the
   `COLLECTIONS` array (plus `FLOWS`, `TASK_FIELDS`, `OPEN_DECISIONS`…) near the top of its single
   `<script>` block, so an update usually means editing one object, not touching any markup.

**Definition of "Done":** it works, it's tested, and it didn't break existing behavior or drift
the design. Two extra gates:

- Anything touching **visibility/privacy** gets an explicit *"who must NOT see this?"* check.
- Anything with a **UI** is checked in **both languages and both directions** — Hebrew RTL *and*
  English LTR — before it's marked Done. A screen that only works in one direction is not Done. See [§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr).

---

## 1. Product overview

**The problem.** A general contractor (GC) running a construction project spends the day chasing
subcontractors and suppliers. When one slips — the drilling crew is two days late — every dependent
task downstream has to be renegotiated by phone, one call at a time. The GC ends up coordinating
instead of running the project.

**The solution.** A coordination platform where tasks have explicit dependencies. When a task moves,
the system cascades the change to affected tasks, proposes new dates to everyone impacted, and lets
each party **approve / reject / counter-propose** — in a bounded negotiation — inside the system
instead of over the phone. Everything is logged.

**What makes it more than "Trello for construction":**

- **Equal users.** Everyone is a first-class user — GCs, subs, suppliers. Roles are *not* fixed to a
  person: the same contractor can be GC on one project and a sub on another. The platform mediates
  relationships; it doesn't serve one side.
- **Confidential delegation.** (Field-confirmed as critical.) When a sub can't make a date, they
  often quietly send another contractor in their place — and the GC isn't supposed to know who's
  actually on site. The platform lets a contractor delegate work to a collaborator **invisibly to the
  party above them**. The GC sees only the sub they contracted with. The same model lets a contractor
  privately manage their own execution (sub-tasks, notes, team) hidden from the GC.
- **Trust signals that aren't gameable.** The **flexibility score** is auto-calculated from how a
  contractor actually behaves on reschedules (accept / reject / counter) — not self-reported.
- **Connection-gated messaging.** LinkedIn-style: request a connection → they accept → then you can
  message. Stops the platform becoming a supplier sales-spam channel.
- **Hebrew-first and genuinely bilingual.** The people using this are on Israeli job sites, so Hebrew
  (**RTL**) is the default language *and* the default reading direction, with English (**LTR**) as a
  complete second language rather than a fallback. This is a product requirement, not polish: a
  subcontractor who can't comfortably read the screen won't use the platform, and the whole value
  depends on *every* party being in the system. Full rules in [§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr).

**Deliberate non-goals** (these protect the trust model — don't "helpfully" add them later):

- **No pricing or money flow.** Rates are confidential in this industry; touching them kills adoption.
- **No contract templates.** Every job is different — the platform just exchanges files.
- **No progress nagging.** Binary **start / complete** only. Contractors are on job sites, not at desks.

**Stretch goal (only if time allows):** a personal rules engine — contractors configure automatic
actions on top of the coordination layer.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite), React Router, Axios, **Context API** + **Redux** |
| Backend | Node.js, Express |
| Database | MongoDB + Mongoose |
| Auth | JWT, bcrypt |
| File upload | Multer (storage approach is an [open decision](#7-open-decisions)) |
| Localization | Hebrew (**RTL**, default) + English (**LTR**) — mechanism under React is [D10](#7-open-decisions) |
| Deployment | Client → Vercel (or Netlify); Server → Heroku |

---

## 3. Architecture & main flow

> This section is intentionally high-level for now. It **will change** as we build. We firm up the
> data model and API surface stage by stage rather than designing everything up front.

**Big picture:**

```
React SPA  ──HTTP (Axios)──►  Express REST API  ──Mongoose──►  MongoDB
(Vercel)                       (Heroku)                         (Atlas)
```

**Auth flow (Stage 1–2):** user logs in → server verifies (bcrypt) → returns JWT → client stores token
and attaches it to requests (Axios interceptor) → protected routes verified by auth middleware (server)
and a `PrivateRoute` wrapper (client).

**Core domain loop (Stage 3+):** projects contain tasks → tasks have dependencies (a DAG) → changing a
date triggers a **cascade** to affected tasks → each affected party gets a **reschedule proposal** they
can approve / reject / counter → the resolution is written to the **audit log** and feeds the
**flexibility score**. The exact cascade and negotiation semantics are an [open decision](#7-open-decisions).

**Privacy layer (Stage 5):** delegation and the private execution layer are added *on top of* a working
simple-visibility model — not built in from day one. All task data leaves the server through a single
viewer-aware serializer so visibility is enforced in exactly one place.

### 3.1 Repo structure (skeleton — grows over time)

Working assumption: **one repo, two folders** (simplest for a solo project; revisit if it gets painful).

```
project-root/
├── client/                  # React (Vite) — deploys to Vercel
│   └── src/
│       ├── components/      # reusable UI (Navbar, Spinner, ErrorMessage, PrivateRoute…)
│       ├── pages/           # route-level screens
│       ├── store/           # Redux: slices, actions, reducers
│       ├── context/         # Context API (e.g. current user, theme)
│       ├── api/             # Axios instance + API call modules
│       ├── hooks/
│       └── utils/
├── server/                  # Node/Express — deploys to Heroku
│   ├── models/              # Mongoose schemas
│   ├── controllers/         # request handlers / business logic
│   ├── routes/              # route definitions
│   ├── middleware/          # auth, error handling, etc.
│   ├── validation/          # JOI schemas
│   ├── config/              # db connection, env
│   └── server.js
└── PROJECT.md               # this file
```

### 3.2 Data model (entity index — full design in the companion HTML)

> **This table is the index; the design lives in [`docs/database-design.html`](docs/database-design.html).**
> That file holds every field, every index, the Mongoose schema, a sample document, and the *reason* for
> each embed-vs-reference call — plus an interactive entity map, a serializer/visibility simulator, and
> step-by-step flows. The design is still confirmed stage by stage as we build (we do not pre-optimise),
> but it is no longer "TBD": it is a worked model with its assumptions written down and its remaining
> [open decisions](#7-open-decisions) mapped to the exact fields they would change.
>
> Golden rule 3 applies: **change the model, change that file in the same sitting.**

| Collection | Purpose | Notes |
|---|---|---|
| `users` | Account + identity (specialties, location, bio, avatar), computed rating + flexibility, global `isAdmin` flag | The **only** global role is `admin`. Secrets carry `select: false`. Holds `language` (`he`/`en`) — see [§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr) |
| `connections` | The request → accept graph between users | Gates messaging. Junction with a sorted `pair` + unique index = one edge per pair in either direction |
| `ratings` | One peer score per shared **completed** task | Gate enforced by a unique index; feeds `users.ratingSummary` |
| `projects` | Container for tasks; has an owner | Deliberately thin — members and tasks live in their own collections |
| `memberships` | A `user × project` link holding the **per-project role** | Role lives here, *not* on the user. Also the write-side authorisation table |
| `tasks` | Project task **or** standalone job (`project: null`); binary status; dependencies; assignee | DAG via `dependencies` + a multikey index (the cascade's core query). `assignee` is GC-visible (= delegator); `delegate` and the whole private layer are delegator-and-down only — see §3.3 |
| `fileassets` | Versioned uploaded files (PDF/images), GridFS-backed | 16 MB document cap makes inline bytes impossible for 30 MB uploads → D1. `visibility: private` = delegation-private upload |
| `rescheduleproposals` | The negotiation object; carries the proposal state machine | Embedded `items[]` = one atomic document, so concurrent responses cannot interleave. Semantics still D2 |
| `auditentries` | Append-only history of what changed and who changed it | `actor` is **always the delegator**, never the delegate. Snapshots the actor name so history survives soft-delete → D8 |
| `threads` | Direct (connection-gated), project, and GC-moderated conversations | Denormalised `lastMessageAt`/preview so the inbox is one query |
| `messages` | One document per message; attachments; agreement form → auto-task | The canonical never-embed case (unbounded + 16 MB cap) |
| `notifications` | Invitations, schedule changes, approvals/counters, etc. | Self-contained `payload` snapshot → no joins at render. Delivery method is D3 (no schema impact) |
| `mutes` | Contractor / project / conversation mutes | One collection, not three arrays, so Settings can list them all in one query |
| `reports` | User-filed reports for admin review | Snapshots the reported content — evidence must outlive it. Admin module (late stage) |
| `plans` | Seeded catalogue of subscription tiers: prices per currency and every numeric limit | Three documents (`free`/`basic`/`premium`). Codes only, no stored labels — the UI is bilingual. All limits carry `provisional: true` |
| `subscriptions` | One document per subscription period a user has held; the `active` one is current | Sale is snapshotted (`planCode`, `amountMinor`, `currency`), never re-read from the catalogue. A **partial unique** index allows exactly one active row per user |
| `usagecounters` | Metered allowance per user × metric × week — today only `cascade_simulation` | Quota enforced inside the update filter, so two concurrent requests cannot both spend the last unit. Unlimited tiers write nothing |
| `rules` | Personal automation rules | **Stretch only** — deliberately referenced by nothing else, so it can be cut without a migration |

### 3.3 Delegation visibility model (depth = 1)

> **Decided (D7, 2026-06-02): single-level delegation only — no re-delegation.** A delegate cannot
> delegate the work onward. If a delegate can't do it, the **original assignee** (the delegator) simply
> picks a different delegate. This keeps the privacy model to exactly **one hop in each direction**.

**The visibility triangle.** For a task the GC assigned to a delegator, who then delegated to a delegate:

```
   GC  ◄──sees──  Delegator  ◄──sees──  Delegate
   (party above)              (chose them)      (knows who they work for)

   GC  ──✗ does NOT see ✗──►  Delegate      (the core privacy guarantee)
   Delegate  ──✗ does NOT see ✗──►  GC       (work came from the delegator, full stop)
```

- **GC (the party above) sees only the delegator.** The delegate is invisible to them. This is the
  load-bearing guarantee — the GC believes the delegator is doing the work.
- **Delegator sees the delegate.** They chose them; the delegate is in their collaborator list; they're
  managing the relationship.
- **Delegate sees the delegator, not the GC.** From the delegate's side the work came from the delegator
  and that's the only relationship that exists.

**Constraints this forces (the serializer must implement all of these):**

1. **Task `assignee` stays the delegator on the GC-facing view.** The GC's contract of record is with the
   delegator. The `delegate` is a separate field visible only to the delegator-and-down — never serialized
   toward the party above. *(Updates the `Task` entity note in §3.2.)*
2. **Invisibility is symmetric, so it extends past the single task to the whole project context.** Because
   the delegate is invisible to the GC, the reverse must also hold or it's a one-way leak: the delegate must
   **not** see the project's other members, the ownership of other tasks in the DAG, or the project audit
   log — those would expose the GC and the wider project the delegate was never introduced to. The delegate
   sees a narrow slice: their task, its dates, its files, and the delegator. **Open sub-question** (parked):
   when the delegate views their task's *dependencies*, do they see the upstream **dates** (needed to know
   when they can start) while the upstream **owners** stay hidden? Leaning yes — dates visible, owners not —
   but confirm at Stage 5.
3. **The cascade/negotiation runs against the delegator, never the delegate.** This follows from the spec's
   "private execution layer" + "GC-visible status set manually," now sharpened by D7. There are two layers:
   - **Public layer — GC ↔ Delegator:** appears in the project, logged in the project audit, drives the
     *delegator's* public flexibility score. The GC only ever sees the delegator proposing/approving.
   - **Private layer — Delegator ↔ Delegate:** the delegate's real start/complete and any "I'll be late"
     live here, invisible to the GC. The delegator decides whether to absorb the slip or pass it up to the
     GC as a reschedule request, and **manually** sets the GC-visible status.
4. **Audit log names the delegator as the actor**, never the delegate (the serializer applied to audit entries).

**Note for the still-open D6 (flexibility formula):** D7 means a contractor accrues reschedule behaviour in
*two* roles — as a delegator negotiating up toward a GC, and as a delegate negotiating toward a delegator.
Whether those roll into one score or stay contextual is part of D6, now with this wrinkle attached.

### 3.4 Bilingual & bidirectional UI (Hebrew RTL default · English LTR)

> **A product requirement, not a feature.** Every screen, every label, every error, every notification
> exists in **both** Hebrew and English. Hebrew is the default. This is cross-cutting: it is not a row in
> the roadmap that can be cut, it is a constraint on every row.

**Two axes that must not be confused.** *Language* is which strings appear; *direction* is which way the
layout flows. They happen to move together here, but they are handled by different mechanisms — swapping
strings does not mirror a layout, and mirroring a layout does not translate anything.

| | Hebrew (default) | English |
|---|---|---|
| `lang` | `he` | `en` |
| `dir` | `rtl` | `ltr` |
| Sans | Heebo | Inter |
| Serif | Frank Ruhl Libre | Fraunces |
| Mono | IBM Plex Mono (both) | IBM Plex Mono (both) |

**Rules for every screen from here on:**

1. **Direction lives on `<html>` and nowhere else.** `<html lang="he" dir="rtl">` ⇄ `<html lang="en" dir="ltr">`.
   Everything below inherits. *Current debt:* the static prototypes hard-code `<html lang="he">` and flip
   `direction: ltr` on individual containers instead — so a screen reader announces the English text as
   Hebrew. Tracked in [§8](#8-known-issues--risks); it resolves in the React migration.
2. **Logical CSS properties only — never `left`/`right`.** Use `margin-inline-start`, `padding-inline-end`,
   `inset-inline-start`, `border-inline-start`, `text-align: start` / `end`. A layout built from logical
   properties mirrors itself for free. A single hard-coded `left` is a bug that is invisible in one
   language and obvious in the other.
3. **Mirror what is directional; leave everything else alone.** Mirror: arrows, chevrons, back/next
   buttons, progress-bar fill, the timeline and the dependency-DAG flow direction. Do **not** mirror:
   logos, avatars, photos, the hard-hat warning icon, clocks, phone numbers, or media controls.
4. **`dir="auto"` on every field that renders user-generated content.** A bio, a task title, a project
   name, a message body — these are in whatever language the person typed, which is **not** necessarily
   the UI language. A Hebrew message inside an English UI renders with its punctuation in the wrong place
   unless the browser is allowed to decide per string.
5. **Isolate mixed-direction runs.** Hebrew text containing Latin digits, a model number or a brand name
   is bidirectional *within a single string*. Wrap the embedded run in `<bdi>` (or `unicode-bidi: isolate`)
   so the surrounding text can't reorder it. Format dates and numbers with `Intl.DateTimeFormat` /
   `Intl.NumberFormat`, never by concatenating strings.
6. **Both languages are checked before anything is Done** — see the definition of Done above.

**Data-model consequences.** Bilingualism is not only a UI concern; it constrains what may be *stored*.
All of this is reflected in [`docs/database-design.html`](docs/database-design.html):

- **`users.language`** (`'he' | 'en'`, default `'he'`). `localStorage` is per-device — a contractor who
  switches to English on the site-office desktop should not be back in Hebrew on their phone. localStorage
  stays as the pre-login default only.
- **Enums are stored as language-neutral codes.** Trades, regions, roles, statuses, notification types and
  audit actions are stable ASCII keys (`'concrete'`, `'gc'`, `'not_started'`) translated at render time.
  Storing the Hebrew label would make the English UI impossible *and* would invalidate every index the
  first time a translation is corrected.
- **Nothing user-visible is stored pre-rendered.** `notifications.payload` holds the *parts*
  (`taskTitle`, `proposerName`, dates) and the client composes the sentence from `type`. Otherwise a
  notification created in Hebrew stays Hebrew forever, including after the user switches to English.
  Same reasoning for `auditentries`: an `action` enum plus a `changes` diff, composed client-side.
- **The API returns error *codes*, not error *messages*.** `{ error: 'INVALID_CREDENTIALS' }`, translated
  by the client. Otherwise the unified login error only exists in one language.
- **Sorting Hebrew needs a collation.** MongoDB sorts byte-wise by default, which is not alphabetical for
  Hebrew. Sorting contractors by name uses a MongoDB collation (`{ locale: 'he' }`) or `Intl.Collator`
  client-side. Rating and flexibility sort numerically and are unaffected.

**Migration path — the current approach does not scale.** The static prototypes duplicate every string as
`.he-text` / `.en-text` and swap them with a hidden-radio CSS toggle, because that is the only way to do it
with no JavaScript. The cost is already visible on the register screen: the DOM carries every string twice,
the trade `<select>` had to be duplicated wholesale (option text can't use the span trick), and the form
needs `novalidate` because the hidden inactive-language inputs would otherwise block submit. Across 36
screens this is unmaintainable. **Under React it becomes one set of components plus a translation resource
file**, with the active language in Context and `dir` set on `<html>`; the duplicate-markup pattern is
dropped entirely. Exactly how is [D10](#7-open-decisions).

---

## 4. Roadmap (stages)

Built so that **after Stage 3 we already have a complete, deployed, gradeable full-stack app** that
satisfies the syllabus. Stages 4–5 earn the "more than Trello" distinction. If time runs short, we cut
**from the back**.

1. **Foundations & walking skeleton** — repo structure, Express+Mongo, JWT scaffolding, one protected
   route, React+Vite app that logs in and hits it, error handler + JOI + Axios + PrivateRoute skeletons.
   **Deploy this thin slice immediately** to prove the pipeline.
2. **Identity & access** — full register/login, profile wizard, my/public profile, settings, browse
   contractors, network (request → accept → gate). Context (current user) + Redux store land here.
3. **Projects, membership, tasks — simple visibility only** — projects CRUD, membership/roles, tasks/jobs,
   binary start/complete, dependency picker **with cycle prevention**, dashboard (timeline + DAG view),
   Multer uploads. **No delegation yet.** ← *complete gradeable app at this point.*
4. **Cascade & negotiation** — naive delta-propagation, reschedule proposal + before/after review,
   approve/reject/counter state machine, audit log, flexibility score on resolution, schedule notifications.
5. **Dual-visibility privacy & delegation** — centralized viewer-aware serializer, private execution layer,
   invisible delegation, receiver-only classification, manual GC-visible status. Heavy testing.
6. **Communication & polish** — inbox (direct/project/GC-moderated), attachments, agreement-form →
   auto-task, full notifications, mute controls, performance pass (lazy loading + memoization).
7. **Admin & moderation, then rules engine (stretch)** — trim from here first if time is tight.

---

## 5. Current focus — To-do

**▶ Stage 1: Foundations & walking skeleton**

- [ ] Initialize repo (`client/` + `server/`), `.gitignore`, env handling (never commit secrets)
- [ ] Server: Express app with folder skeleton (`models/controllers/routes/middleware/validation/config`)
- [ ] Server: MongoDB connection via Mongoose (Atlas)
- [ ] Server: global error-handling middleware
- [ ] Server: JOI validation skeleton on one example route
- [ ] Server: JWT scaffolding (sign/verify util + auth middleware)
- [ ] Server: one protected test route (e.g. `GET /api/health-auth`)
- [ ] Client: Vite + React app boots
- [ ] Client: Axios instance (base URL + token interceptor)
- [ ] Client: React Router + `PrivateRoute` wrapper
- [ ] Client: minimal login that hits the protected route **end-to-end**
- [ ] Client: Redux store skeleton + Context skeleton (current user)
- [ ] Deploy thin slice: client → Vercel, server → Heroku; verify the live URL works
- [ ] README with run instructions

_Later stages live in the [Roadmap](#4-roadmap-stages); we'll expand the next one into a checklist when we reach it._

---

## 6. Feature registry

> One row per feature, mapped to a stage. Status updates as we build. (Maps to the lecturer-approved
> 36-screen list; many "screens" are popups/components, not routes.)

| Feature | Stage | Status | Notes |
|---|---|---|---|
| **Bilingual UI (Hebrew RTL default / English LTR)** | **all** | In progress | **Cross-cutting — constrains every row below, and cannot be cut.** Static screens use `.he-text`/`.en-text` duplication + a CSS-only toggle; becomes a React resource file + Context (D10). Every new screen ships bilingual and is checked in both directions. See [§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr) |
| Language preference saved to the account | 2 | Planned | `users.language`; `localStorage` (`screens/lang.ts`) stays the pre-login default only |
| Landing | 1–2 | Planned | Not started yet; will stay plain HTML/CSS before React migration |
| Register | 1–2 | In progress | Register screen HTML/CSS is actively being refined as a luxury blueprint-board prototype (`screens/register.html` + `screens/register.css`) |
| Login | 1–2 | In progress | Login screen HTML/CSS exists (`screens/login.html` + `screens/login.css`), but its CSS still needs to be updated to match the newer register-screen visual direction |
| Forgot / Reset password | 1–2 | In progress | Static HTML/CSS on `feature/login-screen` (`screens/forgot-password.html` + `screens/reset-password.html`), reusing `login.css`. Full CSS-only flow: request link → check-inbox → set new password → success. Email dispatch + single-use-token verification wired in Stage 2 |
| JWT auth + protected routes (both sides) | 1–2 | Planned | bcrypt for passwords |
| Profile completion wizard | 2 | Planned | Part of registration |
| My profile / Public profile | 2 | Planned | Public profile = feature, not standalone route |
| Settings (account / notifications / deactivate-delete) | 2 | Planned | Confirmations are popups |
| Subscriptions / plans | 2 | In progress | Static HTML/CSS prototype on `feature/subscriptions-screen` (`screens/subscriptions.html` + `screens/subscriptions.css`): three tiers (Free / Basic / Premium), full comparison table, FAQ. **Prices and every tier limit are provisional** and marked as such on the screen itself. Billing and checkout are not started. An **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included; it is not one of the original 36 rows. Data model designed — see [D11](#7-open-decisions) |
| Browse contractors | 2 | In progress | Static HTML/CSS prototype done (`screens/browse-contractors.html`): reusable navbar, filter rail (specialty/region/rating/flexibility), rich cards with rating + flexibility gauge + connection states. Real filtering/search/pagination wired in React (Stage 2) |
| My network (connection request → accept → gate) | 2 | Planned | Gates messaging |
| Projects CRUD + dashboard | 3 | Planned | Dashboard includes timeline + DAG view + audit |
| Project members + per-project roles | 3 | Planned | Role lives on membership |
| Tasks / standalone jobs + binary start/complete | 3 | Planned | |
| Dependency picker + **cycle prevention** | 3 | Planned | Prevents illegal edges in the DAG |
| File upload (work plans, versioned) | 3 | Planned | Storage approach is an open decision |
| Cascade (delta-propagation) | 4 | Planned | Naive first, not critical-path |
| Reschedule proposal review (approve/reject/counter) | 4 | Planned | Semantics = open decision |
| Audit log | 4 | Planned | Part of project dashboard |
| Flexibility score (auto-calculated) | 4 | Planned | Computed on proposal resolution |
| Confidential delegation + private execution layer | 5 | Planned | Built on top of simple visibility |
| Viewer-aware task serializer | 5 | Planned | Single source of visibility enforcement |
| Inbox (direct / project / GC-moderated) | 6 | Planned | |
| Agreement form → auto-task creation | 6 | Planned | Refinement over plain task creation |
| Notifications (full) | 6 | Planned | Delivery method TBD |
| Mute controls (contractor/project/conversation) | 6 | Planned | Reusable component |
| Performance pass (lazy load + memoization) | 6 | Planned | Syllabus requirement |
| Admin: users / reports / stats | 7 | Planned | Effectively a second app — late |
| Report submission (user side) | 7 | Planned | |
| Rules engine (My rules + rule editor) | 7 | Planned | **Stretch** |
| 404 page | any | Planned | |

---

## 7. Open decisions

> Parked on purpose. We decide each when we reach the stage that forces it. Don't pre-optimize.

| # | Decision | Options on the table | Decide by | Status |
|---|---|---|---|---|
| D1 | **File storage** | GridFS (keeps full 30MB, more work) **vs.** cap at ~15MB as a Buffer in the doc (simpler, but bloats docs / bad practice). Relevant constraint: MongoDB has a hard 16MB/document limit, and Heroku's filesystem is ephemeral so local disk is not an option. | Stage 3 | Open |
| D2 | **Cascade negotiation semantics** | Per-task proposals (a downstream rejection leaves that task unresolved + flagged) **vs.** one bundled proposal everyone votes on. Open sub-questions, all undecided: what "one round" means exactly; whether a counter-proposal — which proposes a *different* date and so may have its *own* downstream cascade — can re-trigger the cascade; and the state transitions to pin down (candidates: `pending → approved / rejected / countered`; a counter must be accepted by the original proposer or it lapses; probably no counter-to-a-counter). **This needs to be drawn on paper before any cascade code — see the risk in §8.** | Stage 4 | Open |
| D3 | **Notification delivery** | Fetch-on-load **vs.** simple polling. (Real-time/websockets is explicitly **out** — too big a rabbit hole, not required.) | Stage 4/6 | Open |
| D4 | **Repo layout** | One repo with `client/` + `server/` (current assumption) **vs.** two repos. | Stage 1 | Leaning monorepo |
| D5 | **Data model relationships** | Embed vs. reference for each entity (memberships, dependencies, messages, …). Includes: do standalone **jobs** and project **tasks** share one polymorphic model (nullable project, no dependencies) or split into two models? | Per stage | Open |
| D6 | **Flexibility score formula** | The score is "auto-calculated from reschedule behaviour" — but the formula is undefined: weighting of accept / reject / counter, the time window, whether it decays, and the cold-start value for users with no history. | Stage 4 | Open |
| D7 | **Delegation depth** | ✅ **CLOSED (2026-06-02): single-level only, no re-delegation.** A delegate cannot delegate onward; if the first delegate can't do it, the original assignee picks a different one. Visibility stops one hop in each direction (GC sees delegator; delegator sees delegate; delegate sees delegator but **not** the GC). Full model + derived constraints in **[§3.3](#33-delegation-visibility-model-depth--1)**. | — | **Closed** |
| D8 | **User removal semantics** | Deactivate vs. delete: what happens to the user's projects, tasks, connections, messages, and audit-log entries. You can't hard-delete someone referenced in other people's audit history without breaking it → likely forces soft-delete. | Stage 2 (settings) | Open |
| D9 | **Messaging gate scope** | Gated by *connection only*, or *connection OR shared project*? And what happens to an existing thread on disconnect / block / mute? | Stage 6 | Open |
| D10 | **i18n mechanism under React** | Hand-rolled — a `LanguageContext` plus `strings.he.json` / `strings.en.json` (no dependency, full control, but ~36 screens of keys maintained by hand and pluralisation written from scratch) **vs.** a library such as `react-i18next` (interpolation, pluralisation, lazy namespaces — at the cost of a dependency and a learning curve). Open sub-questions: does the URL carry the locale (`/he/projects`) or is it invisible state? Which language do **server-side** artifacts use — password-reset emails, notification digests — the stored `users.language`, or the request's `Accept-Language`? And does the Hebrew/English toggle stay in the navbar on every screen, or move into Settings once the preference is saved to the account? | Stage 2 | Open |
| D11 | **Subscription data model & quota enforcement** | **Storage shape now designed** and reflected in `docs/database-design.html`: a seeded `plans` catalogue, one `subscriptions` document per period with a **partial unique** index permitting exactly one `active` row per user, a `usagecounters` document per user × metric × week, and a denormalised `users.planCode` read by the authorization layer. Sale values are snapshotted so a catalogue edit cannot rewrite an issued invoice; the weekly counter uses **fixed Monday 00:00 UTC boundaries** and enforces the quota **inside the update filter** (a read-then-write check loses the race). What remains open is **product, not shape**: every limit and price carries `provisional: true`; no payment provider is chosen (`provider.name` is `none` everywhere); what a *read-only* project concretely forbids after a downgrade; and whether the account country selecting `currency` becomes a field on `users` or is derived at checkout. | Stage 2 (screen) · later (billing) | Open — shape settled, product open |
| D12 | **Compiled-JavaScript tracking policy** | ✅ **CLOSED (2026-08-02): track the TypeScript sources, the compiled `.js`, and the build configuration.** A static prototype must open by double-clicking straight after a download — the same reasoning already applied to `docs/database-design.html` on 2026-07-29 — and a grader who clones the repo should not need Node installed to see a screen work. Rejected alternative: gitignore the artifacts and require `npm ci && npm run build`, which is the more canonical practice but makes a fresh clone render broken screens. Consequences: `screens/*.js` removed from `.gitignore` on every branch that had it; `lang.ts`, `validation.ts`, `register.ts`, `tsconfig.json` and `package.json` now live on `develop`; and **all three artifacts are built from the one tracked `tsconfig.json`**, never ad hoc. The cost accepted knowingly: generated files in history, and a rebuild owed before each commit that touches a `.ts`. | — | **Closed** |

---

## 8. Known issues & risks

> Awareness items to keep in front of us. Not all are decisions — some are just traps to avoid.

- **Scope volume is the real enemy.** ~36 screens for a solo project. Survive it with *ruthless
  component reuse* (one generic list, one generic form) and by cutting from the back of the roadmap.
- **Privacy leak risk (highest technical risk).** The danger isn't the UI — it's a single endpoint that
  returns a full task object and leaks the delegate/private layer. Mitigation: all task data exits the
  server through one viewer-aware serializer; add explicit *"GC must NOT see X"* tests. This privacy/
  authorization suite is the one place automated tests genuinely earn their keep — most other testing
  can be manual.
- **Authorization is a separate concern from the serializer.** The serializer governs what a user can
  *see* (read side). It says nothing about what a user is allowed to *do* (write side): reschedule this
  task, invite to this project, delegate this work. That check ("can this user perform this action on
  this resource?") must also be centralized, or it ends up scattered and inconsistent across controllers.
  **Where it lives is now decided:** the `memberships` collection is the authorization table — one helper
  resolves `(user, project) → role | null` and every controller asks it the same question. See
  [`docs/database-design.html`](docs/database-design.html) → Collections → `memberships`. The two checks
  must stay distinct: a project member is *authorized* to read a task and still must not *see* its delegate.
- **DAG cycles.** Creating dependency edge X→Y must be rejected if Y is already an ancestor of X, or the
  cascade loops forever. Cycle prevention ships with the dependency picker (Stage 3).
- **Cascade complexity creep.** Start with naive delta-propagation (shift dependents by the same amount).
  *Not* critical-path slack analysis unless there's spare time.
- **The cascade × one-round negotiation is underspecified — design it on paper before coding Stage 4.**
  The graph traversal itself is textbook; what's undefined is the negotiation on top of it. The specific
  failure mode: when the cascade fans out to several parties who vote independently, some accept and some
  reject, leaving a **partially-applied cascade and an inconsistent schedule**. Before writing cascade
  code, draw the proposal state machine and decide the rules (per-task vs. bundled, what "one round"
  means, whether a counter re-triggers a cascade). Options are parked in **D2**.
- **Heroku gotchas.** Filesystem is ephemeral (wiped on restart → never store files on disk) and there's
  no free tier anymore (small monthly cost — check current pricing; syllabus mandates Heroku so budget for it).
- **Websocket temptation.** The app *feels* real-time, but real-time is not required. Resist Socket.io.
- **Admin suite is a second app.** Orthogonal to core value and not in the syllabus — build last, trim first.
- **Date / timezone handling.** The whole app is dates and "X days late" math — a classic bug source.
  Standardize early: store dates in UTC and use a date library rather than hand-rolling arithmetic.
- **RTL/LTR is a tax on every screen, and it fails silently.** A hard-coded `left` or `right` in CSS is a
  bug that looks perfect in one language and broken in the other, so it survives review easily. Mirroring
  mistakes are worse than missing translations — a back arrow pointing the wrong way reads as *broken*,
  not as *untranslated*. Second half of the problem is **text length**: English strings are usually longer
  than their Hebrew equivalents, so a layout tuned until it just fits in Hebrew will overflow in English
  (buttons, table headers, and the navbar are the usual casualties). Mitigations: logical properties only,
  no fixed widths on anything containing text, and the both-directions check is part of the definition of
  Done. Full rules in [§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr).
- **The current bilingual mechanism is known debt, not a pattern to copy.** Duplicating every string as
  `.he-text`/`.en-text` was the right call for JS-free static prototypes and is the wrong call for 36 React
  screens. It also leaves a real accessibility bug today: `<html lang="he">` is hard-coded, so English text
  is announced by screen readers with Hebrew pronunciation. Do not extend the pattern to new screens beyond
  the ones already built — resolve it in the React migration (D10).
- **Demo seed data is a deliverable risk.** The Live Demo is graded, and a multi-party coordination
  platform is useless to demo from one empty account. You need a seed script (several users, a project
  with dependencies, a pending reschedule, a delegation). Build it incrementally as features land — not
  the night before.
- **Compiled JavaScript: resolved by policy (D12), but the branches still have to catch up.** The rule is
  now *track the TypeScript source, the compiled `.js`, and the build config together*, so a fresh clone
  opens every static screen by double-clicking. `develop` carries the sources, `tsconfig.json`,
  `package.json` and the built artifacts; `screens/*.js` was removed from `.gitignore` wherever it appeared.
  **The remaining trap is mechanical:** an ignore rule has no effect on an already-tracked path, so any
  future reversal of this policy needs `git rm --cached` and not just a `.gitignore` edit. Second trap: the
  build must be run from the tracked `tsconfig.json`, never ad hoc — `lang.js` and `validation.js` were
  originally compiled without it and therefore did not match what `npm run build` produces.

---

## 9. Working notes / scratch

_Free space for in-progress thinking, links, snippets, "remember to…" notes. Promote anything important
into a proper section or the logs below._

- (empty)

---

## 10. Bug & Issue Log

> Every problem solved goes here so we never solve it twice. Newest at top.
>
> **Format:**
> ```
> ### [YYYY-MM-DD] Short title
> - Symptom: what went wrong / what you observed
> - Cause: the actual root cause
> - Fix: what resolved it
> - Notes: anything to remember / how to avoid it next time
> ```

### [2026-06-16] Left register panel looked visually inconsistent with the right panel
- Symptom: the left side appeared to use a different shade/feeling of blue than the right side.
- Cause: the left brand panel had a stronger dark overlay/gradient treatment than the right blueprint-board surface, even though the colors were derived from the approved palette.
- Fix: changed only the left panel background so it uses the same calmer dark blueprint-board base as the right side.
- Notes: future split-screen screens should keep both sides on the same board/surface system unless a deliberate contrast is needed.

### [2026-06-16] Decorative `01` appeared on the left side of the register screen
- Symptom: a large generated `01` was visible in the left/brand panel.
- Cause: CSS pseudo-element content on `.brand-panel__inner::after` was used as decoration.
- Fix: removed the generated pseudo-element text.
- Notes: avoid decorative generated text unless it has clear product meaning; it can look like accidental content.

### [2026-06-16] Register validation needed clearer CSS-only error feedback
- Symptom: empty required fields did not get a clear red border after user interaction/submission, and password length had no inline bilingual error message.
- Cause: the first static prototype relied partly on native browser validation and only had inline text for some errors.
- Fix: added a bilingual password-length error in the HTML and CSS `:user-invalid` red borders for required inputs/selects/checkboxes.
- Notes: browser-native validation popups may follow browser language; inline `.he-text`/`.en-text` errors are the reliable bilingual layer until JavaScript validation is added.

### [2026-06-15] Approved color exceptions restored for register screen
- Symptom: after enforcing the strict palette rule, the Google sign-up icon no longer used Google's recognizable brand colors and error states no longer appeared red.
- Cause: the palette cleanup removed useful visual conventions that the project owner wants to keep as explicit exceptions.
- Fix: restored Google's original SVG fills and restored the red error token in `screens/register.css`.
- Notes: the standing rule is still the approved project palette, but Google logo colors and red error states are allowed exceptions after owner approval.

### [2026-06-15] Register screen contained non-palette functional/brand colors
- Symptom: the register screen used a red error token and the Google OAuth SVG carried Google's default blue/green/yellow/red fills.
- Cause: those colors came from common UI conventions and third-party branding, but the current project rule is stricter: only the approved palette may be used unless explicit approval is given.
- Fix: changed register error states to palette-derived primary/secondary treatments and removed hard-coded Google SVG fills from the HTML; the icon is now colored through CSS using only `--primary` and `--secondary`.
- Notes: superseded later on 2026-06-15 after explicit owner approval to keep Google logo colors and red error states.

---

## 11. Decision Log

> Every change (code, structure, scope) gets a dated line **with the reason**. Newest at top.
>
> **Format:** `[YYYY-MM-DD] What changed — why.`

- `[2026-08-02]` **Subscription data model designed, documentation scope recorded, subscriptions framing corrected, and the compiled-JavaScript policy closed (D12)** — four related corrections in one pass. **(a) Documentation scope.** Added a *Where this document lives* note to the header: the MD is maintained on `develop` and `main` only and kept byte-identical on both, so a `feature/*` branch trailing by a documentation-only commit is behaving correctly. The previous entry wrongly reported that lag as a limitation; it is not one. **(b) Framing corrected.** The subscriptions screen is described in §6 and below as an **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included. The earlier phrasing ("not on the lecturer-approved 36-screen list — an addition to scope") read as an unapproved expansion, which it is not; it would be equally wrong to call it one of the original 36 rows or a required screen. Nothing else about the screen — its history, prices, provisional limits, rationale or open questions — was altered. **(c) Data model designed** and reflected in `docs/database-design.html` per golden rule 3, reversing the earlier instruction to leave it unmodelled. Three new collections — **`plans`** (seeded catalogue: prices per currency, every limit, `provisional: true`), **`subscriptions`** (one document per period; the sale is snapshotted so a catalogue edit cannot rewrite an issued invoice; a **partial unique index** on `{ user: 1 }` filtered to `status: 'active'` makes "exactly one live subscription" a database guarantee rather than an application convention), and **`usagecounters`** (one document per user × metric × week, fixed Monday 00:00 UTC boundaries, the quota enforced **inside the update filter** because a read-then-write check lets two concurrent requests both spend the last unit). Plus a denormalised **`users.planCode`** — the third computed field on `users`, justified exactly as `ratingSummary` and `flexibility` are: the authorization layer reads the tier on nearly every request, so the cost belongs on the rare write. Money is stored in **minor units as integers**, and `taxIncluded` is per currency row, which is what records that ₪60 (VAT-inclusive) and $20 (pre-tax) are quoted on different bases. Document totals moved 15→**18 collections**, 167→**212 fields**, 40→**47 indexes**, 35→**38 relationships**; a new `billing` domain uses the approved `--secondary` tan, so no new color was introduced. **(d) D12 closed:** compiled JavaScript is tracked alongside its TypeScript source and build config, so a fresh clone opens every static screen with no toolchain.
- `[2026-08-02]` **Subscriptions screen — first prototype committed (`f83aaf1`); in progress, not reviewed** (`screens/subscriptions.html` + `screens/subscriptions.css`, on `feature/subscriptions-screen`) — first monetisation screen and the second authenticated app screen, so it **reuses** the `.app-nav` navbar, the blueprint-board background, the `.btn` variants and the CSS-only bilingual toggle from `browse-contractors` rather than inventing a second visual system. No new colors. The screen contains **no `<form>` at all**, so the no-native-validation-popups rule cannot be violated here. **Zero new JavaScript**: the three plan cards, the comparison table and the FAQ accordion (`<details>`/`<summary>`) are pure HTML/CSS, and the only script is the pre-existing `lang.js`. **Three tiers — Free · Basic ₪60/$20 · Premium ₪105/$35 per month.** The ILS prices are the ≈3.06 conversion reduced by an equal **2.06 %** on both tiers (₪61.26→₪60, ₪107.20→₪105) so the two currencies stay proportionally consistent instead of each being rounded independently. **Currency follows the UI language** (Hebrew→ILS, English→USD) because a static prototype has no other signal; the FAQ states this on the screen and records that the real system must derive currency from the **account's country** — §3.4 separates language from locale, and billing currency is a locale concern.
  **Grounded in this document:** participation in *other people's* projects is **unlimited on Free**, because §1's "equal users" model collapses if a sub must pay to answer a GC — the paywall sits on *running* projects, never on *joining* them; **confidential delegation and the private execution layer are Premium-only**, since §1 calls delegation the field-confirmed differentiator and §3.3/Stage 5 make it the most expensive thing in the build; the **rules engine is labelled "when it ships"** and never promised, because §6 keeps it a stretch; the **flexibility score is not gated at all**, since §1 makes it a trust signal and gating it would break `browse-contractors` for everyone.
  **Provisional** — and marked as such *on the screen*, in a visible strip under the cards rather than buried in fine print: every number (1/5/∞ projects, 10/100/∞ tasks, 5/25/∞ members, 20/∞ connections, 5 MB vs 30 MB files, the 30-day audit window), the sharpest gate "Free may *respond* to a reschedule but not *open* one", and email notifications at Basic+ — D3 (notification delivery) is still open, so that tier may not even be buildable as written.
  **New metered dimension — cascade simulation runs** (Free 3/week · Basic 30/week · Premium unlimited, fair use). A "simulation" is a what-if preview of a date change's downstream effect *before* any proposal is sent: the "cascade preview" named in the 2026-06-01 Context/Redux note plus Stage 4's "before/after review". **Metering it is new; the capability is not, and no public or developer API was invented** — nothing in this document describes one, so "API" here means only the internal endpoint each run calls.
  **Apparent contradiction resolved for future-you:** §1's non-goal "**no pricing or money flow**" is about **job rates between contractors** staying confidential. It is *not* a ban on the platform charging for itself. A subscription is FieldSync↔user; the non-goal protects sub↔GC. No rate, quote or payment between two platform users appears anywhere on this screen.
  **Left open rather than silently decided:** the tax line reads VAT-**inclusive** in Hebrew but tax-**exclusive** in English, so the two prices are *not* net-equivalent (₪60 incl. 18 % VAT = ₪50.85 net vs. $20 ≈ ₪61 net) — needs a call on whether both modes are inclusive; the screen is an **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included — it is not one of the original 36 rows, and not a required screen; and the entire data model behind it is new **D11**. `screens/lang.js` was committed alongside the screen as a **temporary, documented exception** to the "compiled JS is a build artifact" rule, because the screen depends on it and `lang.ts` currently exists only on `feature/login-screen` — see the new §8 entry.
- `[2026-08-02]` **Branch structure repaired, GitFlow-style model adopted, and the "MD on `main` only" rule superseded** — `develop` had sat at `83b9fb2` since 2026-06-07 with **0 unique commits and 14 commits behind `main`** while still looking like an integration branch, so `Subscriptions-Screen` — branched from it — silently inherited the **2026-06-02** MD with no §3.4 and no `docs/database-design.html`. Compounding it, all three screen branches fork **directly** from `83b9fb2` and none is merged, so `main` carried the documentation for a product whose code it did not contain. **Repair, in this order:** `develop` fast-forwarded to `main` (`e8b173f`) by moving the ref under a `git merge-base --is-ancestor` guard — no merge commit, no commit rewritten, working tree untouched; `feature/subscriptions-screen` created from the updated `develop`; the screen committed and pushed; and only then the duplicates `subscriptions` and `Subscriptions-Screen` deleted with lowercase `-d`, each first proven to hold **0 unique commits** and to exist only locally. **The model from here:** `main` = approved code · `develop` = integration · `feature/*` branches off `develop` · completed features merge into `develop` · only an approved integrated version moves `develop` → `main`; naming is `feature/kebab-case`. **This supersedes the 2026-06-17 rule "the MD is updated only on `main`"** — under the new model a direct documentation commit to `main` would violate "only approved integrated versions reach `main`", yet the MD must stay current on both. So the MD is now committed on **`develop`**, `main` is **fast-forwarded to the identical SHA**, and both are pushed, keeping a byte-identical MD on both branches. `feature/login-screen`, `feature/register-screen` and `feature/browse-contractors-screen` were deliberately **not** merged — they are still in progress. Also adopted as standing process: every change is explained (exact files, reason, alternatives, tests) and approved **before** execution, with a written report after; and commit subjects stay one short sentence, because the detail belongs in this log rather than in a commit message.
- `[2026-08-01]` **Bilingual Hebrew/English + RTL/LTR promoted from an implementation detail to a documented product requirement** (new **§3.4**, plus edits across §1, §2, §3.2, §6, §7, §8 and the definition of Done) — bilingualism was real in the code since the first register screen but existed in this document *only* as passing mentions inside decision-log entries, and RTL was named exactly once (in the flexibility-slider note). Nothing stated that every screen must ship in both languages, and nothing captured the direction rules — so each new screen was re-deriving them. Now recorded: **Hebrew RTL is the default, English LTR is a complete second language, and the requirement is cross-cutting** (a constraint on every roadmap row, not a row that can be cut). Key content: language and direction are separate concerns handled by different mechanisms; `dir` belongs on `<html>` alone; **logical CSS properties only** (`margin-inline-start`, `text-align: start`) because a hard-coded `left` is a bug that is invisible in one language; an explicit mirror / do-not-mirror list; `dir="auto"` on user-generated content, since a contractor's bio is in whatever language they typed, not the UI language; and `<bdi>` isolation for Latin digits inside Hebrew strings. Added a **both-languages-and-both-directions check to the definition of Done** — that is the part that actually prevents drift. Also logged two pieces of **known debt** in §8: `<html lang="he">` is hard-coded so screen readers announce English text as Hebrew, and the `.he-text`/`.en-text` duplication (right for JS-free prototypes, wrong for 36 React screens — it doubles the DOM, forced the trade `<select>` to be duplicated wholesale, and is why the register form needs `novalidate`). Parked the React mechanism as new **D10** (hand-rolled Context + resource files vs. `react-i18next`; whether the URL carries the locale; which language server-side emails use). **Data-model consequences also written down and reflected in `docs/database-design.html` per golden rule 3:** new `users.language` (localStorage is per-device, so a saved preference belongs on the account); enums stay **language-neutral codes** translated at render, never stored Hebrew labels — storing the label would make the English UI impossible and would break every index the first time a translation is corrected; `notifications.payload` and `auditentries.changes` stay **structured, never pre-rendered sentences**, or a notification written in Hebrew stays Hebrew after the user switches; the API returns error **codes** rather than messages; and sorting contractors by Hebrew name needs a MongoDB **collation** (`{ locale: 'he' }`), because the default sort is byte-wise and not alphabetical for Hebrew.
- `[2026-07-29]` **Full database design built as an interactive HTML companion document** (`docs/database-design.html`, new `docs/` folder) — the data model was the largest remaining "TBD" in this file, and §3.2 had only a ten-row purpose table while §3.3 described a privacy model that no schema existed to enforce. Designing it now (rather than per stage, as originally planned) was worth breaking that rule for one reason: the delegation privacy model in §3.3 is a **field-layout** problem, and discovering at Stage 5 that the field layout cannot express it would mean rewriting `tasks` and every endpoint that touches it. **15 collections, 35 relationships, 166 fields, 40 indexes** — each with the Mongoose schema, a realistic sample document, and the reasoning behind every embed-vs-reference call. Chose **one self-contained HTML file over adding sections to this MD** because the valuable parts are things prose cannot do: an entity map you click to isolate one collection's edges, a **serializer simulator** that renders the same task document as the GC / delegator / delegate / other member / outsider see it (§3.3 made executable, and the fastest way to catch a leak in the design before writing code), and six steppable flows that name the exact collections read and written at each step. Everything renders from a `COLLECTIONS` data array so updates mean editing one object, not the markup — recorded as **golden rule 3** at the top of this file, per the standing "update the doc as we go" rule. Three sub-decisions worth flagging: **(a)** the file carries **inline vanilla JS**, not TypeScript with a build step — a documented exception to the register/login-branch rule, because a project *document* must open by double-clicking with no toolchain, and a build artifact that is gitignored would make the doc unopenable from a fresh clone. **(b)** It takes a position on two open decisions without closing them: **D5** → one polymorphic `tasks` collection with a nullable `project` (splitting jobs from tasks would duplicate ~80% of the fields and force "My Tasks" to query two collections and sort in memory), and **D1** → GridFS (the 16 MB document cap makes a 30 MB inline Buffer not merely bad practice but impossible). Both stay **Open** here; the HTML labels them as working assumptions and maps each remaining decision to the exact fields it would change. **(c)** Two things the design surfaced that were not previously written down: `rescheduleproposals` needs an **`expiresAt`** — "one round" is meaningless without a clock, and without it one unresponsive sub freezes the schedule forever — and `items[].respondent` must be **copied from `task.assignee` at proposal time**, so reassigning a task mid-negotiation cannot silently move somebody else's vote. Uses only the approved palette (no new colors, no blue-on-blue).
- `[2026-07-05]` **Login validation: switched from `:user-invalid` to a JS `touched` marker (`screens/validation.ts`)** (on `feature/login-screen`) — `:user-invalid` only activates after a field's value is *changed*, so focusing an empty required field and tabbing out **without typing** left it un-flagged — the red border + hard-hat never appeared (owner-reported). Matched the signup approach instead: new `validation.ts` (compiled `validation.js`) adds a `.touched` class on `blur`, and the CSS now keys off `.form-input.touched:not(:focus):invalid` — red is hidden on load and while editing, shown once an invalid field is left (empty required now included). The `:has(.form-input:invalid)` button-disable gate is unchanged. Wired into login, forgot-password, and reset-password (unifies the touched model across all auth screens; the forgot/reset inline `.field-error` trigger updated to match). This means the earlier same-day "zero JS / CSS-only" login-validation note below no longer holds — the empty-field case forced a small JS marker (second TS file on the login branch; compiled `.js` stays gitignored).
- `[2026-07-05]` **Login/reset polish: forgot-password link relocated, prototype link removed, language choice now persists across screens** (on `feature/login-screen`) — three fixes from review: **(a)** moved the "Forgot password?" link out of the password label row to **beneath the password field** (`.forgot-link`, aligned to the row end) — it was there before but easy to miss opposite the label. **(b)** Removed the prototype-only "preview the reset screen" link from the forgot-password "check your inbox" step; in production the reset screen is reached only from the emailed link, so surfacing it in the UI was misleading (`reset-password.html` stays reachable by URL, exactly as the email link would open it). **(c)** **Language now persists across screens** via `screens/lang.ts` (compiled to `lang.js`): the CSS-only Hebrew/English toggle can't carry state across page loads, so a tiny script stores the choice in `localStorage` and re-applies it on load (Hebrew stays the default). Authored in **TypeScript, not hand-written JS** (owner rule); `.ts` is the tracked source and compiled `screens/*.js` is now gitignored as a build artifact — matching the register-screen decision, and the **first TS on the login branch**. Wired into login, forgot-password, and reset-password.
- `[2026-07-05]` **Login validation reworked to match the signup flow — still CSS-only** (on `feature/login-screen`) — replaced the email-only `:not(:placeholder-shown)` checks with the modern **`:user-invalid`** pseudo-class, so a field goes red **only after it's edited/left** (touched), never on load. This reproduces the register screen's TypeScript "touched" behavior with **zero JS** — register needed JS only because it duplicates inputs per language; login has single inputs, so pure CSS suffices and it stays within the HTML/CSS-only line. Rules: email must be a valid format; password only needs to be **non-empty** (no strength check). The **Sign in** button stays greyed/disabled via a `.login-form:has(.form-input:invalid)` gate until both are valid, then enables. Dropped the inline email error text (it shifted layout) for an **in-field warning icon** — a construction **hard-hat with an exclamation mark** (`--error` red), revealed by `.form-input:user-invalid ~ .input-warn`; on the password field it sits left of the reveal eye, with input padding reserved so nothing reflows. Form carries `novalidate` (no native popups); a failed attempt still shows the single unified "incorrect email or password" alert (anti-enumeration). Unified the inline-error trigger to `.form-group:has(.form-input:user-invalid) .field-error` so the forgot/reset screens keep their inline messages. (Also confirmed the login's "Forgot password?" link was already present, just muted.)
- `[2026-07-05]` **Forgot-password / reset flow built as static HTML/CSS** (`screens/forgot-password.html` + `screens/reset-password.html`, on `feature/login-screen`) — completes the login's "Forgot password?" link. Full journey across two files: request reset link → "check your inbox" confirmation → set new password → success. Reuses `login.css` (one shared stylesheet; only a small flow-specific block appended — no per-screen CSS) per the reuse rule. Multi-step navigation is **CSS-only** (hidden-radio stepper, advance control = `<label>`), so the flow is clickable end-to-end without JS; real email dispatch + single-use-token verification are wired with the backend in Stage 2, consistent with the existing OAuth/password-toggle stubs. Forms carry `novalidate` and use CSS `:has()` to gate the advance (valid email / min-8-char password) → **no native validation popups** (instructor rule). Confirmation copy is deliberately non-committal ("if an account exists…") to preserve the login's **anti-enumeration** stance. Password confirm-match check needs JS (Stage 2). No new colors introduced.
- `[2026-06-28]` **Register: touched-field validation rebuilt in TypeScript with a build step** (`screens/register.ts` → compiled `screens/register.js`; new `package.json` + `tsconfig.json`; `.gitignore` ignores `node_modules/` + `screens/*.js`) — supersedes the earlier CSS-only `:user-invalid` borders. A required field now turns red **only after the user touches (focuses then leaves) that specific field** while it's empty/invalid — not the whole form, never on initial load. Pure CSS can't remember "touched," so `register.ts` adds a `touched` class on `blur`/`change` and CSS styles `.touched:not(:focus):invalid`. Chose **TypeScript + a real build** (over plain JS, or two hand-maintained files): `register.ts` is the only tracked source; `tsc` compiles it to `screens/register.js`, which is **gitignored as a build artifact** (browsers can't execute `.ts`). This is the **first JS + Node tooling in the project**, so it crosses the "HTML/CSS-only for now" line — pending instructor confirmation. (Submit stays disabled until every required field is valid via a CSS `:has()` gate, language-aware for the bilingual trade/location; the form carries `novalidate` so the hidden inactive-language duplicates can't block submit.)
- `[2026-06-28]` **Register: type sizes raised for readability; "//" kicker eyebrow removed** — many contractors are older users, so body/inputs went to ~16px and labels/hints/captions up proportionally (serif headlines unchanged). Removed the `// CREATE ACCOUNT` mono eyebrow above the headline (the removal foreshadowed in the 2026-06-17 browse-contractors note below), and recorded a standing rule not to reuse that kicker on new screens.
- `[2026-06-28]` **Register brand panel: recolored layout from navy-on-navy to tan** — lecturer rule "no blue on blue." The blueprint panel's number badges, feature cards, and inner panel were navy fills sitting on the navy canvas; switched those structural fills to the `--secondary` tan accent (badges = solid tan with navy numerals). Canvas and all text colors unchanged; stays within the approved palette.
- `[2026-06-17]` **Browse Contractors screen built as static HTML/CSS** (`screens/browse-contractors.html` + `screens/browse-contractors.css`, on `feature/browse-contractors-screen`) — screen #9 and the first authenticated *app* screen. Reuses the login/register "luxury blueprint-board" system (palette, fonts, board background, bilingual Hebrew-default/English CSS-only toggle, form controls) so the three screens feel like one product; **no new colors introduced**. Introduces the **reusable app navbar** (`.app-nav`: brand, primary links with an active state, notifications bell, profile menu, in-navbar language toggle) meant to be shared by every Stage-2+ screen and lifted into a React `<Navbar/>` later. Layout = a persistent **filter rail** (search, specialty reusing the register trade list, region, pure-CSS star-rating selector, minimum-flexibility control) beside a responsive grid of **rich contractor cards** (avatar, trade tags, location, star rating, and the auto-calculated **flexibility gauge**) with `View profile` + `Connect`. The three connection states (Connect / Pending / Connected→Message) are shown **statically** via modifier classes so all are visible at once. Cards use throwaway placeholder data (replaced by real DB data under React); filtering, search, sort and pagination are presentational stubs wired in Stage 2.
- `[2026-06-17]` **Navbar profile initials made bilingual** (`screens/browse-contractors.html`) — show the first-name + surname initials per language instead of the placeholder, swapping with the language toggle.
- `[2026-06-17]` **Minimum-flexibility filter became a progress bar + number box — the project's first vanilla JS** (`screens/browse-contractors.html` + `.css`) — iterated from a native range (couldn't show its live value) → discrete chips → final **progress-bar slider** (`accent-color` fill, direction-aware for RTL/LTR) plus a **number box** you can type into, with the value indicator placed **directly above the bar**. Displaying an arbitrary live numeric value is impossible in pure CSS, so this screen carries **one small isolated `<script>` of plain vanilla JavaScript (no React)** that only keeps the slider and number box in sync. Documented exception to the otherwise JS-free static prototypes; all other interactivity still waits for React (Stage 2).
- `[2026-06-17]` **Fixed blueprint corner-tick overlaps and removed the page eyebrow** (`screens/browse-contractors.css` + `.html`) — the corner registration ticks were sitting over the "סינון" filter title and the "החלת סינון" Apply button (read as a line over the words); added top/bottom padding and tucked the ticks into the corners for clearance. Removed the "// גילוי ורשת / // DISCOVERY & NETWORK" page eyebrow per owner request (the same eyebrow pattern on login/register will be removed when those branches / `main` are next touched).
- `[2026-06-17]` **Process: the project MD is updated only on `main`, never on feature branches** — the MD is a shared living document, so editing it on each per-screen feature branch causes merge conflicts. Decision Log / feature-registry updates are staged during feature work and applied once back on `main` (matches the earlier "move md update to main" workflow).
- `[2026-06-16]` **Register screen refined into a luxury blueprint-board visual system** (`screens/register.css`) — the previous styling still felt too generic/website-like. The new direction uses a mounted blueprint-board background, double board frame, side measuring strips, layered technical grid, calm vellum/spec-sheet form surface, and precise annotation-style fields to communicate reliability, luxury, calmness, and a clear upgrade from phone/manual coordination workflows while staying HTML/CSS-only.
- `[2026-06-16]` **Register validation improved for the static prototype** (`screens/register.html` + `screens/register.css`) — added a bilingual inline password-length error and red `:user-invalid` required-field borders so Hebrew mode shows Hebrew errors and English mode shows English errors. CSS-only validation is intentionally limited until Stage 2 JavaScript/React logic, so inline text carries the bilingual guarantee better than native browser popups.
- `[2026-06-16]` **Left brand panel background aligned with the right blueprint-board surface** (`screens/register.css`) — the owner wanted both sides to feel visually connected and questioned the different blue tone. The left panel now uses the same calmer board-base treatment as the right side; no new colors were added.
- `[2026-06-16]` **Removed generated `01` decoration from the register brand panel** (`screens/register.css`) — it appeared as unintended visible content on the left side and did not add clear product meaning.
- `[2026-06-15]` **Approved color exceptions restored on the register screen** (`screens/register.html` + `screens/register.css`) — the owner explicitly requested keeping Google's logo colors and using red for errors. This creates two documented exceptions to the palette rule: provider branding for recognizability, and red error states for familiar validation feedback.
- `[2026-06-15]` **Register screen restyled as a unique static HTML/CSS prototype** (`screens/register.css`, minor cleanup in `screens/register.html`) — instructor currently requires plain HTML/CSS, so the redesign stays CSS-driven without React or JavaScript. The new visual direction uses a blueprint-inspired brand panel, technical document-style form surface, stronger registration marks, numbered feature rows, refined focus/hover states, and responsive mobile adjustments to make the screen more eye-catching while still understandable for a second-year academic project. Palette discipline was initially tightened so register errors and the Google button used only approved palette colors; that color sub-decision was later superseded by the approved exceptions above.
- `[2026-06-07]` **Login screen built as static HTML/CSS** (`screens/login.html` + `screens/login.css`) — instructor requires plain HTML/CSS before the React migration. Split-panel layout: left brand-gradient panel, right form. Implements email + password fields, unified "invalid credentials" error (no per-field hint — prevents credential enumeration), and a Google OAuth button stub (wired in Stage 2). One palette extension approved: `--error: #A63232` / `--error-bg` / `--error-border` added solely for the error alert; red is required by accessibility conventions (WCAG) and has no brand meaning. Password show/hide button is stubbed in the markup — toggling `type` requires JS, wired in Stage 2. Working name "FieldSync" used as placeholder (codename still TBD). `screens/` folder created at project root to hold all static screen prototypes before React migration.
- `[2026-06-02]` **D7 (delegation depth) CLOSED: single-level only, no re-delegation** — a chain would
  multiply the serializer's visibility cases and make "invisible to the party above" relative/ambiguous;
  fixing depth at 1 keeps the privacy model to one clean hop in each direction. Documented the full
  visibility triangle and derived constraints in new **§3.3**, updated the `Task` entity note (assignee =
  delegator is GC-visible; `delegate` is delegator-and-down only), and noted the knock-on wrinkle for the
  still-open D6 (behaviour accrues at two layers). Left one small sub-question parked: whether a delegate
  sees upstream dependency *dates* while owners stay hidden (leaning yes, confirm at Stage 5).
- `[2026-06-01]` **Expanded §7 and §8 with gaps found in review** — the first draft under-captured several
  things. Enriched D2 (cascade negotiation) and added a matching §8 risk because the negotiation is
  *underspecified* and needs to be modeled on paper before coding, not just picked from a menu; the
  earlier single table row understated it. Added §8 risks for write-side **authorization** (distinct from
  the read-side serializer), **date/timezone** handling, and **demo seed data** (a graded-deliverable
  risk). Parked new open decisions D6 (flexibility-score formula), D7 (delegation depth), D8 (user-removal
  / soft-delete), D9 (messaging-gate scope), and folded the job-vs-task question into D5. Kept all of these
  as open/known rather than solved, to discuss as we go.
- `[2026-06-01]` **Created this source-of-truth document** — to track structure, flow, to-do, features,
  open decisions, and a bug/decision history so work isn't repeated and rationale isn't lost.
- `[2026-06-01]` **Provisional: monorepo (`client/` + `server/`)** — simplest layout for a solo project;
  recorded as D4, revisit if it causes friction.
- `[2026-06-01]` **Provisional: Context for ambient state (current user, theme), Redux for the complex
  domain (projects, tasks, cascade preview, notifications)** — satisfies the syllabus requirement to use
  both, with a clean justification; avoid duplicating the same state across both.
- `[2026-06-01]` **Provisional: build simple visibility first, add delegation/privacy in Stage 5** —
  reduces risk by getting the foundation solid before layering the hardest feature on top.
