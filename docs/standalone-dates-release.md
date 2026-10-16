# Standalone date management — release plan

Prepared 2026-10-16 on `feature/task-schedule-notifications-settings`. **Nothing here has been
executed against production.** Every production-changing step below waits for the owner's explicit
authorization, given at that step.

## Where things stand

| Stage | Status |
|---|---|
| Local verification | **Done.** `npm run verify:standalone-dates` (Backend) — 52 PASS on an isolated local database, including the migration's dry run, manifest, idempotency and exact rollback. |
| Local rehearsal of this plan | **Done, not cloud.** The migration and the cloud procedure were run end to end against a throwaway local backend, a production-mode frontend build and a seeded throwaway database: 67 PASS, 3 FAIL — all three are real findings, listed under *Blockers*. |
| Cloud deployment | **Not done.** Production still serves the previous build (checked read-only 2026-10-16 17:19 UTC: `/api/health` ok, and the live bundle carries none of the new copy). |
| Cloud runtime verification | **Not done.** It cannot run until the deployment and the migration are live; the procedure refuses to write anything before then. |

The private-subtask execution defect is **still OPEN** and is not touched by any of this.

## Blockers needing an owner decision before the merge

1. **The commissioner's notice opens a page they cannot see.** `task.updated` is not an
   informational notification type, so the row draws an "open" link to `/tasks/:id`. The
   commissioner has no view of the performer's task, and the page answers «העבודה לא נמצאה, או
   שאין גישה אליה». Seen in the rehearsal (screenshot `07`). Options:
   (a) **recommended** — send the commissioner's notice to My Tasks, where the commissioned-work list
   already shows the new due date; or (b) make the commissioner's notice informational with no link,
   matching the existing owner rule for status updates.
2. **The handoff panel («העברת אחריות») is still drawn on standalone work.** The handoff flow is
   project-only: its endpoint answers 404 for standalone tasks, the panel swallows that and shows an
   explanation of a flow that cannot happen, and every standalone task page logs a console 404. This
   falls under the original clarification (hide project-specific sections) and was missed. Fix: do
   not render the panel when the task is standalone, as was done for the stage section.
3. **The delegation panel («העברת ביצוע») draws an empty shell** when the viewer can neither
   delegate nor is party to a delegation (the owner's first screenshot). It is not project-specific,
   but an empty titled panel also reveals the feature to accounts it should stay hidden from. Fix:
   render nothing in that case. Pre-existing; affects project tasks too. Include it in this batch or
   leave it out — the owner's call.
4. **Deploy race.** Vercel usually finishes before Render. In that window the new frontend reads a
   standalone task from the old backend, which has no `dateChanges` field, and the page would crash
   into the error boundary. Fix (recommended): a two-line guard in the new panel. Alternative:
   deploy Render first and hold the Vercel deploy until Render is live.
5. **Confirm the deploy sources in the dashboards.** Vercel production follows `main` (a fix merged to
   `main` at 08:18 UTC on 2026-10-13 was live on Vercel at 08:20). Render's branch and auto-deploy
   setting are not visible from the repository: confirm Render → service → Settings → Branch = `main`,
   Auto-Deploy = Yes.

Items 1–4 are small code changes on this branch. They are **not made**; each waits for approval, and
the local verification and the rehearsal are rerun afterwards.

## 1. Merge plan

The branch already contains current `develop` (`4b8ca54`), and `main`'s tree is identical to
`develop`'s. Both merges were run on throwaway branches and are clean: each yields exactly this
branch's tree, and only the 19 standalone-date files (plus this preparation) reach `main`.

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

1. Owner confirms blocker 5, and decides blockers 1–4 (any approved fixes land on this branch first,
   with local verification and the rehearsal rerun).
2. Migration dry run A, then pass 1 B — authorized separately.
3. Merge step 1 (develop), then merge step 2 (main) — `main` authorized separately.
4. Render: wait for the deploy of the new `main` commit to show **Live**; `GET /api/health` answers ok
   with a small `uptimeSeconds`.
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
npm run verify:standalone-dates-cloud                                  # preflight only, read-only
BLOKTA_VERIFY_CONFIRM=standalone-dates npm run verify:standalone-dates-cloud   # AUTHORIZATION REQUIRED
```

**Accounts:** QA-03 שי לוינסון (performer), QA-02 גיל שרון (commissioner), QA-08 טל אורן (outsider),
read from `~/.blokta-qa/credentials/qa-accounts.production.json`. Five logins in all, inside the
limit of 10 per 15 minutes.

**What it creates** (all titled `אימות מועדים · … · <run id>`): one standalone task for QA-03, and
one agreement in the existing QA-02 ↔ QA-03 conversation, proposed and accepted in the same run,
plus the task it becomes. It consumes **no** pending QA state: the pending agreement איטום גג, the
open date-change request, invitations and connection requests are all untouched, and the pending
proposal is only read. There is no task-delete endpoint, so these fixtures stay as labelled QA
records. Afterwards it marks as seen only the notifications the run itself caused, so the QA unread
badges return to their pre-run values.

**What it checks:**

- **Preflight.** It aborts before any write unless the new frontend bundle, the new backend fields
  and the migration are all live.
- **Original-date sources on the existing QA tasks.** Agreement-born tasks must equal their agreement
  message dates; migration baselines must equal the dates on record; project tasks have no
  originals.
- **Project scheduling is unaffected.** On QA-03's project task: the stage still shows, the date-change
  flow is still offered, a direct date edit is refused with 409, the impact preview still computes,
  and the dates do not move.
- **Self-created standalone task, through the deployed UI.** The new panel replaces the stage and
  date-change panels; the dates are edited with a reason; after a refresh the history persists; the
  server-side dates, originals, source and trail are correct; and nobody is notified.
- **Agreement-born standalone task.** The counterparty comes from the agreement; the commissioner
  gets 403 on editing and the outsider gets 404 on reading; a delay is recorded through the UI and
  persists after a refresh; the agreement message is unchanged; the commissioner receives exactly
  one notice and sees the new due date in commissioned work; the performer and the outsider get
  nothing; and following the notice leads somewhere the commissioner can see (blocker 1).
- **Nothing unrelated moved.** Every pre-existing QA-03 task and every commissioned task keeps its
  dates, and the pending proposal keeps its status.
- **Frontend health.** No uncaught page errors, no application console errors, and no unexpected
  failed API calls. With blocker 2 unfixed, the handoff 404 will fail this check.

**What it does not prove:** email delivery (QA accounts have none); behaviour for accounts outside
the QA set; the deploy race (blocker 4), which exists only during the deploy itself.

**Logs** (outside git, mode 600): `~/.blokta-qa/verification/standalone-dates/<run id>/`, containing
`run.log`, `http.jsonl` (every API call: status, timing, sanitized bodies), `browser.jsonl` (console
errors, page errors, failed calls), `screens/*.png`, and `summary.json` (counts, fixture ids, the UTC
window). Passwords, tokens and email addresses are never written; logins are recorded as
`[auth body redacted]` and emails are masked.

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

## Rehearsal evidence

Logs, screenshots and the rehearsal manifest are in
`~/.blokta-qa/verification/standalone-dates/rehearsal-*`.
