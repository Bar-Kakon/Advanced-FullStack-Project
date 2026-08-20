# Contractor Coordination Platform — Project Source of Truth

> **Living document.** This is the single source of truth for the project: what we're
> building, how it's structured, what's decided, what's still open, what's done, and a
> running log of every bug and every decision *with the reason behind it*.
> Update it **as we go** — before or right after a change, never "later."
>
> Codename: _TBD_ · Owner: _(you)_ · Stack: React (Vite) · Node/Express · MongoDB/Mongoose · JWT · Multer
> Last updated: **2026-08-18**
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
7. **Never put `dir="auto"` on an element that holds both `.he-text` and `.en-text`.** This is specific to
   the duplicate-markup prototypes and it fails silently. `display: none` does **not** remove text from the
   bidi algorithm, so `dir="auto"` on a shared parent resolves from the first strong character — always the
   Hebrew — and the element renders **RTL even in English**. Put `dir="auto"` on each single-language span
   instead. Under React, where one string exists per render, it moves back onto the element. Cost of getting
   it wrong: the English screen looks like a separately composed layout. See [§10](#10-bug--issue-log).

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

### 3.5 Shared UI rules (apply to every screen)

> Set on 2026-08-19 after a review found the same three regressions on more than one screen.
> These are **project-wide**, not per-screen preferences. Each one fails quietly, which is why it
> is written down rather than left to review.

1. **Focus must not move anything.** A field may change colour, border or shadow on `:hover` and
   `:focus`, but it must not change position or size. `transform: translateY(-1px)` on a field was
   the actual cause of the "placeholder jumps on focus" report — the whole control shifted, taking
   the placeholder with it. Removed from `edit-profile.css`, `register.css` and
   `browse-contractors.css`. Button transforms are fine: a button is not a text field.
2. **No floating labels.** A placeholder stays in place until the user types. There is no
   floating-label pattern anywhere in the project and none may be introduced without approval.
   *(Verified: no screen used one — the reported symptom was rule 1.)*
3. **Labels and identifying metadata stay readable.** A label such as City, Phone, Region, Work area
   or Specialty is information the user is expected to read, so it may not shrink into micro-text.
   **`register.css` at 14px is the reference size.** Corrected to match: `profile.css` (11.5px),
   `browse-contractors.css` (11px), `login.css` (11px). Labels need not equal body size; they must
   stay comfortably legible — many contractors using this are older users.
4. **Secondary text must still clear contrast.** Secondary information stays visually secondary, but it
   has to be readable. Two tiers only, both measured against the cream card surfaces: **`--text-mute`
   (0.64 alpha, ≈4.6:1)** for metadata — dates, scales, counters, empty states — and **`--text-soft`
   (0.75, ≈6.8:1)** for hints, ledes, labels and secondary body copy. The tokens are named by role, not by
   opacity, because the numbers moved once. *Why only two tiers:* the old scale had four (0.40 / 0.55 /
   0.75 / 1.0), and the first two measured **2.4:1 and 3.6:1** — both below AA. Lifting them above the
   4.5:1 floor leaves no visual room for a third secondary step, so 0.55 and 0.75 merged. Losing that
   distinction is the honest cost of making the text legible.
5. **Let text wrap to the space it has.** No manual line breaks, and no width limit tighter than the
   content needs. A reading measure (`--prose-max`) is kept only for genuinely long prose — a bio, a
   long answer — never for a label, a hint or a one-line section lede. Applies in both directions.

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
| Register | 1–2 | In progress | Register screen HTML/CSS is actively being refined as a luxury blueprint-board prototype (`screens/register.html` + `screens/register.css`). **2026-08-19:** specialty list extended to match the profile screens, field-focus movement removed per [§3.5](#35-shared-ui-rules-apply-to-every-screen), and an **initial availability** selection added to signup |
| Login | 1–2 | In progress | Login screen HTML/CSS exists (`screens/login.html` + `screens/login.css`), but its CSS still needs to be updated to match the newer register-screen visual direction |
| Forgot / Reset password | 1–2 | In progress | Static HTML/CSS on `feature/login-screen` (`screens/forgot-password.html` + `screens/reset-password.html`), reusing `login.css`. Full CSS-only flow: request link → check-inbox → set new password → success. Email dispatch + single-use-token verification wired in Stage 2 |
| JWT auth + protected routes (both sides) | 1–2 | Planned | bcrypt for passwords |
| Profile completion wizard | 2 | Planned | Part of registration |
| My profile (view) | 2 | In progress | Static HTML/CSS on `feature/my-profile-screen` (`screens/my-profile.html` + `screens/my-profile.css`). Now also carries the **Completed work** tiles. **View-only:** no inputs, no form, no validation, no Save/Cancel — verified by an automated check. Shows the trust panel (rating + flexibility, with the cold-start state), bio, specialties, contact, location, travel radius, scheduling preferences and the anonymous ratings list, plus **one** global Edit control. Approved screen **#6** is now realised as this pair of screens. **2026-08-19:** the rating and flexibility pair sits in the header beside the identity; reading order below it is About me → Completed Work (wide column) beside details → scheduling (narrow column) → Ratings last, on one 22px rhythm; the metrics pair moved out of the trust panel **as one block**, keeping its original side-by-side composition |
| Edit profile | 2 | In progress | Static HTML/CSS on `feature/my-profile-screen` (`screens/edit-profile.html` + `screens/edit-profile.css`, `0917bcc`) — the original My-profile implementation, **renamed into this role** (`f714425`). Carries every editable field, the touched-field validation and the login hard-hat warning icon. Widened to a balanced two-column desktop layout. Ratings and flexibility appear here too but stay read-only. **Save / Cancel closes the page**, after Flexibility. Adds the **Completed work** manager, the `nationwide` region, the availability selector, the inline `Other` field and the heavy-equipment picker. Metrics pair sits in the header beside the identity, as on the view screen. Section order: profile information → Completed Work → Ratings, with Save / Cancel last. **Zero new JavaScript** — reuses the tracked `lang.js` and `validation.js` |
| Public profile | 2 | Planned | **A screen with its own route**, not a feature of My profile — how another contractor sees you. Scope now also carries `schedulingPrefs` (delay tolerance + required notice), per the 2026-08-18 decision |
| Settings (account / notifications / deactivate-delete) | 2 | Planned | Confirmations are popups |
| Subscriptions / plans | 2 | In progress | Static HTML/CSS prototype on `feature/subscriptions-screen` (`screens/subscriptions.html` + `screens/subscriptions.css`): three tiers (Free / Basic / Premium), full comparison table, FAQ. **Prices and every tier limit are provisional** and marked as such on the screen itself. Billing and checkout are not started. An **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included; it is not one of the original 36 rows. Data model designed — see [D11](#7-open-decisions). **Owner review findings addressed** (`83a8c0e`), then the over-removal corrected and the Basic/Premium ladder rebuilt (`7db18af`) — see [§11](#11-decision-log). Awaiting re-review |
| Browse contractors | 2 | In progress | Static HTML/CSS prototype done (`screens/browse-contractors.html`): reusable navbar, filter rail (specialty/region/rating/flexibility), rich cards with rating + flexibility gauge + connection states. Real filtering/search/pagination wired in React (Stage 2). **2026-08-19:** `כל הארץ / Nationwide` is now the **single** no-geographic-restriction option — the separate `כל האזורים` option added on 2026-08-18 was a duplicate and is gone. Added a **city / town** filter (datalist of Israeli settlements) and a **minimum travel distance** filter, grouped with the region control so there is one geographic block. Specialty list extended to match the profile screens. The Stage-2 query must still match `region === selected OR region === 'nationwide'`. Also carries an **availability filter** (three states, multi-select) and shows the status on each result card |
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
| D14 | **Availability status and heavy-equipment selection — both new fields, neither in the chart** | Two fields were added to the profile UI on 2026-08-19 that `docs/database-design.html` does not define, so **no schema was written for either**. **Availability:** a three-state status (`open` / `limited` / `closed`) shown as a dot plus its written label. Open: is it a plain enum on `users`, does it carry an "until" date so a contractor can mark themselves unavailable for a fortnight, and does it feed the browse filter? **Heavy equipment:** selecting `heavy_equipment` as a specialty opens a picker of ten machine types, because a contractor typically operates only part of the category. Open: is this a second array on `users` (`equipment: [String]`), a sub-document keyed by specialty, or a generalisation of "specialty attributes" that other trades would also use later. Decide before either is built. **Availability now appears on three screens** — chosen during registration, editable on the profile, displayed on the profile and on browse result cards, and filterable in the browse rail — so whatever shape is chosen has to serve a filter, not only a display. Still **no schema written**. | Stage 2 | Open |
| D13 | **Completed-work storage shape** | The **product** model is decided (2026-08-18, below): entries may be free-standing *or* optionally linked to work coordinated on the platform, and only a linked entry whose specific work is complete carries the `Completed on FieldSync` badge. What is **not** decided is where the data lives: a `workentries` collection **vs.** an embedded array on `users` referencing [[fileassets]]; whether a linked entry stores the `task` id, the `project` id, or both, so that a task-scoped entry can be rendered without implying responsibility for the whole project; and whether the badge is recomputed on read (task still complete?) or frozen at link time. Also unresolved: the provisional delegation rule below has to be enforceable by whatever shape is chosen. Nothing has been added to `docs/database-design.html` yet, deliberately. **Refined 2026-08-19:** the badge wording is **`Completed on FieldSync` / `הושלם ב־FieldSync`**, and it appears only where the work the entry represents is itself complete — a finished task inside a running project qualifies, a whole-project entry only once the project completes, work in progress never. **Delegation rule sharpened, and it now cuts the other way from the 2026-08-18 version:** an image from work done through confidential delegation **may** appear, because forbidding it outright was itself a signal; what must never appear is anything that exposes the relationship. Concretely: a **delegate must not receive the badge** for delegated work, no project or task linkage may be published for it, and there is never a "delegated" label of any kind. Any storage shape chosen has to be able to enforce that. | Stage 2/3 | Open |
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
  is announced by screen readers with Hebrew pronunciation. Resolve it in the React migration (D10).
  **Correction (2026-08-18): the original wording — "do not extend the pattern to new screens beyond the
  ones already built" — was unworkable and has been overtaken twice**, by subscriptions and again by
  my-profile. It cannot hold, because §3.4 rule 6 and the definition of Done require *every* screen in both
  languages, and there is no other way to do that with no JavaScript. The rule that actually applies: **do
  not invent a second bilingual mechanism** — every remaining static screen uses this one, and all of them
  are replaced at once by the React resource file.
- **Free-text location cannot populate the region filter** (found while building my-profile, 2026-08-18).
  `screens/register.html` collects location as **one free-text field** ("תל אביב, מרכז"), but the schema
  stores `location { city, region, … }` and browse-contractors filters on a **`region` code** backed by
  `{ status: 1, specialties: 1, 'location.region': 1 }`. Free text can never populate that index, so the
  region filter would return nothing for anyone who registered but never opened their profile. My-profile
  now collects city as text and region from the fixed list; **`register.html` still needs the same fix on
  its own branch** — it is the last screen writing location in a shape the schema cannot use.
- **`register.html` has the language toggle but never loads `lang.js`** (found during the shared-script audit,
  2026-08-18). Every other bilingual screen — login, forgot-password, reset-password, subscriptions, and both
  profile screens — loads it, so the choice persists across page loads. On register it does not: switching to
  English and moving to the next screen silently returns to Hebrew. Belongs to `feature/register-screen`;
  it is a one-line `<script>` addition, not a redesign.
- **`register.ts` is redundant but cannot be deleted yet.** `validation.ts` now covers everything it did
  (`refactor/shared-ui`, `ccbfdc7`). `register.html` still loads `register.js` on its own branch, so removing
  it before that branch swaps its `<script src>` would break the register screen. Retire both files in the
  same commit that changes that tag.
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

### [2026-08-19] The database-design page reported a stale "Updated" date
- Symptom: opening `docs/database-design.html` showed **`Updated 2026-08-02`** in the masthead, suggesting the file had not changed in over two weeks — while its content was in fact current through 2026-08-18, carrying the `nationwide` region, its `$in` index-query consequence and the rating-anonymity notes.
- Cause: the date was a **hardcoded literal** in the chip. Nothing computed it, so it recorded the day somebody last typed it rather than the day the document last changed, and it drifted further with every documentation commit. The neighbouring chips did not go stale because `renderOverview()` fills them from the data.
- Fix: a tracked **`pre-commit` hook** (`.githooks/pre-commit`) stamps today's date into `<b id="stat-updated">` whenever `docs/database-design.html` is part of a commit, then re-stages the file — so the date is committed content. An earlier fix the same day, filling the chip at boot from `document.lastModified`, was **reverted**; see below.
- Notes: **`document.lastModified` is the wrong source for "when did this change".** It reports when the file was last *written*, not when its content last changed, and both halves of that gap were measured on this repo: simply opening the file in the IDE put the mtime **four hours ahead** of the last content commit while `git status` showed the content byte-identical; and because `git clone` writes every file at checkout time, a fresh clone reported the mtime as **the moment of cloning**. Anyone cloning the repo would therefore have read "Updated" as the day they cloned it, forever — the original defect relocated, not removed. Only Git knows when content changed, so the date must be written at commit time. The hook skips with a warning if the file also has unstaged edits, so it can never sweep unrelated work into a commit. `core.hooksPath` points at the versioned `.githooks/` rather than `.git/hooks`, which costs one `git config core.hooksPath .githooks` per clone; if the hook never runs the date degrades to **stale**, never to a confident wrong "today".

### [2026-08-19] Profile sections touched each other with no gap
- Symptom: on Edit Profile, Completed Work and Ratings ran into one another with no visible separation between the two panels.
- Cause: `.panel` had **no** vertical margin. Inside `.profile-grid__col` the column's `gap` separated panels, so the omission was invisible — but Completed Work, Ratings and Flexibility are top-level siblings with no flex gap to fall back on.
- Fix: `.panel { margin-block-end: 22px; }` in `profile.css`, with `.profile-grid__col > .panel { margin-block-end: 0; }` so grid columns keep using their gap and do not double the spacing. Logical property, so it holds in both directions.
- Notes: the trap is that a container-provided `gap` masks a missing margin until an element is used outside that container. Any panel moved out of the grid inherits this; the rule now covers it centrally rather than per section.

### [2026-08-19] Placeholders appeared to jump when a field was focused
- Symptom: on Edit Profile and Register, the placeholder moved when the field received focus, and the layout shifted slightly with it.
- Cause: **not** a floating-label pattern — there is none in the project. `transform: translateY(-1px)` on `.form-input:hover` and `:focus` lifted the entire control by a pixel, carrying the placeholder with it.
- Fix: removed the transform from both states in `edit-profile.css`, `register.css` and `browse-contractors.css`, and dropped `transform` from the field `transition` list. Button transforms were left alone — a button is not a text field.
- Notes: recorded as **[§3.5](#35-shared-ui-rules-apply-to-every-screen) rule 1**. `login.css` was checked and never had it on fields; `subscriptions.html` has no form fields at all. The tell for this class of bug is a `transform` inside a `:focus` rule on anything the user types into.

### [2026-08-19] Labels regressed into micro-text on three screens
- Symptom: City, Phone, Region, Work area and Specialty labels were too small to read comfortably — the same problem Register had already been corrected for.
- Cause: each screen set its own label size independently, so the Register correction (raised to 14px on 2026-06-28) never propagated. `profile.css` was at 11.5px, `browse-contractors.css` and `login.css` at 11px.
- Fix: raised labels to **14px** on all three, matching Register, and lifted the associated metadata with them (tags, hints, card org line, rating and flexibility values, connection badge).
- Notes: recorded as **[§3.5](#35-shared-ui-rules-apply-to-every-screen) rule 3** with Register named as the reference size, so the next screen has a number to copy rather than a judgement to re-make. The root cause is duplicated per-screen CSS; it disappears when the shared layer lands.

### [2026-08-18] English profile screens placed some content inconsistently
- Symptom: in English, the contractor's name, the bio and the rating comments **sat in the middle of the block** instead of lining up with the rest of the English layout, so the English screen read as a separately composed screen rather than a mirror of the Hebrew one.
- Cause: ten elements carried `dir="auto"` on a parent that contained **both** the `.he-text` and `.en-text` spans. `display: none` does not remove text from the bidi algorithm, so `dir="auto"` resolved from the first strong character — the Hebrew — and applied RTL to the block even while English was showing.
- Fix: moved `dir="auto"` off the shared parents and onto each single-language span (`my-profile.html` ×6, `edit-profile.html` ×4).
- Notes: only affects the duplicate-markup prototypes; under React one string is rendered at a time and `dir="auto"` belongs on the element again. Recorded as **[§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr) rule 7** because it is invisible in Hebrew and therefore survives review. Grepping for `dir="auto"` is not enough — the check must test whether the element *contains both languages*.

### [2026-08-18] `\u200E` appeared as visible text in the Hebrew copy
- Symptom: the Hebrew bio rendered as `u200E14` instead of the number, on both profile screens.
- Cause: five literal `\u200E` escape sequences were written into the markup. HTML has no `\uXXXX` escape, so the browser printed the characters instead of inserting a left-to-right mark.
- Fix: removed all five and used the project's documented mechanism instead — `<bdi>` around the embedded runs (`<bdi>14</bdi>`, `<bdi>JPG</bdi>`), and plain digits inside the `<textarea>`, which cannot hold markup.
- Notes: the marks were never needed. Digits are weak-directional and already sit correctly inside Hebrew, and `<bdi>` handles the Latin runs. If a control character is ever genuinely required, write the actual character — never an escape sequence. The Hebrew bio was also translated properly (`בעיקר במגדלי מגורים`) rather than left as a half-rendered string.

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

- `[2026-08-19]` **Faint secondary text darkened project-wide, and the "before joining" label dropped from work cards** (2 commits on `feature/my-profile-screen`, 1 each on `feature/browse-contractors-screen`, `feature/register-screen`, `feature/login-screen`) — readability only; no hierarchy, layout, spacing or content changed beyond it, and the hexagon completion badge is untouched.
  **Measured rather than eyeballed.** The two faint text tokens were **`rgba(31,36,40,0.40)` at 2.40:1** and **`0.55` at 3.62:1** against the cream surfaces — both under the 4.5:1 AA floor for normal text, which is why dates like *July 2026* were uncomfortable to read. Raised to **0.64 (≈4.6:1)** and **0.75 (≈6.8:1)**, verified against both `--surface` and the slightly darker `--background`. Renamed to **`--text-mute`** and **`--text-soft`** because the old names stated opacities that no longer applied. Applied to **every** stylesheet carrying them — profile (×3), browse-contractors, register, login — since the tokens are duplicated per screen and a fix in one would have left the others faint.
  **One tier was lost, deliberately.** The old scale had four steps; the bottom two both failed contrast. Lifting them over the floor left no room for a third secondary step, so the former 0.55 and 0.75 tiers merged into `--text-soft`. Metadata stays visibly lighter than secondary body copy, which is the distinction that carries meaning; the finer 0.55-vs-0.75 split did not survive and could not. Recorded as **[§3.5](#35-shared-ui-rules-apply-to-every-screen) rule 4** so the next screen inherits the two-tier scale instead of reinventing a faint one.
  **Label removed.** *Completed before joining / עבודה מלפני ההצטרפות* is gone from the work cards — it labelled an absence rather than telling the reader anything about the work. Location and date stay as their own `.work-item__meta` line, so the context survives without the label. **Left in place:** the same phrase inside the Edit Profile section lede, where it is prose telling a contractor that pre-platform work may be uploaded, not a card label. Flagged rather than removed silently.

- `[2026-08-19]` **Badge finalised as a hexagon mark, the metrics pair moved into the Edit Profile header, and the divider tightened** (3 commits on `feature/my-profile-screen`) — presentation only; no eligibility, privacy or badge **rule** changed, and the badge still asserts recorded completion rather than quality.
  **Badge final design.** The tick became a **hexagon enclosing a check**, drawn in `--secondary` — the same accent as the rating stars — on a `--secondary-15` field with a full-strength tan border. The solid tan fill and its inset shadow are gone, so the mark reads as the accent and the label stays on `--primary`. **Location and date are now separate metadata**, not folded into the title: the title carries the work (`מגדלי הצפון` / Northern Towers), and a new mono `.work-item__meta` line carries `city · month year`. Previously the location was buried inside the title string, which left the tile with no date at all.
  **Edit Profile's metrics moved to its header**, beside the identity, matching the view screen. This also **settles a mismatch flagged earlier the same day**: the two screens had drifted apart, with the view header holding the pair and the edit header not. Because the shared rule was written as `.trust:has(.trust__metrics)` and `.trust > .trust__metrics` rather than hard-coded, the edit header picked up the two-column arrangement automatically with no CSS change — which is the payoff for scoping it structurally instead of duplicating it. Confirmed by locating each file's trust-section byte range and checking the metrics element falls inside it: **both true**. The ratings heading went back to *Ratings you received* on both, since the score no longer sits in that section.
  **Divider tightened and darkened.** `.trust__metrics` had `padding-block-start: 22px` above a `--secondary-45` dash, which read as a large empty band. Now **12px** above a **`--primary-20`** dash — a derived palette value, no new hue — so it is more visible while staying subtle, with the inline variant at ≥1000px matched (`22px`, same dash). Card design and content untouched.

- `[2026-08-19]` **My Profile view: the rating and flexibility pair returned to the header, and the section rhythm evened out** (`38c4549` on `feature/my-profile-screen`) — view screen only; `edit-profile.html` was not modified, and its metrics stay in its ratings section.
  **Metrics back beside the identity.** The pair moved back inside `.trust`, together with the flexibility disclosure, so both computed signals read as part of the profile header. Styling, labels, content and logic are untouched — only the position.
  **The two-column header rule went into the shared `profile.css`, but scoped structurally** rather than duplicated into the view stylesheet: `.trust:has(.trust__metrics)` and `.trust > .trust__metrics`. That matters because the two screens currently differ — the view header holds the pair, the edit header does not — and an unscoped rule would have turned Edit Profile's header into a two-column grid with an empty second column, squeezing its identity block to nine-tenths width. Scoped this way the shared sheet carries one rule that applies wherever a header actually holds the metrics, and Edit Profile renders identically to before. Verified by locating the trust section's byte range in each file and checking whether the metrics element falls inside it.
  **One spacing rhythm.** The gap between About me and Completed Work was not a margin at all — the screen had **two stacked grids**, and row two could not begin until the taller column of row one finished, so a short About panel left a gap the height of the Details panel beneath it. Merged back to **one** grid with two flex columns: About me and Completed Work in the wide column, details and scheduling preferences in the narrow one. Every gap between major sections is now the same **22px** — `.trust` bottom margin, the column `gap`, the grid gap and the grid's bottom margin all agree — and Completed Work still sits directly beneath About me with scheduling alongside.
  **Ratings heading restored** to *Ratings you received*; with flexibility no longer in that section, *Ratings and flexibility* would have described content that is not there.

- `[2026-08-19]` **My Profile view: Completed Work paired with Scheduling preferences, Ratings moved last** (`09fde8f` on `feature/my-profile-screen`) — order only, on the **view screen alone**; `edit-profile.html` was not touched. New reading order: **About me → Completed Work + Scheduling preferences side by side → Ratings last.**
  **How, without inventing a layout.** The screen already had one two-column `.profile-grid`; it now has **two**, stacked. Row one is About me beside the structured details, row two is Completed Work beside Scheduling preferences. Because Completed Work occupies the same (wider, `1.4fr`) column as About me, it sits **directly beneath it** as required, and because each row is its own grid the two panels in row two genuinely align rather than drifting apart at differing column heights. Ratings and flexibility follow as a full-width section, so it is the last content on the page.
  **Nothing else changed** — verified by diffing the file line-multiset against the previous commit: the only additions are the second grid's three wrapper elements, and the only removals are two source comments that described the old column split and would now have been wrong. No styling, sizing, content or logic was altered, and the Ratings/Flexibility pair keeps the composition restored earlier today.
  **Mobile is unaffected by the change:** `.profile-grid` already collapses to a single column at 960px, so the stack reads About me → details → Completed Work → Scheduling → Ratings, with Ratings still last.

- `[2026-08-19]` **Correction: the Ratings/Flexibility pair was restored to its original composition; only Completed Work moved** (`acbc6c2` on `feature/my-profile-screen`) — the reorder earlier the same day (below) achieved the requested order the wrong way. It **split** the rating and flexibility cards into two separate lower sections, inventing a new layout for them, when the requirement was to move **Completed Work** upward and leave the pair alone. The owner had approved that composition and it should not have been touched.
  **What was wrong.** The two cards had always lived together in `.trust__metrics` — one grid, `repeat(auto-fit, minmax(240px, 1fr))`, an 18px gap and a dashed rule above them. Splitting them gave each its own `<section>`, its own heading, and a 380px width cap that changed the card proportions. Order was satisfied; the design was not preserved.
  **What it is now.** The pair is back in **one** container with `.trust__metrics` and `.metric` restored **byte-identical to the pre-change file** (verified by diffing both rule blocks against `779787d`), the invented flexibility heading and the width cap are gone, and the intact block sits inside the Ratings section below Completed Work. Final order on both screens: **profile information → Completed Work → Ratings + Flexibility**, with Save / Cancel still closing Edit Profile.
  **One rule genuinely could not survive, and it is worth recording rather than hiding:** the original `@media (min-width: 1000px)` block placed the identity block and the metrics pair *side by side inside the trust panel*. Once the metrics sit below Completed Work they are no longer beside the identity, so that rule has no markup to act on and was removed. The pair's **own** composition — two cards abreast, same proportions, same dashed divider, same gap — is unchanged, which is what the instruction protected.
  **Kept from the previous pass:** the compact gallery (capped tracks grouped at the start, so tiles never stretch to fill), and the `.panel` margin that gives the moderate gap between Completed Work and the Ratings/Flexibility block. Nothing about card content, badge logic, eligibility, privacy or product behaviour changed in either pass.
  **Process note for future-you:** the instruction was "change the section order". The section that had to move was the one named in the instruction — Completed Work. Moving *other* sections to make the order come out right is a redesign wearing a reorder's clothes, and it cost a round trip.

- `[2026-08-19]` **Display pass: profile section order fixed, the work gallery made compact, and availability extended to Register and Browse** (2 commits on `feature/my-profile-screen`, 1 on `feature/browse-contractors-screen`, 1 on `feature/register-screen`) — display and layout only. No Completed Work, Ratings, Flexibility, privacy, eligibility or badge **rule** was touched; only where things sit and how they are sized.
  **Section order is now Profile information → Completed Work → Ratings → Flexibility** on both screens, with Save / Cancel still closing Edit Profile. **Superseded the same day — see the entry above:** splitting Ratings and Flexibility into two sections was the wrong way to reach this order and was reverted; the pair is back together and only Completed Work moved. The record of the attempt is kept deliberately. Reaching that order meant a structural change worth recording: the rating and flexibility metrics had been living **inside the trust panel** at the top of the page, so "Ratings then Flexibility after Completed Work" was impossible without lifting them out. They are now two sections of their own, the trust panel is the identity summary alone (avatar, name, specialties, location, availability), and the flexibility explanation moved with its metric. Consequences: the trust panel's two-column rule and its `.trust__metrics` styles had nothing left to style and were deleted, and a standalone `.metric` is capped at 380px so a summary card does not stretch across a 1340px section.
  **A real defect surfaced from that move** and is logged in [§10](#10-bug--issue-log): `.panel` had no vertical margin at all. Inside a grid column the column `gap` had been doing the work, so nothing looked wrong until Completed Work, Ratings and Flexibility became top-level siblings and ran into each other. Fixed centrally with `margin-block-end` on `.panel`, cancelled inside grid columns so spacing is not doubled.
  **The work gallery is compact rather than stretched.** `.work-grid` tracks were `minmax(215px, 1fr)`, so three cards in a full-width section stretched to fill and left dead tracks beside them. Now `minmax(190px, 215px)` with `justify-content: start` — the tiles keep an honest size, group together, and the section height follows its content. The lede sits closer to the tiles, and below the capped track width the grid falls back to a flexible single-column so nothing overflows on a phone. Card design, badge logic, content and meaning are unchanged.
  **Availability extended to two more screens.** **Register** now takes an initial state during signup — three radio options, the written label always beside the dot, deliberately nothing about calendars, working hours, vacations or reasons. **Browse** gains an availability filter as three checkboxes (multi-select, so "available or limited" is expressible) and — a judgment call worth flagging — **the result cards now show the status too**, because a filter whose criterion is invisible in the results it produces is half a feature. Both reuse the approved traffic-light exception exactly as the profile does: the hue is on the **dot only**, the text stays readable ink.
  **Browse geography needed no work — it was already built** on 2026-08-19 in the previous pass: `כל הארץ / Nationwide` is already the single no-restriction option, the city/settlement datalist already exists in both languages, and the minimum travel-distance filter is already there. Verified rather than duplicated. No duplicate `כל האזורים` option was reintroduced.
  **Still no schema for availability or equipment** — see **D14**. Availability is now read by a filter as well as a display, which constrains the eventual field but does not settle it.

- `[2026-08-19]` **Profile refinement round two: three project-wide UI rules established, Completed work finished, availability and heavy-equipment pickers added, and Browse gained precise geography** (12 commits on `feature/my-profile-screen`, 5 on `feature/browse-contractors-screen`, 2 on `feature/register-screen`, 1 on `feature/login-screen`) — commits were kept **branch-specific and split by action** at the owner's instruction; no change from one screen was bundled into another screen's branch.
  **Three regressions were found on more than one screen, so they became rules rather than fixes** — new **[§3.5](#35-shared-ui-rules-apply-to-every-screen)**. **(1)** The "placeholder jumps on focus" report was **not** a floating label — there is no floating-label pattern in the project. It was `transform: translateY(-1px)` on `:hover`/`:focus` lifting the whole field. **(2)** Labels had drifted back into micro-text on three screens because each screen sets its own sizes, so the Register correction from 2026-06-28 never propagated; **Register at 14px is now named as the reference number** so the next screen copies a value instead of re-making a judgement. **(3)** Short copy was held to a reading measure it did not need, so ledes and hints wrapped early; `--prose-max` now applies to genuine prose only. Both regressions are logged in [§10](#10-bug--issue-log). The common root cause of (2) is duplicated per-screen CSS, which dissolves when the shared layer lands.
  **A premise had to be corrected rather than followed.** The instruction was to delete profile explanations of the flexibility score and ratings because "the FAQ already explains" them. Checked: the only FAQ in the project is on the subscriptions screen, and it explains neither — it lists them as plan capabilities. Deleting would have left **no** explanation anywhere, so the rule was applied as *keep exactly one*: the `<details>` stays on My Profile, and the duplicate was removed from Edit Profile.
  **Sidenotes.** All rewritten out of conversational register — `שני המספרים האלה` became *your scheduling preferences*, and delay tolerance is now defined as *the number of delay days that can be absorbed without materially affecting the planned schedule*. The `זה מה שמסנן אתכם בחיפוש` clauses are gone: telling a contractor how the search index works is not their concern. **Every sidenote that named confidential delegation was deleted** — the platform must not disclose that the feature exists, so an explanatory note about it was itself the leak.
  **Empty states unified.** Flexibility with too little history and ratings with none now show the **same neutral `—`**, with no explanatory paragraph beside either. Previously the cold start carried its own sentence, which both duplicated the explanation and drew attention to an absence.
  **Completed work finished.** It is now the **last content section** on both screens, so profile information is never interrupted by images, and on Edit Profile the Save / Cancel bar follows it as the page's final action. The badge was rebuilt to read as a real tag — solid `--secondary` with a contained shape — rather than as another line of caption text. The removal **X** stays on editable images even though it does nothing yet, deliberately: no temporary JavaScript was invented to make it work.
  **Availability status added** — three states with the written label **always** beside the dot, so colour is never the only carrier of meaning. This needed a colour exception; the traffic-light hues are applied **to the dot only** (`--avail-open #3F7A4C`, `--avail-limited #C08A1E`, `--avail-closed` reuses the already-approved `--error`), while the status text stays `--text`. That choice was made specifically to avoid the contrast problem an amber *text* colour would have had on the cream card.
  **Six specialties added** — development and infrastructure, doors, sand pumping, haulage and crane work, concrete cutting, and heavy equipment — applied to **all three** screens that carry the list (Edit Profile, Browse, Register) in the same round, since a divergent list would break the region/specialty filter. **`אחר / Other` reveals an inline field in place** via `:has()`, with no modal and no navigation. **`כלי צמ״ה` opens a CSS-only picker** of ten machine types, because owning the category does not mean owning every machine in it. **Neither the availability field nor the equipment selection has a schema** — both are new fields the chart does not define, so they were built as UI only and parked as **D14**.
  **Browse geography.** `כל הארץ / Nationwide` is now the **single** no-restriction option; the separate `כל האזורים` added the previous day was a duplicate of it and has been removed — that earlier note in this log is superseded. Added a **city / town** filter backed by a datalist of Israeli settlements and a **minimum travel distance** filter, both grouped with the region control so the rail has one geographic block rather than three competing ones. A regional search must still surface nationwide contractors.
  **One defect caught by the checks, not the browser:** the new city inputs are language-duplicated, and `browse-contractors.css` had no `.he-field` / `.en-field` rules at all — both inputs would have rendered simultaneously. Added in the same commit.

- `[2026-08-19]` **The Updated date is now stamped at commit time by a tracked Git hook, and the `document.lastModified` fix committed hours earlier was reverted** (`.githooks/pre-commit`, `core.hooksPath`, `docs/database-design.html`) — the mtime derivation below removed the hand-maintained literal but answered the wrong question: it reports when the file was **written**, while the chip claims when the document **changed**. Both failure modes were measured before deciding rather than argued from theory. **(a)** Merely opening the file in the IDE put its mtime four hours ahead of the last content commit, with `git status` confirming the bytes were identical — so the chip would announce an update on a day nothing happened, once a touch crossed midnight. **(b)** The decisive one: `git clone` writes every file at checkout time, so a fresh clone of this repo reported the mtime as the instant of cloning. **An instructor cloning this project would have opened the page and read "Updated" as the day they cloned it, on every clone, forever** — the same confidently-wrong date we set out to remove, moved somewhere harder to notice. **Only Git knows when content changed**, so the date is now written at commit time into the markup itself, which also makes it survive cloning as ordinary committed content. The hook stamps only when `docs/database-design.html` is actually part of the commit, and **refuses to stamp when that file has unstaged edits**, so re-staging can never drag unrelated work into a commit. `core.hooksPath` points at a versioned `.githooks/` instead of the unversioned `.git/hooks`, so the hook travels with the repo. **Two costs accepted knowingly:** one `git config core.hooksPath .githooks` after each clone, and — if that is skipped — a date that goes **stale**, which is a visibly old date rather than a false fresh one. That asymmetry is the whole reason for preferring this mechanism: its failure mode misleads nobody.

- `[2026-08-19]` **The database-design "Updated" chip now derives from the file's own mtime instead of a hardcoded date** (`docs/database-design.html`) — the page was reporting `2026-08-02` while its content was current through 2026-08-18, which is worse than showing no date at all: a reader who trusts the chip concludes the nationwide region and the rating-anonymity decisions were never documented, and goes looking for work that is already there. **Two fixes were possible and the cheaper one was rejected.** Bumping the literal to 2026-08-18 restores the date once and re-arms the identical trap on the next edit — the value can only stay true for as long as somebody remembers a hand-maintained field exists, and the evidence is that nobody did, across four documentation commits. Deriving it removes the class of error: the chip is now the one thing in the masthead that **cannot** disagree with the file it sits on. **Bounded deliberately:** presentation only — no collection, field, index, relationship or note was touched, so the document's substance is byte-identical. Its one real limit is recorded in [§10](#10-bug--issue-log) rather than left to be discovered: `document.lastModified` is the file's mtime only over `file://`, and a copy served over HTTP without a `Last-Modified` header would report "today", every day.

- `[2026-08-18]` **Profile refinement pass: validation diagnosed then fixed, two bidi bugs closed, sidenotes deduplicated, Completed work added, and a nationwide region introduced** (nine commits on `feature/my-profile-screen`, one on `feature/browse-contractors-screen`) — a correction pass over the two profile screens, deliberately **not** a redesign: the blueprint board, panels, typography, palette and responsive ladder are untouched.
  **Validation was diagnosed before anything was changed**, because the shared script is used by four screens on two branches. The finding: **no field was broken by CSS.** first/last name and city worked. The three numeric fields were matched and styled correctly but carried **no `required`**, so an emptied field was genuinely valid — a missing HTML constraint, not a CSS bug. The region `<select>` had three independent causes stacked (this branch's `validation.js` matches only `.form-input`; there is no `.form-select.touched` rule; and a valid option is preselected while the placeholder is `disabled`, so `required` is unreachable). Phone, bio and the specialty checkboxes have no constraints **by intent**. **Decided:** `required` added to all three numeric fields, since the schema gives `delayToleranceDays` and `noticeRequiredDays` real defaults rather than allowing empty; the region select is **left without a reachable invalid state on purpose**, because a rule for a state the user cannot reach is dead code.
  **Two bidi bugs found and fixed**, both logged in [§10](#10-bug--issue-log): five literal `\u200E` escapes rendering as visible text, and — the more damaging one — `dir="auto"` sitting on parents that contained *both* language spans, which forced those blocks RTL even in English. The second is now **[§3.4](#34-bilingual--bidirectional-ui-hebrew-rtl-default--english-ltr) rule 7**, because it is invisible in the default language and so survives review.
  **One sidenote rule.** A sidenote whose information is identical in both modes now appears **only on Edit Profile**; it may appear on both only where the meaning genuinely differs. Placement is standard everywhere — **title → lede → sidenote → content** — and the two visual variants collapsed into the single subtle lock/info treatment. Consequence accepted knowingly: My Profile now carries **no** sidenotes at all, so the "these numbers are public" and rating-anonymity statements are visible only while editing. The `.notice` rules moved out of the shared `profile.css` into `edit-profile.css` accordingly, since the view screen no longer uses them.
  **Settings wording corrected** from "Email and password are changed in Settings" to "To change your email or password, go to Settings" — the old phrasing read as though the values changed themselves.
  **Save / Cancel moved to the very end**, after Ratings, so the form now wraps the whole editing experience and the action bar closes the page rather than interrupting it.
  **New feature — Completed work** (`עבודות שהושלמו`; named from the vocabulary already on the ratings panel rather than a gallery or feed label). Read-only tiles on My Profile, the same tiles plus per-tile remove and an add tile on Edit Profile. **Product decision, per the owner:** entries may be **free-standing** — work completed before joining the platform, which the feature would otherwise exclude — *or* **optionally linked** to work coordinated on the platform. A linked entry for a project the contractor owned may carry the project name; a linked entry for a single task **must name that task's scope and must not imply responsibility for the whole project**. Linked entries carry the badge **`Completed on FieldSync` / `הושלם ב־FieldSync`**, applied only where that specific work is complete — a completed task inside a running project qualifies; a whole-project entry qualifies only once the project itself is complete; work in progress never does. **The badge asserts a record, not a judgement:** it means the platform holds a record of participation and completion, and the view screen says so in its lede, because a mark that reads as a quality certificate would be a promise the platform cannot keep. **Provisional privacy rule (open, revisit after field consultation):** work carried out through a **confidential delegation must not appear here for either party** — not the delegator and not the delegate — because even an unlinked photo can identify a recognisable site and expose the delegation that [§3.3](#33-delegation-visibility-model-depth--1) exists to protect. Storage shape is deliberately **not** designed yet — new **D13** — and `docs/database-design.html` is untouched for this feature.
  **New `nationwide` region.** Contractors working across the country had no way to say so. Adding it to `location.region` has a knock-on effect that is **not** cosmetic: a regional filter must now match `region === selected OR region === 'nationwide'`, or a nationwide contractor would vanish from every regional search — the opposite of what they declared. Browse Contractors was updated in the same pass rather than left open: it gains `Nationwide (all Israel)` as its own filter option. Doing so surfaced a real collision — the existing Hebrew **no-filter** option was already labelled `כל הארץ`, the exact phrase for nationwide, so the no-filter option was renamed to `כל האזורים` and `כל הארץ` now means what it says. On Edit Profile, choosing nationwide marks travel distance as not applicable via `:has()`. **Limitation recorded:** CSS cannot remove a `required` attribute, so the field stays technically required in the DOM; `novalidate` makes that harmless today and React resolves it properly at Stage 2.
  **Commits were split by action** at the owner's instruction rather than bundled: escapes, `dir="auto"`, `required`, nationwide, sidenotes, settings wording, Completed work, Save/Cancel move, and the browse filter each stand alone, so any one of them can be read or reverted on its own.

- `[2026-08-18]` **Profile split into a view screen and an edit screen, the shared CSS extracted, and `refactor/shared-ui` opened** (three commits on `feature/my-profile-screen`: `f714425` rename, `0917bcc` split; plus `ccbfdc7` on `refactor/shared-ui`) — the screen built earlier that day was an *editing* screen wearing the name of the view screen. Everything below follows from correcting that.
  **Reclassification, and why the rename came first.** The original `my-profile.html` was all inputs, Save/Cancel and validation — that is **Edit profile**, not the screen a contractor lands on. It was renamed rather than rebuilt, and the rename was committed **alone, before any content change**, with only the one reference edit needed for the page to still load (its `<link>` to the stylesheet). Reason: Git detects renames by content similarity, so a rename bundled with a rewrite is recorded as a delete plus an unrelated create and the file's history stops at that commit. Committed alone it scored **100 % / 99 %**, and `git log --follow screens/edit-profile.html` walks straight back through `d7967a3`. That traceability is the whole point: the edit screen's history is the profile's history.
  **Why a separate view screen at all.** A profile is read far more often than edited, and an editing surface answers a different question ("what can I change?") than a profile does ("what do I look like?"). Forcing both into one screen means every reader pays the cost of a form. The flow is now **My Profile → Edit Profile → Save / Cancel → My Profile**, which in the static prototype is a real round trip: the form uses `action="my-profile.html" method="get"`, so Save navigates back with no JavaScript.
  **Same width on both, and why Edit was widened.** `--content-max` went **1100 px → 1340 px** and both screens share it, along with one `.profile-grid` split (`1.4fr / 1fr`). At 1100 px a 1920 px display was over 40 % empty margin while the form crammed itself into a single narrow column. The two screens must not change size against each other, or moving between them reads as loading a different page rather than switching mode. Widening is **not** stretching: prose stays on a `--prose-max` reading measure, the grid collapses to one column at 960 px, and the navbar keeps its three-stage ladder.
  **`profile.css` extracted, and deliberately *not* promoted to a global layer.** The board, navbar, panels, trust panel, rating stars, flexibility meter, buttons and bilingual toggle are identical across the two screens; duplicating them would have created a fourth and fifth copy of the navbar. It stays **inside the profile feature** because that is what the evidence supports today — it is shared by two screens, both profile screens. Promoting it now would be guessing at what the dashboard and settings screens will need, and a global file that turns out to fit only profiles is harder to unpick than a local one that later earns promotion. `edit-profile.css` holds form controls, validation, the specialty grid, the avatar uploader and the Save bar; `my-profile.css` holds only the read-only presentation and the Edit control. **Checked automatically:** no edit-only class appears in the view screen.
  **Validation lives only on the edit screen** — the view screen has no `<form>`, no inputs and does not even load `validation.js`, so there is nothing to validate and no touched state to leak. **The login hard-hat warning icon was reused rather than reinvented**, because a second error vocabulary would mean a contractor learning the same signal twice. One adaptation was required and is itself a bug fix: login positions the icon with a physical `right`, which is correct there because its email and password fields are always LTR — the profile's name and city fields follow the **UI** direction, so the same physical offset would have put the icon on the wrong side in one of the two languages. It uses `inset-inline-end` here.
  **One global Edit control, not per-field pencils.** Per-field editing implies each field saves independently, which is a different and much larger interaction model (optimistic updates, per-field failure states) and is not what the form does — it saves as one unit. One control also keeps the read view calm, which matters more than editing convenience on a screen that is mostly read. **Ratings and flexibility stay non-editable on both screens**, per §1: they are trust signals precisely because the person they describe cannot touch them, and an edit affordance next to them would suggest otherwise even if it did nothing.
  **`refactor/shared-ui` created from `develop`** to hold behaviour that is demonstrably reused rather than merely similar. The audit found `lang.js` loaded by **six** screens across three branches, and — the real finding — **two separate implementations of the same touched-field marking**: `validation.ts` (`.form-input`, `blur`) and `register.ts` (`.form-input, .form-select, .checkbox-input`, `blur` + `change`). `validation.ts` is now the superset. It was verified **before** committing, not after: on login, forgot-password and reset-password the set of matched elements is **identical** (2/1/2 fields, zero newly included — none of those screens contains a select or a checkbox), so the change is a no-op there; on edit-profile two region `<select>`s newly receive `.touched`, and **no CSS rule in the profile stylesheets can match them**, so the class is inert. Every `.touched` rule on every consuming screen is gated on `:not(:focus)`, so nothing can turn red while the field is being used, and no `.touched` rule uses a physical direction property. `register.ts` is now redundant but was **deliberately left in place**: deleting it would break `register.html`, which still loads `register.js` on its own unmerged branch. Retiring it is a one-line script swap when `feature/register-screen` merges.
  **Issues found and resolved:** the login warning-icon mirroring trap above; and a rebuild from the tracked `tsconfig.json` produced **byte-identical** `lang.js` and `register.js`, which closes the §8 worry that those two were once compiled ad hoc and no longer matched `npm run build`. **Issue found and left open:** `register.html` loads **no** `lang.js`, so the language choice does not persist from the register screen even though it has the toggle — it belongs to `feature/register-screen` and is logged in §8 rather than fixed from here. **Known cosmetic artifact:** because Save is a real GET submit, returning to My Profile appends a query string to the URL; harmless in a static prototype and gone once React handles the submit.

- `[2026-08-18]` **My profile screen built as static HTML/CSS (`d7967a3`), and four product questions the document could not answer were settled** (`screens/my-profile.html` + `screens/my-profile.css`, on `feature/my-profile-screen`) — approved screen **#6**, and the third authenticated app screen. Reuses the `.app-nav` navbar, the blueprint board, the `.btn` variants, the form controls and the CSS-only bilingual toggle rather than inventing a fourth visual system; **no new colors**, and the only non-palette value is the already-approved `--error` red for validation. **Zero new JavaScript** — the screen wires up the tracked `lang.js` (language persistence) and `validation.js` (touched-field marking) unchanged, so it stays inside the HTML/CSS-only line. Layout: a read-only **trust panel** on top, then identity, then scheduling preferences, then the ratings received. The form carries `novalidate` (instructor rule: no native validation popups) and red appears only once a field is *left* invalid, never on load.
  **The four decisions, each with its reason.** **(a) Ratings are anonymous to the person being rated** — score, comment and month, but no writer. The alternative (naming the rater, which the schema supports) was rejected because in a trade network this size, knowing exactly who gave you two stars is what stops people rating honestly; the rating is a trust signal, and a trust signal that everyone is afraid to write is worthless. **This forced a second, non-obvious removal:** the task and project context, and the exact date, are also withheld **on the own-profile view**, because a task with one rater identifies the writer perfectly — anonymity that leaks through the context line is not anonymity. `ratings.rater` and `ratings.context` are still *stored*; they are withheld by the serializer, so moderation and the rating gate stay auditable. **(b) `schedulingPrefs` is public** — delay tolerance and required notice appear on the public profile, so a GC proposes a workable date the first time instead of discovering the constraint through a rejected proposal. This **widens approved screen #7**, whose description does not list them; recorded here rather than left to drift, and the screen says on its face where the numbers appear. **(c) Location is structured** — city as free text, region from the fixed list; see the matching §8 entry, because free text cannot populate the region index and `register.html` is now the last screen writing location in an unusable shape. **(d) Scope includes `phone` and `travelRadiusKm`** — both are in the schema, both are collected in the onboarding wizard, and **no screen in the approved 36 edits either one afterwards**; leaving them out would mean a contractor who moves has no way to change their travel radius. Specialties became a **multi-select checkbox grid** because `users.specialties` is an array and register only ever collected one trade — its own hint already promises "you can add or change trades later", and this is where later happens.
  **The flexibility score is displayed but deliberately not explained,** because **D6 is still open** — the accept/reject/counter weighting, the window, decay and the cold-start value are all undecided, and §3.3 adds that behaviour now accrues in two roles. The screen therefore states only what §1 actually guarantees: computed from how you respond to date changes, never self-reported, not editable. **It does take one position without closing D6:** with too little history **no score is shown at all**, rather than a default or a zero — a 100 drawn from one response is worse than an honest blank, and `flexibility.score` already defaults to `null`. Implemented as a real `.metric--pending` state, not a comment.
  **Provisional, and marked as such here rather than on the screen:** the bounds on the three number fields — travel radius 0–500 km, delay tolerance 0–30 days, required notice 0–14 days. The schema fixes the defaults (2 and 1) but no bounds, and nothing in the field research says what a real ceiling is.
  **Also corrected: "Public profile = feature, not standalone route" was wrong** — it is a screen with its own route, so §6 now carries **My profile** and **Public profile** as two rows. **Documentation debt created knowingly:** the navbar and board CSS now exists in **three** stylesheets (browse-contractors, subscriptions, my-profile), because each lives on its own unmerged branch and cannot share a file yet. Extract one shared stylesheet when these branches meet on `develop`, or let it dissolve into `<Navbar/>` at the React migration — whichever comes first.

- `[2026-08-14]` **Subscriptions screen: UX-copy pass over every capability label (`5c76e40`)** — naming and localization only; **no tier, price, limit or availability changed.** English FAQ heading `Common questions` → **Frequently asked questions**; the Hebrew heading stays `שאלות נפוצות`. Labels were still reading as descriptions rather than product capabilities, so each was shortened to something scannable in a pricing table: `Confidential delegations at once` → **Active confidential delegations**; `Private planning space` → **Private workspace**; `Agreements that become tasks automatically` → **Automatic task creation**; `Conversations managed by the lead contractor` → **Moderated project conversations**; `Notification muting` → **Mute settings**; `Maximum file size` → **File uploads**; `File version history` → **Version history**; `How notifications reach you` → **Notification channels**; `Professional connections` → **Professional network**; `Joining projects run by others` → **Projects you join**; `Requesting and approving date changes` → **Date change requests**. **`Projects you manage` / `Projects you join` were made a deliberate pair** — the managed-versus-joined distinction is the whole basis of the pricing model, so the two labels are now visibly parallel in both languages (`פרויקטים בניהולכם` / `פרויקטים בהשתתפותכם`). **Hebrew is written natively, not translated:** `Automatic task creation` is `יצירת משימה אוטומטית`, `Moderated project conversations` is `ניהול שיחות בפרויקט`, `Professional network` is `רשת אנשי קשר` — each is the phrase the language would actually use, so the two versions differ structurally on purpose. **One row traded label length for value detail without losing information:** `Task dependencies with conflict checks` became **`Task dependencies`** with the value `Included, with conflict checks`, keeping the guarantee visible while the label stays scannable. All names were applied consistently across the cards, both comparison tables and the FAQ. The four capability flags in `docs/database-design.html` were re-tagged with their new user-facing labels, per the naming rule below.
- `[2026-08-14]` **Subscriptions screen: comparison split into two tables, and every feature renamed into product-facing language (`1c3dc36`)** — two presentation changes; **no tier decision, price or limit was altered.** **(a) One table became two.** *Plan comparison* now carries only the **13 rows that actually differ** between Free, Basic and Premium, and *Included in every plan* carries the **6 that are identical**. Previously the common rows sat inside the tier table under a sub-heading, which buried the upgrade differences among rows that said the same thing three times. The common table drops to **two columns** — capability and value — because three identical columns communicate nothing that the heading does not; the information is unchanged, only the redundancy is gone. A one-line lede under each heading says which table the reader is looking at. **(b) Feature names rewritten.** The labels had drifted into implementation vocabulary. Renamed: `Agreement form that creates the task` → **Agreements that become tasks automatically**; `GC-moderated conversations` → **Conversations managed by the lead contractor**; `Private execution layer` → **Private planning space**; `Mute controls` → **Notification muting**; `Network connections` → **Professional connections**; `Work plan file size` → **Maximum file size**; `Notifications` → **How notifications reach you**; `Active projects you manage` → **Projects you manage**; `Active confidential delegations` → **Confidential delegations at once**; `Participation in others' projects` → **Joining projects run by others**; `Opening and answering reschedule requests` → **Requesting and approving date changes**; and `Task dependencies and cycle prevention` → **Task dependencies with conflict checks** — "cycle" is graph vocabulary that means nothing on a building site. The same names were applied to the card bullets so cards and tables read as one product. **Naming rule adopted:** this document and `docs/database-design.html` keep the precise internal terms (§3.3 *private execution layer*, `limits.agreementForm`), while the screen uses the phrase a contractor reads without translation. The four affected schema fields now carry their user-facing label in their notes, so the two vocabularies cannot be mistaken for two different features.
- `[2026-08-13]` **Subscriptions screen: restored the detail the previous revision had silently dropped, and rebuilt the Basic/Premium ladder (`7db18af`)** — the 2026-08-03 rework over-reached. Diffing it against the previous commit showed the comparison table had gone **15 rows → 9**, with ten rows deleted, and the three cards had lost sixteen bullets between them including the `Everything in Free/Basic, plus:` leads. Only two of those removals had been asked for. **Restored:** the parity rows (`tasks per project`, `team members per project`, `participation in others' projects`, `opening and answering reschedule requests`, `task dependencies and cycle prevention`, `public profile and flexibility score`) now grouped under an *Included on every plan* sub-heading inside the table; `work plans and files` restored and **split into two rows** — file size and version-history depth — which recovers a Basic/Premium difference that the merged row had hidden; the audit row restored as `project history` with a real three-step ladder; and the card leads and priority-support bullet. **Kept removed, as approved:** the Rules Engine (§6 marks it *Stretch*), the "API runs" label, the date-change definition of a simulation, development-status language, and the *unlimited on every plan* band — the band became genuine duplication once the parity rows returned to the table, and its removal was approved explicitly rather than assumed. **Working rule adopted:** a feature marked **`Planned`** in §6 may appear on the pricing screen (delegation, audit history and the cascade already did, and none of them is built yet); a feature marked **`Stretch`** may not. That is the line that keeps the Rules Engine off while allowing the agreement form, GC-moderated conversations and mute controls. **New ladder** — Free 5 projects / 3 simulations a week / 1 delegation / 10 MB latest-version-only / 30 days of history / 50 connections; Basic 25 / **10** / 5 / 30 MB with the last 5 versions / 12 months / 500 connections, plus email notifications, GC-moderated conversations and mute controls; Premium **100** projects / **60** simulations / unlimited delegations / every file version / complete history / unlimited connections, plus the private execution layer, the agreement form, a daily digest and priority support. **Premium is deliberately no longer "unlimited everything"** — projects and simulations carry real ceilings, because a tier defined only by the absence of limits gives a buyer nothing concrete to weigh. **Basic dropped from 40 to 10 simulations a week**: 40 (about eight a working day) already satisfied almost every real user, so nobody would ever have needed Premium; 3 → 10 → 60 gives steps of 3.3× and 6×, each visible. Basic delegations also went 10 → 5 so that 1 / 5 / unlimited reads as a progression. Fixed `Help centre` → `Help center`; the English copy is now American throughout (checked against a list of thirteen British spellings). **Schema consequences, per golden rule 3:** `limits.fileVersioning` (Boolean) became **`limits.fileVersions`** (`Number | null`) because retention depth is a three-step ladder an on/off flag cannot express; and four capability flags were added — `moderatedThreads`, `muteControls`, `agreementForm`, `notificationDigest`. Every one of them gates a *convenience or refinement*, never a coordination primitive.
- `[2026-08-03]` **Subscriptions screen reworked against the review; all eight findings addressed (`83a8c0e`)** — **(1) Responsive layout rebuilt as a three-stage ladder** rather than one breakpoint: at 1040/900 px the link row tightens and the profile name drops; at 780 px the links move to their own full-width row so they cannot collide with the bell, account and language controls; at 460 px the brand wordmark hides and the link row scrolls horizontally *inside itself* instead of squashing. Also fixed the real RTL defect behind the report: `.nav-profile`, `.lang-switch` and the FAQ marker used **asymmetric four-value `padding` shorthands**, which do not mirror — so the affected element sat on the wrong side in one of the two languages. All are now logical (`padding-inline`). **The earlier "no physical left/right" test did not catch this**, because it looked for `padding-left` and `left:` but not for four-value shorthands; the test has been extended. **(2) Simulation meaning corrected everywhere.** A simulation is now defined, consistently across cards, table and FAQ, as *a visual representation the simulator builds from the details and selections the contractor entered*, and the allowance as *how many the user may create per week*. Every previous framing — moving a date, previewing dependent tasks, a cascade or reschedule preview, "API runs" — is gone from the rendered text. The metric was renamed `cascade_simulation` → **`visual_simulation`** in `docs/database-design.html` so the schema stops describing a different feature from the screen. **(3) All prototype, unreleased and internal language removed** from user-facing text. **(4) The Rules Engine is gone** from the cards, the table and the benefits — §6 keeps it a stretch goal and it must not be sold. **(5)(6) Tier limits reworked so nothing prices the coordination loop.** Tasks per project, team members per project, participation in projects owned by others, and **both opening and answering reschedule requests** are unlimited on every plan and moved out of the table into a single "unlimited on every plan" band — the platform only works when every party on a job is in it, so charging for the loop breaks the product before it earns anything. Free rises to **5 managed projects**, 3 visual simulations a week, **1 active confidential delegation** (a concurrency limit, so a free user can *see* the signature feature rather than only read about it), 10 MB files, 30 days of history, 50 connections. Basic: 25 projects, 40 simulations, 10 delegations, 30 MB versioned files, full history, unlimited connections, email notifications. Premium: unlimited projects, simulations and delegations, plus the private execution layer and priority support. Every retained limit is now **capacity, storage, history or convenience** — none blocks core use. **(8) Prices unchanged at ₪60/$20 and ₪105/$35, and the tax basis is now identical in both languages** — all prices are tax-inclusive, replacing the VAT-inclusive-Hebrew against tax-exclusive-English split that gave one language an effective discount. **(9) Duplicated plan status removed:** the old strip repeated the Free card, so it now shows only what the cards cannot — simulations used this week, plus the billing-history link. Cards carry a four-point overview; the table carries the detail; the FAQ answers what neither shows. **(10)(11) Plan descriptions and all six FAQ answers rewritten** — contractor-facing, no internal vocabulary, no unapproved promises, and no restatement of the table. **Schema consequences, per golden rule 3:** `limits.canDelegate` (Boolean) became **`limits.activeDelegations`** (`Number | null`), since delegation is now a concurrency allowance rather than an on/off switch; `limits.canOpenReschedule` was **deleted** rather than set to true everywhere, because a field that can never legitimately be false is an invitation to set it false later; and `tasksPerProject` / `membersPerProject` stay in the catalogue but are `null` on every tier, documented as deliberately uncapped.
- `[2026-08-02]` **Owner review of the subscriptions screen — eight findings recorded, none fixed yet** — the first review of `screens/subscriptions.html`. Logged here rather than in [§10](#10-bug--issue-log) because that log records problems *solved*; these are open, and the fixes will be a separate change so that the findings and the response to them stay separately auditable. **(1) Responsive layout breaks at narrower widths**, worst in the app navbar and the language switch. **(2) The simulation allowance is described incorrectly and leaks implementation detail** — the comparison row is labelled "הרצות API / API runs", an internal concept a contractor should never be shown, and the wording does not match what the allowance actually meters. **(3) Prototype and future-development language is visible to users** — the "buttons are a prototype, checkout is wired in a later stage" note and the FAQ sentence explaining what "this prototype" does both address a developer rather than a customer. **(4) Several tier limits are too restrictive for the product to be evaluated** — projects, tasks, team members, opening a reschedule, and confidential delegation are all gated harder than a prospective user needs in order to form a judgement. **(5) The Rules Engine is removed from the screen** — both the comparison-table row and the Premium card bullet. §6 keeps it a stretch goal, so it is not in current scope and must not be presented to a customer at all. **(6) The current plan is shown twice** — the status strip above the cards repeats what the Free card, already flagged "your plan", carries. **The comparison table itself is not duplication and is kept** — its only change is losing the Rules Engine row under item 5. **(7) Hebrew and English tax treatment is inconsistent** — VAT-inclusive against tax-exclusive, which makes the two prices non-comparable; previously logged below as an open question, the review confirms it as a defect. **(8) Plan descriptions and FAQ copy need revision.** Item 5 is decided. Items 4 and 7 are product decisions rather than copy edits, so they are settled with the owner before the code changes.
- `[2026-08-02]` **Subscription data model designed, documentation scope recorded, subscriptions framing corrected, and the compiled-JavaScript policy closed (D12)** — four related corrections in one pass. **(a) Documentation scope.** Added a *Where this document lives* note to the header: the MD is maintained on `develop` and `main` only and kept byte-identical on both, so a `feature/*` branch trailing by a documentation-only commit is behaving correctly. The previous entry wrongly reported that lag as a limitation; it is not one. **(b) Framing corrected.** The subscriptions screen is described in §6 and below as an **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included. The earlier phrasing framed it as an out-of-scope addition, which it is not; it would be equally wrong to call it one of the original 36 rows or a required screen. Nothing else about the screen — its history, prices, provisional limits, rationale or open questions — was altered. **(c) Data model designed** and reflected in `docs/database-design.html` per golden rule 3, reversing the earlier instruction to leave it unmodelled. Three new collections — **`plans`** (seeded catalogue: prices per currency, every limit, `provisional: true`), **`subscriptions`** (one document per period; the sale is snapshotted so a catalogue edit cannot rewrite an issued invoice; a **partial unique index** on `{ user: 1 }` filtered to `status: 'active'` makes "exactly one live subscription" a database guarantee rather than an application convention), and **`usagecounters`** (one document per user × metric × week, fixed Monday 00:00 UTC boundaries, the quota enforced **inside the update filter** because a read-then-write check lets two concurrent requests both spend the last unit). Plus a denormalised **`users.planCode`** — the third computed field on `users`, justified exactly as `ratingSummary` and `flexibility` are: the authorization layer reads the tier on nearly every request, so the cost belongs on the rare write. Money is stored in **minor units as integers**, and `taxIncluded` is per currency row, which is what records that ₪60 (VAT-inclusive) and $20 (pre-tax) are quoted on different bases. Document totals moved 15→**18 collections**, 167→**212 fields**, 40→**47 indexes**, 35→**38 relationships**; a new `billing` domain uses the approved `--secondary` tan, so no new color was introduced. **(d) D12 closed:** compiled JavaScript is tracked alongside its TypeScript source and build config, so a fresh clone opens every static screen with no toolchain.
- `[2026-08-02]` **Subscriptions screen — first prototype committed (`f83aaf1`); in progress** (`screens/subscriptions.html` + `screens/subscriptions.css`, on `feature/subscriptions-screen`) — an **additional feature the owner chose to add**, consistent with the lecturer's note that subscriptions may be included; it is not one of the original 36 rows, and not a required screen. First monetisation screen and the second authenticated app screen, so it **reuses** the `.app-nav` navbar, the blueprint-board background, the `.btn` variants and the CSS-only bilingual toggle from `browse-contractors` rather than inventing a second visual system. No new colors. The screen contains **no `<form>` at all**, so the no-native-validation-popups rule cannot be violated here. **Zero new JavaScript**: the three plan cards, the comparison table and the FAQ accordion (`<details>`/`<summary>`) are pure HTML/CSS, and the only script is the pre-existing `lang.js`. **Three tiers — Free · Basic ₪60/$20 · Premium ₪105/$35 per month.** The ILS prices are the ≈3.06 conversion reduced by an equal **2.06 %** on both tiers (₪61.26→₪60, ₪107.20→₪105) so the two currencies stay proportionally consistent instead of each being rounded independently. **Currency follows the UI language** (Hebrew→ILS, English→USD) because a static prototype has no other signal; the FAQ states this on the screen and records that the real system must derive currency from the **account's country** — §3.4 separates language from locale, and billing currency is a locale concern.
  **Grounded in this document:** participation in *other people's* projects is **unlimited on Free**, because §1's "equal users" model collapses if a sub must pay to answer a GC — the paywall sits on *running* projects, never on *joining* them; **confidential delegation and the private execution layer are Premium-only**, since §1 calls delegation the field-confirmed differentiator and §3.3/Stage 5 make it the most expensive thing in the build; the **rules engine is labelled "when it ships"** and never promised, because §6 keeps it a stretch; the **flexibility score is not gated at all**, since §1 makes it a trust signal and gating it would break `browse-contractors` for everyone.
  **Provisional** — and marked as such *on the screen*, in a visible strip under the cards rather than buried in fine print: every number (1/5/∞ projects, 10/100/∞ tasks, 5/25/∞ members, 20/∞ connections, 5 MB vs 30 MB files, the 30-day audit window), the sharpest gate "Free may *respond* to a reschedule but not *open* one", and email notifications at Basic+ — D3 (notification delivery) is still open, so that tier may not even be buildable as written.
  **New metered dimension — cascade simulation runs** (Free 3/week · Basic 30/week · Premium unlimited, fair use). A "simulation" is a what-if preview of a date change's downstream effect *before* any proposal is sent: the "cascade preview" named in the 2026-06-01 Context/Redux note plus Stage 4's "before/after review". **Metering it is new; the capability is not, and no public or developer API was invented** — nothing in this document describes one, so "API" here means only the internal endpoint each run calls.
  **Apparent contradiction resolved for future-you:** §1's non-goal "**no pricing or money flow**" is about **job rates between contractors** staying confidential. It is *not* a ban on the platform charging for itself. A subscription is FieldSync↔user; the non-goal protects sub↔GC. No rate, quote or payment between two platform users appears anywhere on this screen.
  **Left open rather than silently decided:** the tax line reads VAT-**inclusive** in Hebrew but tax-**exclusive** in English, so the two prices are *not* net-equivalent (₪60 incl. 18 % VAT = ₪50.85 net vs. $20 ≈ ₪61 net) — needs a call on whether both modes are inclusive; and the entire data model behind it is new **D11**. `screens/lang.js` was committed alongside the screen as a **temporary, documented exception** to the "compiled JS is a build artifact" rule, because the screen depends on it and `lang.ts` then existed only on `feature/login-screen` (superseded the same day by **D12**, which makes tracking compiled JS the project-wide policy — see §8).
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
