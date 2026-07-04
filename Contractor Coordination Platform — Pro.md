# Contractor Coordination Platform — Project Source of Truth

> **Living document.** This is the single source of truth for the project: what we're
> building, how it's structured, what's decided, what's still open, what's done, and a
> running log of every bug and every decision *with the reason behind it*.
> Update it **as we go** — before or right after a change, never "later."
>
> Codename: _TBD_ · Owner: _(you)_ · Stack: React (Vite) · Node/Express · MongoDB/Mongoose · JWT · Multer
> Last updated: **2026-06-28**

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

**Two golden rules:**

1. **Every change** to the project (code, structure, or scope) gets a one-line entry in the
   [Decision Log](#11-decision-log) with the *reason*. Future-you needs to know *why*, not just *what*.
2. **Every bug or problem solved** gets an entry in the [Bug & Issue Log](#10-bug--issue-log),
   so we never debug the same thing twice.

**Definition of "Done":** it works, it's tested, and it didn't break existing behavior or drift
the design. Anything touching **visibility/privacy** also gets an explicit *"who must NOT see this?"*
check before it's marked Done.

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

### 3.2 Data model (provisional entity list — schemas designed per stage)

> Entities and their *purpose* only. Relationships (embed vs. reference) and fields are **TBD** and
> get decided when we build the stage that needs them.

| Entity | Purpose | Notes |
|---|---|---|
| `User` | Account + identity (specialties, location, bio, avatar), ratings, flexibility score, global `isAdmin` flag | The **only** global role is `admin` |
| `Connection` | The request → accept graph between users | Gates messaging |
| `Project` | Container for tasks; has an owner | |
| `Membership` | A `user × project` link holding the **per-project role** | Role lives here, *not* on the user |
| `Task` | Project task or standalone job; binary status; dependencies; assignee | DAG via dependency refs. `assignee` is GC-visible (= delegator); a separate `delegate` field is visible only delegator-and-down — see §3.3 |
| `WorkPlan`/file | Versioned uploaded files (PDF/images) | Storage approach TBD (open decision) |
| `RescheduleProposal` | The negotiation object; carries the proposal state machine | Semantics TBD (open decision) |
| `Thread`/`Message` | Direct (connection-gated), project, and GC-moderated conversations | |
| `Notification` | Invitations, schedule changes, approvals/counters, etc. | Delivery method TBD |
| `Report` | User-filed reports for admin review | Admin module (late stage) |
| `Rule` | Personal automation rules | **Stretch only** |

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
| Landing | 1–2 | Planned | Not started yet; will stay plain HTML/CSS before React migration |
| Register | 1–2 | In progress | Register screen HTML/CSS is actively being refined as a luxury blueprint-board prototype (`screens/register.html` + `screens/register.css`) |
| Login | 1–2 | In progress | Login screen HTML/CSS exists (`screens/login.html` + `screens/login.css`), but its CSS still needs to be updated to match the newer register-screen visual direction |
| Forgot / Reset password | 1–2 | In progress | Static HTML/CSS on `feature/login-screen` (`screens/forgot-password.html` + `screens/reset-password.html`), reusing `login.css`. Full CSS-only flow: request link → check-inbox → set new password → success. Email dispatch + single-use-token verification wired in Stage 2 |
| JWT auth + protected routes (both sides) | 1–2 | Planned | bcrypt for passwords |
| Profile completion wizard | 2 | Planned | Part of registration |
| My profile / Public profile | 2 | Planned | Public profile = feature, not standalone route |
| Settings (account / notifications / deactivate-delete) | 2 | Planned | Confirmations are popups |
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
- **Authorization is a separate concern from the serializer (and is currently missing from this doc).**
  The serializer governs what a user can *see* (read side). It says nothing about what a user is allowed
  to *do* (write side): reschedule this task, invite to this project, delegate this work. That check
  ("can this user perform this action on this resource?") must also be centralized, or it ends up
  scattered and inconsistent across controllers. (Tracked further in D-decisions where relevant.)
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
- **Demo seed data is a deliverable risk.** The Live Demo is graded, and a multi-party coordination
  platform is useless to demo from one empty account. You need a seed script (several users, a project
  with dependencies, a pending reschedule, a delegation). Build it incrementally as features land — not
  the night before.

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
