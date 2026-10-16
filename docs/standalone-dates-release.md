# Standalone date management — release plan

Prepared 2026-10-16 on `feature/task-schedule-notifications-settings`. **Nothing here has been
executed against production.** Every production-changing step below waits for the owner's explicit
authorization, given at that step.

## Where things stand

| Stage | Status |
|---|---|
| Local verification | **Done.** Backend, on isolated local databases: `verify:private-execution` 35 PASS, `verify:task-detail` 68 PASS, `verify:standalone-dates` 52 PASS (including the migration's dry run, manifest, idempotency and exact rollback). |
| Release rehearsal | **Done, not cloud.** The full cloud procedure against a throwaway local backend, a production-mode frontend build and a seeded throwaway database migrated with the real script: **121 PASS, 0 FAIL** — the 105 earlier conditions plus 16 for the remaining task corrections, with zero browser errors and no exemptions. |
| Deployment compatibility | **Done, not cloud.** The new frontend against today's `main` backend: 18 PASS. The earlier negative control — the frontend from before the guard — crashes into the error boundary, which shows the guard is what prevents it. |
| Production migration | **Done, 2026-10-16.** Pass 1 updated exactly the 15 approved tasks (14 agreement, 1 baseline). A snapshot diff proved nothing else changed: no current dates, execution times, agreements, projects, memberships or proposals. Pass 2, after the deploy, changed 0. Manifests are in `~/.blokta-qa/migrations/production-release-20261016T185739Z/`. |
| Cloud deployment | **Done, 2026-10-16.** `main` is at `0e67fa3`. Vercel: a GitHub Production deployment of that commit reached success at 19:00:29 UTC, and the live bundle carries the release copy. Render: at 19:01:46 UTC it served the release-only fields. |
| Cloud runtime verification | **Done, 2026-10-16: 130 PASS, 1 FAIL.** The failure was a false positive in the check: the delegate is also a project member, so her name appears in the GC's handoff member picker. A read-only follow-up proved D7 holds. The check is now scoped to exclude the member picker. Logs are in `~/.blokta-qa/verification/standalone-dates/sd-20261016T190237Z/`. |

The private-subtask execution defect is **implemented and verified on this branch** (see *The remaining task corrections* below); it closes with the owner's acceptance of the release.

## The rehearsal defects, and their corrections (approved 2026-10-16)

1. **Commissioner notice → a page they could not see.** The notice linked to `/tasks/:id`, which is
   the performer's task. It now leads to My Tasks → Commissioned Work, with the work highlighted
   (`/tasks?commissioned=:id`), using the existing list. No schema change was needed: a
   `task.updated` notice without a project is, by construction, only ever the commissioner's.
2. **The responsibility-handoff panel on standalone work.** It is now drawn only where the viewer
   can see the project. Handoff rules are unchanged.
3. **The empty delegation panel.** It is now drawn only for a delegate, for the delegator of an active
   delegation, or for someone who may delegate now. The own-crew-only note went with it: it was a
   panel with no possible action, and it was also shown to accounts that must not detect the
   feature.
4. **Deployment compatibility.** The new date panel tolerates the previous backend's response shape:
   a missing trail reads as an empty history and missing originals read as «לא תועד במערכת».

**Found by the corrected rehearsal and closed under "preserve D7":** a delegate was shown the
project stage section and the project date-change panel, and the API served the delegate an impact
count of other works — sequence information D7 withholds. Both project panels now follow the same
"project visible to this viewer" rule, and a delegate's `rescheduleImpact` is `null`.

## The remaining task corrections (approved 2026-10-16)

1. **Private sub-task execution.** A sub-task now starts and completes using the parent task's own
   model: `startedAt` / `completedAt`, each written once, Complete only after Start, and state
   derived on read. Notes have no execution, and the parent task is never moved by it. The layer is
   still visible only to its owner: the GC, the commissioner, company employees, the delegator (for
   the delegate's layer) and outsiders all get 404.
2. **The private-layer 404.** The task detail now says whether this viewer has a private layer
   (`viewer.hasPrivateLayer`), and the page asks for one only then. Direct requests still get 404.
   Against the previous backend, which sends no flag, the page still asks, so owners never lose
   their layer during the deploy.
3. **The delegate's summary.** It keeps the real type «משימה בפרויקט», and the project line reads
   «פרטי הפרויקט אינם מוצגים» on both the task page and My Tasks, instead of the false «ללא פרויקט».

**D7 clarified (owner decision, 2026-10-16):** the shared task's progress is visible to its
authorized participants, including the delegator. The Private Execution Layer is its owner's alone.
The implementation already followed this and was left unchanged. A runtime probe confirmed it
(14 PASS, log in `~/.blokta-qa/verification/standalone-dates/d7-clarification-20261016T184813Z/`).
The two sub-task fields are approved.

**Owner to confirm in the dashboard:** Render's deploy branch is `main` with Auto-Deploy on. Vercel
production follows `main`: a fix merged at 08:18 UTC on 2026-10-13 was live at 08:20.

## 1. Merge plan

The branch already contains current `develop`, and `main`'s tree is identical to `develop`'s. Run
both merges on throwaway branches again immediately before executing them.

```zsh
# Step 1 — develop (standard workflow)
git switch develop && git pull --ff-only
git merge --no-ff feature/task-schedule-notifications-settings \
  -m "merge: standalone date management — originals, trail, commissioner notice"
git push origin develop

# Step 2 — main (APPROVAL-GATED; this push is what deploys)
git switch main && git pull --ff-only
git merge --no-ff develop -m "merge: develop into main — standalone date management"
git push origin main
```

Never force-push; a bad release is undone with `git revert -m 1 <merge>` on `main`, after approval.

## 2. Migration plan

The migration only **adds** three fields to task rows that lack them. It never changes a task's
current dates, never touches agreement messages, and project tasks are left alone.

**Where it runs:** from this machine (Render's free instance has no shell), with the production
connection string exported **in the owner's own terminal** — never pasted into a chat, a file or a log.
The script prints only the host and the database name.

**Safety rails, all in the script:** dry run by default · `--apply` refuses unless `--confirm-db`
names the database actually connected · agreements with conflicting or unreadable dates are reported
and skipped · every write is filtered on "field still absent", so it is idempotent · each apply writes
a manifest of the exact task ids it touched (`~/.blokta-qa/migrations/`, mode 600, ids only — no
customer data) · `--rollback=<manifest>` undoes exactly those writes.

**Sequence.** Run it twice: once before the deploy, then once more straight after. If it ran only
after the deploy, a legacy task edited in the gap would get a post-edit baseline. The old code never
reads the new fields, so running it first is safe.

```zsh
cd Backend
export MONGODB_URI='<production connection string>'        # owner's terminal only

npm run migrate:original-dates                               # A. dry run — read-only
#   expect: "stamped rows missing their source marker: 0" (anything else: STOP)
#   expect: conflicts 0, or review each listed id before going on
npm run migrate:original-dates -- --apply --confirm-db=<db>  # B. pass 1 (AUTHORIZATION REQUIRED)
#   … deploy (section 3) …
npm run migrate:original-dates -- --apply --confirm-db=<db>  # C. pass 2 catch-up (AUTHORIZATION REQUIRED)
npm run migrate:original-dates                               # D. post-check: only project tasks left without originals
unset MONGODB_URI
```

Optional full backup before B (an owner decision — it copies customer data to this machine):
`mongodump --uri "$MONGODB_URI" --collection tasks --out ~/.blokta-qa/backups/tasks-<date>`; delete it
once the release is accepted. Atlas M0 has no snapshots, so the manifest is the primary undo.

## 3. Deployment steps

1. Owner confirms Render's deploy branch.
2. Migration dry run A, then pass 1 B — authorized separately.
3. Merge step 1 (develop), then merge step 2 (main) — `main` authorized separately.
4. Render: wait for the deploy of the new `main` commit to show **Live**; `GET /api/health` answers ok
   with a small `uptimeSeconds`. The compatibility guard covers the minutes in which Vercel is ahead.
5. Vercel: wait for the production deployment of the same commit to show **Ready**.
6. Migration pass 2 (C) and the post-check (D).
7. The cloud runtime verification (section 4).
8. Download the Render logs for the verification window (printed by the procedure) from the
   dashboard.

## 4. The cloud runtime verification

`Frontend/scripts/verify-standalone-dates-cloud.mjs` — one procedure, against
`https://blokta.vercel.app` and `https://blokta.onrender.com/api` only.

```zsh
cd Frontend
BLOKTA_VERIFY_CONFIRM=standalone-dates npm run verify:standalone-dates-cloud   # AUTHORIZATION REQUIRED
```

Without the confirmation variable it runs the read-only preflight and stops. Skip that separate
preflight on the day: the full run performs it anyway, and both together would exceed the login
limit (10 per 15 minutes).

**Accounts:** QA-03 שי לוינסון (performer and delegator), QA-02 גיל שרון (commissioner and project
GC), QA-04 דנה אדלר (the delegate of the existing delegated task), and QA-08 טל אורן (outsider). They
are read from `~/.blokta-qa/credentials/qa-accounts.production.json`. Seven logins in all.

**What it creates** (all titled `אימות מועדים · … · <run id>`): one standalone task for QA-03 with
one private sub-task on it, and one agreement in the existing QA-02 ↔ QA-03 conversation, proposed
and accepted in the same run, plus the task it becomes. It consumes **no** pending QA state: the pending agreement איטום גג, the
open date-change request, invitations, connection requests and the existing delegation are all
untouched; the pending proposal and the delegated task are only read. There is no task-delete
endpoint, so these fixtures stay as labelled QA records. Afterwards it marks as seen only the
notifications the run itself caused, so the QA unread badges return to their pre-run values.

**What it checks:**

- **Preflight.** It aborts before any write unless the new frontend bundle, the new backend fields
  and the migration are all live.
- **Original-date sources on the existing QA tasks.** Agreement-born tasks must equal their agreement
  message dates; migration baselines must equal the dates on record; project tasks have no
  originals.
- **Project scheduling is unaffected.** On QA-03's project task: the stage still shows, the
  date-change flow is still offered, a direct date edit is refused with 409, the impact preview still
  computes, and the dates do not move. On the performer's and the GC's project pages, the stage,
  date-change and handoff panels are drawn, and the delegation panel follows the viewer's standing.
- **D7, on the existing delegated task (read-only).**
  - The delegator sees who performs; the GC is served no delegation, and their page never names the
    delegate.
  - The delegate gets no project, no stage and no impact count, and their counterparty is the
    delegator.
  - The delegate's page shows the "received" note and none of the stage, date-change or handoff
    panels.
- **Self-created standalone task, through the deployed UI.**
  - Only the new date panel is drawn: no stage, date-change or handoff panel.
  - The delegation panel follows the viewer's standing.
  - Dates are edited with a reason, and after a refresh the history persists.
  - The server-side dates, originals, source and trail are correct, and nobody is notified.
- **Agreement-born standalone task.**
  - The counterparty comes from the agreement; the commissioner gets 403 on editing and the
    outsider gets 404 on reading.
  - A delay recorded through the UI persists after a refresh, and the agreement message is unchanged.
  - The commissioner receives exactly one notice; the performer and the outsider get nothing.
  - Following the notice lands on My Tasks with the commissioned work highlighted and its new due
    date shown.
  - The commissioner's browser never requests the performer's task, and no handoff request is made
    for standalone work.
- **Nothing unrelated moved.** Every pre-existing QA-03 task keeps its dates, state, delegation and
  proposal marker; every commissioned task keeps its due date; and the pending proposal keeps its
  status.
- **Private sub-task execution, on the run's own standalone task, through the deployed UI.**
  - A sub-task is added; Start, a refresh, Complete and another refresh each show the right state.
  - Its detail shows when it started and when it completed, and the server holds both stamps.
  - The task itself stays «טרם התחילה».
  - The commissioner and the outsider get 404 on the layer, and the GC gets 404 on a project task's
    layer.
  - Only viewers who have a layer are told they have one, and the GC's pages show no private panel.
- **The delegate's summary.** It keeps «משימה בפרויקט» and reads «פרטי הפרויקט אינם מוצגים» on both
  the task page and the My Tasks row.
- **Frontend health.** No uncaught page errors, no application console errors, no unexpected failed
  API calls, and no request for a private layer by a viewer who has none.

**What it does not prove:** email delivery (QA accounts have none); behaviour for accounts outside
the QA set; the live deploy gap itself. The compatibility guard is proven only by the rehearsal:
`npm run verify:previous-backend-compat`, which runs against local URLs only.

**Logs** (outside git, mode 600): `~/.blokta-qa/verification/standalone-dates/<run id>/`, containing
`run.log`, `http.jsonl` (every API call: status, timing, sanitized bodies), `browser.jsonl` (console
errors, page errors, failed calls), `screens/*.png`, and `summary.json` (counts, fixture ids, the UTC
window, the known pre-existing errors). Passwords, tokens and email addresses are never written;
logins are recorded as `[auth body redacted]` and emails are masked.

**Backend logs:** the API logs only startup, database and server-side errors; there is no per-request
access log. The Render log for the run's UTC window can therefore show that nothing errored, but it
cannot trace individual requests.

## 5. Rollback

- **Code:** Render → Deploys → *Rollback* to the previous deploy; Vercel → Deployments → previous
  production deployment → *Instant Rollback*. Data written by the new code stays harmless: the old
  code ignores the three new fields and never reads `taskdatechanges`. Keeping that data preserves
  the history for a re-deploy.
- **Data:** only if the migration itself is wrong:
  `npm run migrate:original-dates -- --rollback=<manifest> --confirm-db=<db>` (a dry run that counts
  what it would revert), then the same command with `--apply`. Each manifest is undone separately,
  newest first.
- **Git:** `git revert -m 1 <merge commit>` on `main`, after approval. Never a force-push.

## Evidence

The latest integrated verification session is in
`~/.blokta-qa/verification/standalone-dates/integrated-20261016T182639Z/`. It contains:

- the three backend logs (A);
- the migration log and its manifest (B1);
- the full release rehearsal with screenshots (B2);
- the compatibility check (C).

The previous session, `integrated-20261016T180232Z`, also holds the guard's negative control.
