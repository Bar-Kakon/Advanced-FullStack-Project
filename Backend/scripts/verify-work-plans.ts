/**
 * Versioned work plans, driven over real HTTP against the real GridFS boundary.
 *
 * The two things it is really here to prove: a version never overwrites the one before it, and a
 * confidential delegate cannot be discovered by the party above through anything a work plan
 * carries — not an id, not a name, not a filename, not an upload time, not the version history.
 */
import { Types } from 'mongoose';

import { FileAssetModel } from '../src/features/files/fileAsset.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-work-plans';
const iso = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A real, minimal PDF. The MIME type is what the filter reads, but the bytes are genuine. */
const pdfBytes = (label: string): Buffer =>
  Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');

interface PlanDto {
  id: string;
  planId: string;
  version: number;
  isCurrent: boolean;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  visibility: 'shared' | 'private';
  uploadedByName: string | null;
}

/** Every version of one plan as `version:storedFileId`. */
const groupFingerprint = async (planId: string): Promise<string> => {
  const rows = await FileAssetModel.find({ versionGroup: new Types.ObjectId(planId) })
    .sort({ version: 1 })
    .lean<{ version?: number; storage: { fileId: Types.ObjectId } }[]>()
    .exec();
  return rows.map((row) => `${String(row.version)}:${row.storage.fileId.toString()}`).join('|');
};

