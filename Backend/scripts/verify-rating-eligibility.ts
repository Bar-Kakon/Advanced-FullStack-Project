/**
 * Rating eligibility: what counts as evidence that two people completed real work together.
 *
 * Every fixture is a real account, a real project, a real membership and a real task, driven over
 * the real API. The rule under test is evidence-based, not directory-based — Browse presence and
 * bare project membership must both fail, and a completed shared piece of project work must pass,
 * including when the party who did it is a supplier fulfilling a delivery commitment.
 */
import { Types } from 'mongoose';

import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { RatingModel } from '../src/features/ratings/rating.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import {
  conflictsWithParticipation,
  isContextSuperseded,
} from '../src/features/ratings/rating.model.js';
import { workEvidenceAdapter } from '../src/features/tasks/workEvidence.adapter.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = `rateelig-${Date.now()}`;
const PASSWORD = 'CorrectHorse42!';

const day = (offset: number): Date => {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  return new Date(base.getTime() + offset * 86400000);
};
const iso = (offset: number): string => day(offset).toISOString().slice(0, 10);
const isoOnWeekday = (from: number, utcDay: number): string => {
  for (let i = from; i < from + 14; i += 1) if (day(i).getUTCDay() === utcDay) return iso(i);
  throw new Error('no such weekday');
};