const form = (bytes: Buffer, filename: string, mimeType: string, visibility?: string): FormData => {
  const body = new FormData();
  body.append('plan', new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  if (visibility !== undefined) body.append('visibility', visibility);
  return body;
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await FileAssetModel.deleteMany({ 'scope.type': { $in: ['task', 'project'] } }).exec();

  const post = (path: string, token: string, body: FormData) =>
    request(baseUrl, 'POST', path, { token, form: body });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const sub = await createAccount(baseUrl, MARKER, 2);
  const delegate = await createAccount(baseUrl, MARKER, 3);
  const bystander = await createAccount(baseUrl, MARKER, 4);
  const outsider = await createAccount(baseUrl, MARKER, 5);

  const created = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: 'אתר תוכניות העבודה', startDate: iso(0), targetEndDate: iso(120),
      overrunAllowanceDays: 20, projectType: 'building', size: 'בניין 5 קומות',
    },
  });
  const projectId = (created.body as { project: { id: string } }).project.id;

  const join = async (who: { userId: Types.ObjectId; token: string }) => {
    await request(baseUrl, 'POST', `/api/projects/${projectId}/members`, {
      token: gc.token,
      json: { userId: who.userId.toString(), projectRole: 'subcontractor' },
    });
    const row = await ProjectMembershipModel.findOne({ project: projectId, user: who.userId }).lean().exec();
    await request(baseUrl, 'POST', `/api/project-invitations/${row?._id.toString()}/accept`, { token: who.token });
  };
  await join(sub);
  await join(bystander);

  // A separate project, so "another project cannot read it" is asked of a real second project.
  const other = await request(baseUrl, 'POST', '/api/projects', {
    token: outsider.token,
    json: {
      name: 'אתר אחר', startDate: iso(0), targetEndDate: iso(90),
      overrunAllowanceDays: 10, projectType: 'building', size: 'בניין 3 קומות',
    },
  });
  const otherProjectId = (other.body as { project: { id: string } }).project.id;

  const stage = await ProjectStageModel.create({ project: projectId, name: 'שלד', order: 0, isGate: false, dependsOn: [] });
  const task = await TaskModel.create({
    kind: 'project', project: new Types.ObjectId(projectId), stage: stage._id,
    company: gc.companyId, createdBy: gc.userId, assignee: sub.userId,
    title: 'יציקת יסודות', startDate: new Date(iso(1)), dueDate: new Date(iso(9)),
    ownCrewOnly: false, delegatorOnSiteRequired: false,
  });
  const taskId = task._id.toString();

  section('1. A PDF is accepted, and nothing else is');
  const uploaded = await post(`/api/work-plans/task/${taskId}`, sub.token, form(pdfBytes('v1'), 'plan-v1.pdf', 'application/pdf', 'shared'));
  check(uploaded.status === 201, 'a PDF from the responsible party is accepted', uploaded.status);
  const v1 = (uploaded.body as { plan: PlanDto }).plan;
  check(v1.version === 1 && v1.isCurrent, 'it lands as version 1 and is current', `v${v1.version} current=${v1.isCurrent}`);

  const png = await post(`/api/work-plans/task/${taskId}`, sub.token, form(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'x.png', 'image/png', 'shared'));
  check(png.status === 400 && png.body['code'] === 'UNSUPPORTED_FILE_TYPE',
    'an image is refused on the work-plan route', `${png.status} ${String(png.body['code'])}`);

  const tooBig = await post(`/api/work-plans/task/${taskId}`, sub.token,
    form(Buffer.alloc(31 * 1024 * 1024, 0x25), 'huge.pdf', 'application/pdf', 'shared'));
  check(tooBig.status === 413 && tooBig.body['code'] === 'FILE_TOO_LARGE',
    'a file past the 30 MB limit is refused', `${tooBig.status} ${String(tooBig.body['code'])}`);
  check((await FileAssetModel.countDocuments({ 'scope.id': task._id })) === 1,
    'and neither rejected upload left a row behind');

  section('2. A new version preserves the one before it');
  const second = await post(`/api/work-plans/${v1.planId}/versions`, sub.token, form(pdfBytes('v2'), 'plan-v2.pdf', 'application/pdf'));
  check(second.status === 201, 'a second version is accepted', second.status);
  const v2 = (second.body as { plan: PlanDto }).plan;
  check(v2.version === 2 && v2.planId === v1.planId, 'it is version 2 of the same plan', `v${v2.version}`);

  const history = await get(`/api/work-plans/${v1.planId}/versions`, sub.token);
  const versions = (history.body as { versions: PlanDto[] }).versions;
  check(versions.length === 2, 'both versions are still there', `${versions.length}`);
  check(versions.filter((row) => row.isCurrent).length === 1, 'exactly one is current');
  check(versions.find((row) => row.isCurrent)?.version === 2, 'and it is the newest');
  check(versions.find((row) => row.version === 1)?.filename === 'plan-v1.pdf',
    'version 1 kept its own file, so nothing was overwritten');
  const v1Bytes = await get(`/api/work-plans/assets/${v1.id}/content`, sub.token);
  check(v1Bytes.status === 200, 'and version 1 can still be downloaded', v1Bytes.status);

  section('3. Marking an older version current is a rollback, not a delete');
  const beforeRoll = await groupFingerprint(v1.planId);
  const rolled = await request(baseUrl, 'POST', `/api/work-plans/${v1.planId}/current`, {
    token: sub.token, json: { version: 1 },
  });
  check(rolled.status === 200, 'the responsible party may mark a version current', rolled.status);
  const afterRoll = (rolled.body as { versions: PlanDto[] }).versions;
  check(afterRoll.filter((row) => row.isCurrent).length === 1, 'still exactly one current version');
  check(afterRoll.find((row) => row.isCurrent)?.version === 1, 'and it is the one asked for');
  check(afterRoll.length === 2, 'version 2 was not deleted by the rollback');
  const v2Bytes = await get(`/api/work-plans/assets/${v2.id}/content`, sub.token);
  check(v2Bytes.status === 200, 'and version 2 is still downloadable after being superseded', v2Bytes.status);
  check((await groupFingerprint(v1.planId)) === beforeRoll,
    'the marker moved and nothing else: no new document, no second copy of the bytes');
  await request(baseUrl, 'POST', `/api/work-plans/${v1.planId}/current`, { token: sub.token, json: { version: 2 } });

  section('4. Reach is decided by the project, not by knowing an id');
  const bystanderRead = await get(`/api/work-plans/task/${taskId}`, bystander.token);
  check(bystanderRead.status === 200, 'a project member may list the shared plans', bystanderRead.status);
  const outsiderList = await get(`/api/work-plans/task/${taskId}`, outsider.token);
  check(outsiderList.status === 404 && outsiderList.body['code'] === 'WORK_PLAN_NOT_FOUND',
    'somebody on another project gets the same answer as a missing plan',
    `${outsiderList.status} ${String(outsiderList.body['code'])}`);
  const outsiderBytes = await get(`/api/work-plans/assets/${v1.id}/content`, outsider.token);
  check(outsiderBytes.status === 404, 'and cannot fetch the bytes with a valid id either', outsiderBytes.status);
  const outsiderWrite = await post(`/api/work-plans/task/${taskId}`, outsider.token, form(pdfBytes('x'), 'x.pdf', 'application/pdf', 'shared'));
  check(outsiderWrite.status === 404, 'nor upload against a task they cannot reach', outsiderWrite.status);

  const bystanderWrite = await post(`/api/work-plans/task/${taskId}`, bystander.token, form(pdfBytes('x'), 'x.pdf', 'application/pdf', 'shared'));
  check(bystanderWrite.status === 403 && bystanderWrite.body['code'] === 'WORK_PLAN_NOT_PERMITTED',
    'a member who is neither a party nor a grant holder may read but not write',
    `${bystanderWrite.status} ${String(bystanderWrite.body['code'])}`);

  section('5. Project-scoped plans follow the project grant');
  const gcProjectPlan = await post(`/api/work-plans/project/${projectId}`, gc.token, form(pdfBytes('site'), 'site-plan.pdf', 'application/pdf', 'shared'));
  check(gcProjectPlan.status === 201, 'the grant holder may put a plan on the project itself', gcProjectPlan.status);
  const subProjectPlan = await post(`/api/work-plans/project/${projectId}`, sub.token, form(pdfBytes('nope'), 'nope.pdf', 'application/pdf', 'shared'));
  check(subProjectPlan.status === 403,
    'a member without the grant may not, even though they may upload on their own task', subProjectPlan.status);
  const crossProject = await post(`/api/work-plans/project/${otherProjectId}`, gc.token, form(pdfBytes('x'), 'x.pdf', 'application/pdf', 'shared'));
  check(crossProject.status === 404, 'and a grant on one project reaches no other project', crossProject.status);

  section('6. The delegation wall — the delegate is never discoverable from above');
  await TaskModel.updateOne({ _id: task._id }, {
    $set: { delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() } },
  }).exec();

  const delegateShared = await post(`/api/work-plans/task/${taskId}`, delegate.token, form(pdfBytes('d'), 'delegate.pdf', 'application/pdf', 'shared'));
  check(delegateShared.status === 403 && delegateShared.body['code'] === 'WORK_PLAN_VISIBILITY_NOT_PERMITTED',
    'a delegate cannot publish where the party above would read it',
    `${delegateShared.status} ${String(delegateShared.body['code'])}`);

  const delegatePrivate = await post(`/api/work-plans/task/${taskId}`, delegate.token, form(pdfBytes('dp'), 'delegate-private.pdf', 'application/pdf', 'private'));
  check(delegatePrivate.status === 201, 'but may exchange a private plan with the delegator', delegatePrivate.status);
  const priv = (delegatePrivate.body as { plan: PlanDto }).plan;

  const gcList = await get(`/api/work-plans/task/${taskId}`, gc.token);
  const gcPlans = (gcList.body as { plans: PlanDto[] }).plans;
  check(gcPlans.every((row) => row.visibility === 'shared'),
    'the private plan is absent from the party above listing', gcPlans.map((r) => r.visibility).join(','));
  check(!gcPlans.some((row) => row.id === priv.id), 'by id, not merely by count');
  const gcBytes = await get(`/api/work-plans/assets/${priv.id}/content`, gc.token);
  check(gcBytes.status === 404, 'and the bytes are refused even with the exact asset id', gcBytes.status);
  const gcHistory = await get(`/api/work-plans/${priv.planId}/versions`, gc.token);
  check(gcHistory.status === 404, 'the private version history is invisible too', gcHistory.status);

  const serialised = JSON.stringify(gcList.body);
  const delegateName = `Verify Account3`;
  check(!serialised.includes(delegate.userId.toString()),
    'no delegate id appears anywhere in what the party above receives');
  check(!serialised.includes(delegateName), 'no delegate name appears either');
  check(!serialised.includes('delegate'), 'and no delegate-derived filename leaks through metadata');

  section('7. A delegate sees their own slice, and no more');
  const delegateList = await get(`/api/work-plans/task/${taskId}`, delegate.token);
  check(delegateList.status === 200, 'the delegate may list the plans on their task', delegateList.status);
  const delegatePlans = (delegateList.body as { plans: PlanDto[] }).plans;
  check(delegatePlans.some((row) => row.id === priv.id), 'their private exchange is there');
  check(delegatePlans.some((row) => row.visibility === 'shared'),
    'and so is the shared plan they need to do the work');
  const delegateOnProject = await get(`/api/work-plans/project/${projectId}`, delegate.token);
  check(delegateOnProject.status === 404,
    'but the project-level plans are not theirs to see — the wall is not only about the task',
    delegateOnProject.status);

  section('8. Attribution names the responsible party, never the delegate');
  await FileAssetModel.updateOne({ _id: new Types.ObjectId(priv.id) }, { $set: { visibility: 'shared' } }).exec();
  const forced = await get(`/api/work-plans/task/${taskId}`, gc.token);
  const forcedRow = (forced.body as { plans: PlanDto[] }).plans.find((row) => row.id === priv.id);
  check(forcedRow !== undefined, 'the row is now visible to the party above', String(forcedRow?.id));
  check(forcedRow?.uploadedByName !== delegateName,
    'and even then it is not attributed to the delegate', String(forcedRow?.uploadedByName));
  check(forcedRow?.uploadedByName === 'Verify Account2',
    'it is attributed to the delegator, who stays responsible', String(forcedRow?.uploadedByName));
  await FileAssetModel.updateOne({ _id: new Types.ObjectId(priv.id) }, { $set: { visibility: 'private' } }).exec();

  section('9. No owner id or storage id ever reaches a client');
  const shape = JSON.stringify((await get(`/api/work-plans/task/${taskId}`, sub.token)).body);
  for (const forbidden of ['owner', 'storage', 'fileId', 'gridfs', 'versionGroup', '__v']) {
    check(!shape.includes(forbidden), `the payload carries no ${forbidden}`);
  }

  section('10. The existing image uploads are untouched');
  const avatar = new FormData();
  avatar.append('avatar', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'a.png');
  const avatarUp = await request(baseUrl, 'PUT', '/api/users/me/avatar', { token: sub.token, form: avatar });
  check(avatarUp.status === 200 || avatarUp.status === 201,
    'an avatar still uploads through the image route', avatarUp.status);
  const avatarPdf = new FormData();
  avatarPdf.append('avatar', new Blob([new Uint8Array(pdfBytes('x'))], { type: 'application/pdf' }), 'a.pdf');
  const avatarRejected = await request(baseUrl, 'PUT', '/api/users/me/avatar', { token: sub.token, form: avatarPdf });
  check(avatarRejected.status === 400,
    'and the image route still refuses a PDF — the allow-lists did not merge', avatarRejected.status);

  const entry = new FormData();
  entry.append('title', 'ריצוף');
  entry.append('meta', '2026');
  entry.append('image', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'w.png');
  const entryUp = await request(baseUrl, 'POST', '/api/users/me/work-entries', { token: sub.token, form: entry });
  check(entryUp.status === 201, 'a Completed Work entry still uploads its image', entryUp.status);

  section('11. No route deletes a plan or a version');
  const beforeDeletes = await groupFingerprint(v1.planId);
  const deletable: readonly [string, string][] = [
    [`/api/work-plans/${v1.planId}`, 'a plan'],
    [`/api/work-plans/${v1.planId}/versions`, 'a version list'],
    [`/api/work-plans/${v1.planId}/versions/1`, 'a single version'],
    [`/api/work-plans/${v1.planId}/current`, 'the current marker'],
    [`/api/work-plans/assets/${v1.id}`, 'an asset'],
    [`/api/work-plans/assets/${v1.id}/content`, 'the stored bytes'],
    [`/api/work-plans/task/${taskId}`, 'a whole task scope'],
  ];
  for (const [path, what] of deletable) {
    const attempt = await request(baseUrl, 'DELETE', path, { token: sub.token });
    check(attempt.status === 404, `no route deletes ${what}`, `${attempt.status}`);
  }
  check((await groupFingerprint(v1.planId)) === beforeDeletes,
    'and the history is exactly what it was before the attempts');

  section('12. Project-scoped plans version and roll back too');
  const sitePlan = (gcProjectPlan.body as { plan: PlanDto }).plan;
  const siteV2 = await post(`/api/work-plans/${sitePlan.planId}/versions`, gc.token,
    form(pdfBytes('site2'), 'site-plan-b.pdf', 'application/pdf'));
  check(siteV2.status === 201, 'a project-scoped plan takes a second version', siteV2.status);
  const siteRolled = await request(baseUrl, 'POST', `/api/work-plans/${sitePlan.planId}/current`, {
    token: gc.token, json: { version: 1 },
  });
  const siteVersions = (siteRolled.body as { versions: PlanDto[] }).versions;
  check(siteVersions.length === 2, 'and rolls back without losing the newer one', `${siteVersions.length}`);
  check(siteVersions.filter((row) => row.isCurrent).length === 1,
    'exactly one project-scoped version is current');
  await request(baseUrl, 'POST', `/api/work-plans/${sitePlan.planId}/current`, { token: gc.token, json: { version: 2 } });

  const projectPrivate = await post(`/api/work-plans/project/${projectId}`, gc.token,
    form(pdfBytes('p'), 'p.pdf', 'application/pdf', 'private'));
  check(projectPrivate.status === 403 && projectPrivate.body['code'] === 'WORK_PLAN_VISIBILITY_NOT_PERMITTED',
    'a project scope has no private channel, because it has no delegation to keep',
    `${projectPrivate.status} ${String(projectPrivate.body['code'])}`);

  section('13. Full Authority and an explicit grant both carry workplan.manage');
  const gcMembership = await ProjectMembershipModel.findOne({ project: projectId, user: gc.userId }).lean().exec();
  check(gcMembership?.fullAuthority === true,
    'the project creator holds Full Authority', String(gcMembership?.fullAuthority));
  check(!(gcMembership?.permissions ?? []).includes('workplan.manage'),
    'and holds no explicit workplan.manage code, so Full Authority is what carried the upload above');

  await ProjectMembershipModel.updateOne({ project: projectId, user: bystander.userId },
    { $set: { permissions: ['workplan.manage'] } }).exec();
  const granted = await post(`/api/work-plans/project/${projectId}`, bystander.token,
    form(pdfBytes('granted'), 'granted.pdf', 'application/pdf', 'shared'));
  check(granted.status === 201, 'the explicit grant alone is enough to manage plans', granted.status);
  const grantedElsewhere = await post(`/api/work-plans/project/${otherProjectId}`, bystander.token,
    form(pdfBytes('x'), 'x.pdf', 'application/pdf', 'shared'));
  check(grantedElsewhere.status === 404, 'and it reaches no other project', grantedElsewhere.status);
  await ProjectMembershipModel.updateOne({ project: projectId, user: bystander.userId },
    { $set: { permissions: [] } }).exec();

  section('14. Project-facing publication is the delegator own act');
  const delegateOnShared = await post(`/api/work-plans/${v1.planId}/versions`, delegate.token,
    form(pdfBytes('dv'), 'dv.pdf', 'application/pdf'));
  check(delegateOnShared.status === 403 && delegateOnShared.body['code'] === 'WORK_PLAN_VISIBILITY_NOT_PERMITTED',
    'a delegate cannot append to the project-facing history either',
    `${delegateOnShared.status} ${String(delegateOnShared.body['code'])}`);

  const beforePublish = (await get(`/api/work-plans/task/${taskId}`, gc.token)).body as { plans: PlanDto[] };
  check(!beforePublish.plans.some((row) => row.id === priv.id),
    'the private version has still not surfaced upward on its own');

  const published = await post(`/api/work-plans/task/${taskId}`, sub.token,
    form(pdfBytes('final'), 'foundations-final.pdf', 'application/pdf', 'shared'));
  check(published.status === 201, 'the responsible party publishes into the project-facing layer', published.status);
  const publishedPlan = (published.body as { plan: PlanDto }).plan;

  const afterPublish = (await get(`/api/work-plans/task/${taskId}`, gc.token)).body as { plans: PlanDto[] };
  const publishedRow = afterPublish.plans.find((row) => row.id === publishedPlan.id);
  check(publishedRow !== undefined, 'the party above now sees the published plan');
  check(publishedRow?.uploadedByName === 'Verify Account2',
    'attributed to the responsible party the project already knows', String(publishedRow?.uploadedByName));
  check(!afterPublish.plans.some((row) => row.id === priv.id),
    'and the private original was not promoted along with it');
  check(!JSON.stringify(afterPublish).includes(delegate.userId.toString()),
    'nothing in the project-facing answer names the confidential delegate');

  const delegatorView = (await get(`/api/work-plans/task/${taskId}`, sub.token)).body as { plans: PlanDto[] };
  check(delegatorView.plans.find((row) => row.id === priv.id)?.uploadedByName === 'Verify Account3',
    'inside the private channel the record stays real: the delegator sees who actually uploaded',
    String(delegatorView.plans.find((row) => row.id === priv.id)?.uploadedByName));

  section('15. Work-plan bytes answer only to the work-plan rules');
  const ownerRoute = await get(`/api/users/me/assets/${publishedPlan.id}`, sub.token);
  check(ownerRoute.status === 404,
    'even its own uploader cannot fetch it through the owner-scoped profile route', ownerRoute.status);
  const delegateOwnerRoute = await get(`/api/users/me/assets/${priv.id}`, delegate.token);
  check(delegateOwnerRoute.status === 404,
    'and neither can the delegate, so no route bypasses the delegation wall', delegateOwnerRoute.status);

  section('16. The stored indexes are the ones the schema declares');
  const indexes = (await FileAssetModel.collection.indexes()) as readonly {
    key: Record<string, number>;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
  }[];
  const byKey = (key: string) => indexes.find((index) => JSON.stringify(index.key) === key);
  check(byKey('{"scope.type":1,"scope.id":1,"isCurrent":1}') !== undefined,
    'the scope index carries isCurrent, so listing the current plans is one index read');
  check(byKey('{"scope.type":1,"scope.id":1}') === undefined,
    'the retired two-key index was dropped rather than left beside it');
  const versionIndex = byKey('{"versionGroup":1,"version":-1}');
  check(versionIndex?.unique === true,
    'the version index is unique, so two rows cannot claim one version number');
  check(JSON.stringify(versionIndex?.partialFilterExpression) === '{"versionGroup":{"$exists":true}}',
    'and partial, so every avatar row is outside it', JSON.stringify(versionIndex?.partialFilterExpression));

  section('17. Nothing was orphaned in the byte store');
  const taskRows = await FileAssetModel.countDocuments({ 'scope.type': 'task', 'scope.id': task._id });
  const projectRows = await FileAssetModel.countDocuments({ 'scope.type': 'project', 'scope.id': new Types.ObjectId(projectId) });
  check(taskRows === 4, 'the task carries its two versions, the private exchange and the published plan', `${taskRows}`);
  check(projectRows === 3, 'and the project carries the two site-plan versions and the granted upload', `${projectRows}`);
  check((await FileAssetModel.countDocuments({ versionGroup: { $exists: true }, isCurrent: { $ne: true } })) === 2,
    'two superseded versions survive as history, and nothing else was left behind');

  await FileAssetModel.deleteMany({ 'scope.type': { $in: ['task', 'project'] } }).exec();
  await TaskModel.deleteMany({ project: new Types.ObjectId(projectId) }).exec();
  await ProjectStageModel.deleteMany({ project: new Types.ObjectId(projectId) }).exec();
  await ProjectMembershipModel.deleteMany({ project: { $in: [new Types.ObjectId(projectId), new Types.ObjectId(otherProjectId)] } }).exec();
  await ProjectModel.deleteMany({ _id: { $in: [new Types.ObjectId(projectId), new Types.ObjectId(otherProjectId)] } }).exec();
  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