interface Account { readonly id: string; readonly token: string }

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;

  const register = async (name: string, over: Record<string, unknown> = {}): Promise<Account> => {
    const email = `${MARKER}-${name}@example.com`.toLowerCase();
    const created = await request(baseUrl, 'POST', '/api/auth/register', {
      json: {
        firstName: name, lastName: 'Rate', standing: 'owner',
        companyName: `${MARKER} ${name} Ltd`, email,
        password: PASSWORD, confirmPassword: PASSWORD,
        registrationCategory: 'contractor', specialty: 'electrical',
        city: 'חיפה', region: 'haifa', availability: 'open',
        acceptedTerms: true, operationalEmail: true, ...over,
      },
    });
    if (created.status !== 201) throw new Error(`${name}: ${JSON.stringify(created.body)}`);

    const signedIn = await request(baseUrl, 'POST', '/api/auth/login', {
      json: { email, password: PASSWORD },
    });
    const user = signedIn.body['user'] as { id: string };
    return { id: user.id, token: signedIn.body['accessToken'] as string };
  };

  const gc = await register('Gc');
  const worker = await register('Worker');
  const delegate = await register('Deleg');
  const supplier = await register('Sup', {
    registrationCategory: 'supplier', specialty: 'concrete_plant',
  });
  const bystander = await register('Bystand');
  const stranger = await register('Strange');

  const project = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: `${MARKER} site`, startDate: iso(0), targetEndDate: iso(120),
      overrunAllowanceDays: 20, projectType: 'building', size: 'בניין 6 קומות',
    },
  });
  const projectId = (project.body as { project: { id: string } }).project.id;

  const join = async (who: Account, projectRole: string): Promise<void> => {
    const invited = await request(baseUrl, 'POST', `/api/projects/${projectId}/members`, {
      token: gc.token,
      json: { userId: who.id, projectRole, permissions: [] },
    });
    const member = invited.body['member'] as { id: string };
    await request(baseUrl, 'POST', `/api/project-invitations/${member.id}/accept`, { token: who.token });
  };

  await join(worker, 'subcontractor');
  await join(delegate, 'subcontractor');
  await join(supplier, 'supplier');
  await join(bystander, 'professional');

  const stage = await ProjectStageModel.create({
    project: new Types.ObjectId(projectId), name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });

  const makeTask = async (assignee: Account, title: string): Promise<string> => {
    const created = await request(baseUrl, 'POST', '/api/tasks', {
      token: gc.token,
      json: {
        kind: 'project', projectId, stageId: stage._id.toString(),
        assigneeId: assignee.id, title,
        startDate: isoOnWeekday(3, 1), dueDate: isoOnWeekday(20, 2),
      },
    });
    if (created.status !== 201) throw new Error(`task ${title}: ${JSON.stringify(created.body)}`);
    return (created.body as { task: { id: string } }).task.id;
  };

  const workerTask = await makeTask(worker, 'יציקת עמודים');
  const supplierTask = await makeTask(supplier, 'אספקת בטון ליציקה');
  const openTask = await makeTask(worker, 'עבודה שטרם הושלמה');
  const delegatedTask = await makeTask(worker, 'עבודה שהואצלה');

  const rate = (from: Account, rateeUserId: string, workId: string) =>
    request(baseUrl, 'POST', '/api/ratings', {
      token: from.token,
      json: { rateeUserId, workId, score: 5 },
    });

  section('1. Self-rating is refused, whatever the evidence says');
  const self = await rate(gc, gc.id, workerTask);
  check(self.body['code'] === 'CANNOT_RATE_SELF', 'rating yourself is refused',
    `${self.status} ${String(self.body['code'])}`);

  section('2. Discoverability is never evidence');
  const browseOnly = await rate(gc, stranger.id, workerTask);
  check(browseOnly.body['code'] === 'RATING_NOT_ELIGIBLE',
    'somebody found only through Browse cannot be rated',
    `${browseOnly.status} ${String(browseOnly.body['code'])}`);
  const found = await request(baseUrl, 'GET', `/api/browse/contractors?q=Strange&limit=5`, {
    token: gc.token,
  });
  const rows = (found.body['contractors'] ?? []) as { userId: string }[];
  check(rows.some((row) => row.userId === stranger.id),
    'even though Browse does return them', rows.length);

  section('3. Bare project membership is not evidence');
  const memberOnly = await rate(gc, bystander.id, workerTask);
  check(memberOnly.body['code'] === 'RATING_NOT_ELIGIBLE',
    'a fellow member with no completed shared work cannot be rated',
    `${memberOnly.status} ${String(memberOnly.body['code'])}`);
  const membership = await ProjectMembershipModel.findOne({
    project: new Types.ObjectId(projectId), user: new Types.ObjectId(bystander.id),
  }).lean();
  check(membership?.status === 'active', 'even though the membership is genuinely active',
    membership?.status);

  section('4. An open shared task is not yet evidence');
  const stillOpen = await rate(gc, worker.id, openTask);
  check(stillOpen.body['code'] === 'RATING_NOT_ELIGIBLE',
    'work that is not finished proves nothing yet',
    `${stillOpen.status} ${String(stillOpen.body['code'])}`);

  section('5. Completed shared project work is evidence');
  await request(baseUrl, 'POST', `/api/tasks/${workerTask}/start`, { token: worker.token });
  await request(baseUrl, 'POST', `/api/tasks/${workerTask}/complete`, { token: worker.token });
  const completedWorker = await TaskModel.findById(new Types.ObjectId(workerTask)).lean();
  check(completedWorker?.completedAt != null, 'the task really is completed',
    String(completedWorker?.completedAt));

  const rated = await rate(gc, worker.id, workerTask);
  check(rated.status === 201 || rated.status === 204,
    'the counterparty may now rate the responsible party', rated.status);
  check((await RatingModel.countDocuments({ ratee: new Types.ObjectId(worker.id) })) === 1,
    'and the rating was written');

  const back = await rate(worker, gc.id, workerTask);
  check(back.status === 201 || back.status === 204,
    'and the responsible party may rate the counterparty back', back.status);

  const twice = await rate(gc, worker.id, workerTask);
  check(twice.body['code'] === 'ALREADY_RATED',
    'one rating per shared completed work relationship still holds',
    `${twice.status} ${String(twice.body['code'])}`);

  section('6. A supplier delivery commitment is the same evidence');
  await request(baseUrl, 'POST', `/api/tasks/${supplierTask}/start`, { token: supplier.token });
  await request(baseUrl, 'POST', `/api/tasks/${supplierTask}/complete`, { token: supplier.token });
  const ratedSupplier = await rate(gc, supplier.id, supplierTask);
  check(ratedSupplier.status === 201 || ratedSupplier.status === 204,
    'a supplier who fulfilled a delivery commitment is rateable', ratedSupplier.status);
  check((await RatingModel.countDocuments({ ratee: new Types.ObjectId(supplier.id) })) === 1,
    'and it went through the ordinary ratings model, with no supplier-specific path');

  const stored = await TaskModel.findById(new Types.ObjectId(supplierTask)).lean();
  const commercial = ['price', 'amount', 'currency', 'paymentTerms', 'invoice', 'total', 'cost'];
  const present = commercial.filter((key) => key in (stored ?? {}));
  check(present.length === 0, 'the delivery commitment carries no commercial field', present.join(','));

  section('7. Unrelated people are not eligible in either direction');
  const unrelated = await rate(stranger, supplier.id, supplierTask);
  check(unrelated.body['code'] === 'RATING_NOT_ELIGIBLE',
    'a third party cannot rate on somebody else\'s completed work',
    `${unrelated.status} ${String(unrelated.body['code'])}`);
  const bystanderOnTask = await rate(bystander, worker.id, workerTask);
  check(bystanderOnTask.body['code'] === 'RATING_NOT_ELIGIBLE',
    'nor can a member who was not a party to that work',
    `${bystanderOnTask.status} ${String(bystanderOnTask.body['code'])}`);

  section('8. The public profile reports eligibility rather than assuming it away');
  const eligibleProfile = await request(baseUrl, 'GET', `/api/browse/contractors/${supplier.id}`, {
    token: gc.token,
  });
  const eligible = (eligibleProfile.body['profile'] ?? eligibleProfile.body) as {
    rateable: { canRate: boolean; reason: string };
  };
  check(eligible.rateable.reason === 'eligible',
    'a viewer with completed shared work is told they may rate', eligible.rateable.reason);

  const strangerProfile = await request(baseUrl, 'GET', `/api/browse/contractors/${stranger.id}`, {
    token: gc.token,
  });
  const notEligible = (strangerProfile.body['profile'] ?? strangerProfile.body) as {
    rateable: { canRate: boolean; reason: string };
  };
  check(notEligible.rateable.canRate === false && notEligible.rateable.reason === 'no_shared_completed_work',
    'and a viewer without it is told what is missing, not which kind of record proves it',
    `${notEligible.rateable.canRate} ${notEligible.rateable.reason}`);

  section('9. The stored context names the work, not just a task id');
  const written = await RatingModel.findOne({
    rater: new Types.ObjectId(gc.id), ratee: new Types.ObjectId(supplier.id),
  }).lean();
  check(written?.context?.kind === 'project_task', 'the rating records which context proved it',
    written?.context?.kind);
  check(String(written?.context?.project) === projectId,
    'and the project the work sat in', String(written?.context?.project));
  check(String(written?.context?.task) === supplierTask, 'and the task itself',
    String(written?.context?.task));
  check(!('task' in (written ?? {})), 'the flat task field is gone from the model',
    Object.keys(written ?? {}).join(','));

  section('10. Delegation stays confidential, and the delegator keeps the relationship');
  const delegated = await request(baseUrl, 'POST', `/api/tasks/${delegatedTask}/delegation`, {
    token: worker.token,
    json: { userId: delegate.id, scope: 'whole' },
  });
  check(delegated.status === 201, 'the responsible party may delegate the work', delegated.status);
  // The delegate performs; the delegator stays the responsible party on the task.
  const started = await request(baseUrl, 'POST', `/api/tasks/${delegatedTask}/start`, { token: delegate.token });
  const finished = await request(baseUrl, 'POST', `/api/tasks/${delegatedTask}/complete`, { token: delegate.token });
  check(finished.status === 200, 'the delegate performs and completes it',
    `${started.status}/${finished.status}`);

  const ratedDelegator = await rate(gc, worker.id, delegatedTask);
  check(ratedDelegator.status === 201,
    'the delegator is still the party the counterparty rates',
    `${ratedDelegator.status} ${JSON.stringify(ratedDelegator.body)}`);

  const ratedDelegate = await rate(gc, delegate.id, delegatedTask);
  check(ratedDelegate.body['code'] === 'RATING_NOT_ELIGIBLE',
    'and the confidential delegate is never exposed as the counterparty',
    `${ratedDelegate.status} ${String(ratedDelegate.body['code'])}`);
  check((await RatingModel.countDocuments({ ratee: new Types.ObjectId(delegate.id) })) === 0,
    'so nothing is written about them from that work');

    section('11. One real piece of work is one rating opportunity');
  const secondTask = await makeTask(worker, 'עבודה שנייה באותו פרויקט');
  await request(baseUrl, 'POST', `/api/tasks/${secondTask}/start`, { token: worker.token });
  await request(baseUrl, 'POST', `/api/tasks/${secondTask}/complete`, { token: worker.token });
  const secondRating = await rate(gc, worker.id, secondTask);
  check(secondRating.status === 201,
    'a genuinely different completed task is a separate opportunity',
    `${secondRating.status} ${JSON.stringify(secondRating.body)}`);
  const repeatSecond = await rate(gc, worker.id, secondTask);
  check(repeatSecond.body['code'] === 'ALREADY_RATED',
    'but the same task cannot be rated twice',
    `${repeatSecond.status} ${String(repeatSecond.body['code'])}`);

  // The pair really did complete work in this project, which is what closes the participation path.
  check(await workEvidenceAdapter.hasCompletedTaskWorkIn(gc.id, worker.id, projectId),
    'the adapter can tell that a completed Task already represents work between the pair');
  check(!(await workEvidenceAdapter.hasCompletedTaskWorkIn(gc.id, stranger.id, projectId)),
    'and says so honestly when it does not');

  const taskContext = { kind: 'project_task' as const, project: new Types.ObjectId(projectId) };
  const participationContext = { kind: 'project_participation' as const, project: new Types.ObjectId(projectId) };
  check(isContextSuperseded(participationContext, true),
    'Task-first: a participation rating is refused where a completed Task already covers the work');
  check(!isContextSuperseded(participationContext, false),
    'and permitted where no Task represents it');
  check(!isContextSuperseded(taskContext, true), 'a Task rating is never superseded by its own kind');
  check(conflictsWithParticipation(taskContext, true),
    'and the reverse is closed too — no Task rating on top of a participation rating');
  check(!conflictsWithParticipation(taskContext, false), 'with nothing to conflict with, it proceeds');
  check(!conflictsWithParticipation(participationContext, true),
    'the participation path is governed by the Task rule, not by itself');

    const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  await RatingModel.deleteMany({ $or: [{ rater: { $in: users } }, { ratee: { $in: users } }] });
  await TaskModel.deleteMany({ project: new Types.ObjectId(projectId) });
  await ProjectStageModel.deleteMany({ project: new Types.ObjectId(projectId) });
  await ProjectMembershipModel.deleteMany({ project: new Types.ObjectId(projectId) });
  await ProjectModel.deleteMany({ _id: new Types.ObjectId(projectId) });
  await CompanyMembershipModel.deleteMany({ user: { $in: users } });
  await CompanyModel.deleteMany({ name: { $regex: `^${MARKER}` } });
  await UserModel.deleteMany({ _id: { $in: users } });

  await finish(harness);
};

void run();
