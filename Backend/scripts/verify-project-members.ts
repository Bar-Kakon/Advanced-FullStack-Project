/**
 * Drives the real Project Members and Project Invitations endpoints over real HTTP.
 *
 * What it proves: membership and authority are two different things, a project another company owns
 * is indistinguishable from one that does not exist, an invitation discloses exactly what the owner
 * approved and nothing else, and a grant on one project buys nothing on any other.
 */
import { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { PermissionTemplateModel } from '../src/features/projectaccess/permissionTemplate.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { effectiveProjectPermissions } from '../src/features/projectaccess/projectPermission.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { BlockModel } from '../src/features/blocks/block.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-project-members';

const day = (offset: number): string =>
  new Date(Date.UTC(2027, 5, 1) + offset * 86_400_000).toISOString().slice(0, 10);

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  companyName: string | null;
  status: string;
  projectRole: string;
  permissions: string[] | null;
  fullAuthority: boolean | null;
  invitedByName: string | null;
  invitedAt: string;
  isViewer: boolean;
}

interface MembersBody {
  projectId: string;
  projectName: string;
  members: MemberRow[];
  invitations: MemberRow[];
  viewer: { canInvite: boolean; canManageMembers: boolean; canGrantPermissions: boolean };
  allPermissions: string[];
  allRoles: string[];
}

interface InvitationRow {
  id: string;
  projectId: string;
  projectName: string;
  projectType: string;
  projectTypeOther: string | null;
  city: string | null;
  startDate: string;
  targetEndDate: string;
  invitedByName: string | null;
  projectRole: string;
  invitedAt: string;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const carol = await createAccount(baseUrl, MARKER, 3);
  const dan = await createAccount(baseUrl, MARKER, 4);

  const template = {
    description: 'שלד וגמר',
    startDate: day(0),
    targetEndDate: day(120),
    overrunAllowanceDays: 20,
    projectType: 'building' as const,
    size: 'בניין 8 קומות',
    location: { city: 'רעננה', region: 'center' as const, address: 'הרצל 8' },
  };

  const newProject = async (token: string, name: string): Promise<string> => {
    const created = await request(baseUrl, 'POST', '/api/projects', {
      token,
      json: { ...template, name },
    });
    return (created.body as { project: { id: string } }).project.id;
  };

  const members = async (token: string, projectId: string) =>
    request(baseUrl, 'GET', `/api/projects/${projectId}/members`, { token });

  const invitationsOf = async (token: string) => {
    const answer = await request(baseUrl, 'GET', '/api/project-invitations', { token });
    return (answer.body as unknown as { invitations: InvitationRow[] }).invitations;
  };

  const p1 = await newProject(alice.token, 'אתר הרצל 8');

  section('Authentication');
  for (const [method, path] of [
    ['GET', `/api/projects/${p1}/members`],
    ['POST', `/api/projects/${p1}/members`],
    ['GET', '/api/project-invitations'],
  ] as const) {
    const anon = await request(baseUrl, method, path, { json: method === 'POST' ? {} : undefined });
    check(anon.status === 401, `${method} ${path} without a token is 401`, anon.status);
  }

  section('The member list, and what creating a project puts in it');
  const first = await members(alice.token, p1);
  check(first.status === 200, 'An authorized member reads the list', first.status);
  const list = first.body as unknown as MembersBody;
  check(list.members.length === 1, 'A new project has exactly one member', list.members.length);
  check(list.members[0]?.userId === alice.userId.toString(), 'And it is the creator');
  check(list.members[0]?.fullAuthority === true, 'Who holds Full Project Authority as a ROW');
  check(list.members[0]?.isViewer === true, 'The viewer is marked as themselves');
  check(list.invitations.length === 0, 'And nothing is pending');
  check(list.viewer.canInvite && list.viewer.canManageMembers && list.viewer.canGrantPermissions,
    'The creator may invite, manage and grant');
  check(list.allPermissions.length === 14, 'The permission vocabulary is served', list.allPermissions.length);
  check(
    list.allPermissions.includes('project.stage.manage'),
    'including the sequencing grant, which is its own capability and not part of project.edit',
  );
  check(
    list.allPermissions.includes('workplan.manage'),
    'and the work-plan grant, which the task parties do not need in order to upload on their own task',
  );
  check(
    list.allPermissions.includes('schedule.partial_release.manage'),
    'and partial release, which is its own capability and not schedule.exception.approve',
  );
  check(list.allRoles.includes('subcontractor'), 'And the role vocabulary');

  section('D16 — a project another company owns is not discoverable');
  const strangerList = await members(bob.token, p1);
  check(strangerList.status === 404, 'A stranger reading the member list is 404', strangerList.status);
  const strangerInvite = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: bob.token,
    json: { userId: carol.userId.toString(), projectRole: 'subcontractor' },
  });
  check(strangerInvite.status === 404, 'And inviting into it is the same 404', strangerInvite.status);
  const madeUp = new Types.ObjectId().toString();
  const absent = await members(bob.token, madeUp);
  check(absent.status === 404, 'A project that does not exist answers 404 too', absent.status);
  check(
    JSON.stringify(strangerList.body) === JSON.stringify(absent.body),
    'Byte-identical bodies — the response cannot be used to tell them apart',
  );

  section('Inviting — the row is created as an OFFER, not as a member');
  const invited = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: bob.userId.toString(), projectRole: 'subcontractor' },
  });
  check(invited.status === 201, 'The invitation is accepted', invited.status);
  const bobRow = (invited.body as { member: MemberRow }).member;
  check(bobRow.status === 'invited', 'The row is `invited`, not `active`', bobRow.status);
  check(bobRow.fullAuthority === false, 'Being invited confers no Full Project Authority');
  check(bobRow.permissions?.length === 0, 'And no individual permissions');
  check(bobRow.invitedByName !== null, 'Provenance records who invited them');
  check(bobRow.companyName !== null, 'Company attribution is the invitee’s OWN business', bobRow.companyName);

  const afterInvite = (await members(alice.token, p1)).body as unknown as MembersBody;
  check(afterInvite.members.length === 1, 'The member list has not grown', afterInvite.members.length);
  check(afterInvite.invitations.length === 1, 'The invitation is pending', afterInvite.invitations.length);

  section('An invitation grants no read on the project itself');
  const peek = await request(baseUrl, 'GET', `/api/projects/${p1}`, { token: bob.token });
  check(peek.status === 404, 'The invitee cannot read the project yet', peek.status);
  const peekMembers = await members(bob.token, p1);
  check(peekMembers.status === 404, 'Nor its member list', peekMembers.status);

  section('What the invitation card discloses — the approved set, and nothing else');
  const pending = await invitationsOf(bob.token);
  check(pending.length === 1, 'The invitee sees one pending invitation', pending.length);
  const card = pending[0];
  check(card?.projectName === 'אתר הרצל 8', 'Project name', card?.projectName);
  check(card?.projectType === 'building', 'Project type', card?.projectType);
  check(card?.city === 'רעננה', 'City', card?.city);
  check(card?.startDate === day(0), 'Start date', card?.startDate);
  check(card?.targetEndDate === day(120), 'Target end date', card?.targetEndDate);
  check(card?.invitedByName !== null, 'Who invited them');
  check(card?.projectRole === 'subcontractor', 'And the role being offered');

  const disclosed = Object.keys(card ?? {});
  for (const withheld of ['members', 'size', 'description', 'address', 'region', 'status', 'permissions']) {
    check(!disclosed.includes(withheld), `The card withholds \`${withheld}\``);
  }

  section('Duplicate and invalid invitations');
  const again = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: bob.userId.toString(), projectRole: 'supplier' },
  });
  check(again.status === 409, 'Inviting a pending invitee again is 409', again.status);
  const self = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: alice.userId.toString(), projectRole: 'viewer' },
  });
  check(self.status === 409, 'Inviting yourself is 409', self.status);
  const ghost = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: new Types.ObjectId().toString(), projectRole: 'viewer' },
  });
  check(ghost.status === 404, 'Inviting an account that does not exist is 404', ghost.status);
  const malformed = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: 'not-an-id', projectRole: 'viewer' },
  });
  check(malformed.status === 404, 'A malformed id is the same 404', malformed.status);
  const badRole = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: dan.userId.toString(), projectRole: 'emperor' },
  });
  check(badRole.status === 400, 'A role outside the vocabulary is refused', badRole.status);
  check(
    (await ProjectMembershipModel.countDocuments({ project: p1 }).exec()) === 2,
    'None of the refusals wrote a row',
  );

  section('A block is a wall a project invitation does not go round');
  await request(baseUrl, 'PUT', `/api/blocks/${alice.userId.toString()}`, { token: carol.token });
  const blocked = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: carol.userId.toString(), projectRole: 'professional' },
  });
  check(blocked.status === 409, 'Inviting someone who blocked you is refused', blocked.status);
  await request(baseUrl, 'DELETE', `/api/blocks/${alice.userId.toString()}`, { token: carol.token });

  section('Declining — recorded, kept, and not permanent');
  const declined = await request(baseUrl, 'POST', `/api/project-invitations/${bobRow.id}/decline`, {
    token: bob.token,
  });
  check(declined.status === 204, 'The invitee may decline', declined.status);
  const declinedRow = await ProjectMembershipModel.findById(bobRow.id).lean().exec();
  check(declinedRow?.status === 'declined', 'The row says `declined`, not `removed`', declinedRow?.status);
  check(declinedRow !== null, 'And the row is kept as history');
  check(declinedRow?.respondedAt !== undefined, 'With the moment it was answered');
  check((await invitationsOf(bob.token)).length === 0, 'It leaves the invitee’s pending list');
  const stillHidden = await request(baseUrl, 'GET', `/api/projects/${p1}`, { token: bob.token });
  check(stillHidden.status === 404, 'And still grants no read', stillHidden.status);

  const answeredTwice = await request(baseUrl, 'POST', `/api/project-invitations/${bobRow.id}/accept`, {
    token: bob.token,
  });
  check(answeredTwice.status === 409, 'An answered invitation cannot be answered again', answeredTwice.status);

  section('Re-inviting after a refusal reuses the one row');
  const reinvited = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: bob.userId.toString(), projectRole: 'subcontractor' },
  });
  check(reinvited.status === 201, 'The same person may be invited again', reinvited.status);
  const reRow = (reinvited.body as { member: MemberRow }).member;
  check(reRow.id === bobRow.id, 'It is the same row, not a duplicate', reRow.id);
  check(reRow.status === 'invited', 'Back to `invited`');
  check(
    new Date(reRow.invitedAt).getTime() > new Date(bobRow.invitedAt).getTime(),
    'And the offer is re-dated',
  );
  check(
    (await ProjectMembershipModel.countDocuments({ project: p1, user: bob.userId }).exec()) === 1,
    'The unique index still holds — one row per person per project',
  );

  section('An invitation belongs to the person it names');
  const notMine = await request(baseUrl, 'POST', `/api/project-invitations/${reRow.id}/accept`, {
    token: carol.token,
  });
  check(notMine.status === 404, 'Somebody else cannot accept it', notMine.status);
  const stillOpen = await ProjectMembershipModel.findById(reRow.id).lean().exec();
  check(stillOpen?.status === 'invited', 'And the refusal changed nothing');

  section('Accepting');
  const accepted = await request(baseUrl, 'POST', `/api/project-invitations/${reRow.id}/accept`, {
    token: bob.token,
  });
  check(accepted.status === 204, 'The invitee accepts', accepted.status);
  const reads = await request(baseUrl, 'GET', `/api/projects/${p1}`, { token: bob.token });
  check(reads.status === 200, 'Now the project is readable', reads.status);
  check(
    (reads.body as { project: { viewerManages: boolean } }).project.viewerManages === false,
    'But accepting granted no management authority',
  );
  const memberEdit = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: bob.token,
    json: { name: 'nope' },
  });
  check(memberEdit.status === 403, 'Editing is refused', memberEdit.status);

  section('A member sees the list, but not authority they may not administer');
  const bobSees = await members(bob.token, p1);
  check(bobSees.status === 200, 'A member reads the member list', bobSees.status);
  const bobView = bobSees.body as unknown as MembersBody;
  check(bobView.members.length === 2, 'Both people are listed', bobView.members.length);
  check(bobView.members.every((row) => row.permissions === null), 'Permissions are withheld from them');
  check(bobView.members.every((row) => row.fullAuthority === null), 'And so is the authority flag');
  check(!bobView.viewer.canInvite && !bobView.viewer.canManageMembers && !bobView.viewer.canGrantPermissions,
    'And the viewer block offers them nothing');
  const bobInvites = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: bob.token,
    json: { userId: dan.userId.toString(), projectRole: 'viewer' },
  });
  check(bobInvites.status === 403, 'A member without the right cannot invite', bobInvites.status);

  section('projectRole is descriptive — it grants nothing');
  const bobGrantId = bobView.members.find((row) => row.userId === bob.userId.toString())?.id ?? '';
  const promoted = await request(baseUrl, 'PATCH', `/api/projects/${p1}/members/${bobGrantId}`, {
    token: alice.token,
    json: { projectRole: 'main_contractor' },
  });
  check(promoted.status === 200, 'A role may be changed', promoted.status);
  check((promoted.body as { member: MemberRow }).member.projectRole === 'main_contractor', 'And it is recorded');
  const stillRefused = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: bob.token,
    json: { name: 'nope' },
  });
  check(stillRefused.status === 403, 'Being called Main Contractor changes nothing', stillRefused.status);
  const stillCannotInvite = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: bob.token,
    json: { userId: dan.userId.toString(), projectRole: 'viewer' },
  });
  check(stillCannotInvite.status === 403, 'Nor may the role invite anyone', stillCannotInvite.status);

  section('Company standing and company permissions confer nothing here');
  const bobCompany = await CompanyMembershipModel.findOne({ user: bob.userId }).lean().exec();
  check(bobCompany?.standing === 'owner', 'Bob owns his own company');
  check(bobCompany?.permissions.includes('project.create') === true, 'And may create projects there');
  check(stillRefused.status === 403, 'Yet he may not edit a project he was invited into');
  await CompanyMembershipModel.updateOne(
    { user: bob.userId },
    { $set: { companyPosition: 'מנהל אתרים' } },
  ).exec();
  const positionEdit = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: bob.token,
    json: { name: 'nope' },
  });
  check(positionEdit.status === 403, 'A job title changes nothing either', positionEdit.status);

  section('Selected permissions — granted through the ONE grants model');
  const granted = await request(baseUrl, 'PATCH', `/api/permissions/grants/${bobGrantId}`, {
    token: alice.token,
    json: { permissions: ['project.edit'] },
  });
  check(granted.status === 200, 'The central Permissions surface edits the same row', granted.status);
  const nowEdits = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: bob.token,
    json: { name: 'אתר הרצל 8 — עדכון' },
  });
  check(nowEdits.status === 200, 'And the member may now edit', nowEdits.status);
  const notCancel = await request(baseUrl, 'DELETE', `/api/projects/${p1}`, { token: bob.token });
  check(notCancel.status === 403, 'But not cancel, which was not granted', notCancel.status);
  const stillNoInvite = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: bob.token,
    json: { userId: dan.userId.toString(), projectRole: 'viewer' },
  });
  check(stillNoInvite.status === 403, 'And still may not invite', stillNoInvite.status);

  section('Full Project Authority — a flag, and it covers everything');
  await request(baseUrl, 'PATCH', `/api/permissions/grants/${bobGrantId}`, {
    token: alice.token,
    json: { fullAuthority: true },
  });
  const fullRow = await ProjectMembershipModel.findById(bobGrantId).lean().exec();
  check(fullRow?.fullAuthority === true, 'The flag is set');
  check(fullRow?.permissions.length === 1, 'The stored list is NOT expanded to all of them', fullRow?.permissions.length);
  // A code added after a grant was made must still be covered by it — that is what the flag means.
  check(
    effectiveProjectPermissions({ fullAuthority: true, permissions: [] })
      .includes('schedule.partial_release.manage'),
    'Full Project Authority covers partial release without it ever being listed',
  );
  const fullInvites = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: bob.token,
    json: { userId: dan.userId.toString(), projectRole: 'professional' },
  });
  check(fullInvites.status === 201, 'Yet every permission is in force — inviting works', fullInvites.status);
  const danRow = (fullInvites.body as { member: MemberRow }).member;

  section('Handing out authority is a second right, checked separately');
  const carolInvite = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: alice.token,
    json: { userId: carol.userId.toString(), projectRole: 'professional', permissions: ['project.member.invite'] },
  });
  check(carolInvite.status === 201, 'A grantor may invite with permissions attached', carolInvite.status);
  const carolId = (carolInvite.body as { member: MemberRow }).member.id;
  await request(baseUrl, 'POST', `/api/project-invitations/${carolId}/accept`, { token: carol.token });
  const escalate = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: carol.token,
    json: { userId: new Types.ObjectId().toString(), projectRole: 'viewer', fullAuthority: true },
  });
  check(escalate.status === 403, 'Somebody who may invite but not grant cannot hand out authority', escalate.status);
  const plainInvite = await request(baseUrl, 'POST', `/api/projects/${p1}/members`, {
    token: carol.token,
    json: { userId: dan.userId.toString(), projectRole: 'viewer' },
  });
  check(plainInvite.status === 409, 'But a plain invitation still reaches the duplicate check', plainInvite.status);

  section('Templates — company-owned, and copied at the moment they are applied');
  const tpl = await request(baseUrl, 'POST', '/api/permissions/templates', {
    token: alice.token,
    json: { name: 'קבלן משנה', permissions: ['project.edit', 'task.create'], fullAuthority: false },
  });
  check(tpl.status === 201, 'A template is created', tpl.status);
  const tplId = (tpl.body as { template: { id: string } }).template.id;
  const bobTemplates = await request(baseUrl, 'GET', '/api/permissions/templates', { token: bob.token });
  check(
    (bobTemplates.body as { templates: unknown[] }).templates.length === 0,
    'Another company never sees it',
  );

  const p2 = await newProject(alice.token, 'אתר ויצמן 3');
  const fromTemplate = await request(baseUrl, 'POST', `/api/projects/${p2}/members`, {
    token: alice.token,
    json: { userId: dan.userId.toString(), projectRole: 'subcontractor', templateId: tplId },
  });
  check(fromTemplate.status === 201, 'An invitation may apply a template', fromTemplate.status);
  const tplGrant = (fromTemplate.body as { member: MemberRow }).member;
  check(
    JSON.stringify(tplGrant.permissions) === JSON.stringify(['project.edit', 'task.create']),
    'The permissions are copied from it',
    tplGrant.permissions,
  );

  await PermissionTemplateModel.updateOne(
    { _id: tplId },
    { $set: { permissions: ['project.cancel'] } },
  ).exec();
  const afterTemplateEdit = await ProjectMembershipModel.findById(tplGrant.id).lean().exec();
  check(
    JSON.stringify(afterTemplateEdit?.permissions) === JSON.stringify(['project.edit', 'task.create']),
    'Editing the template afterwards does not reach back into the grant',
    afterTemplateEdit?.permissions,
  );

  section('Copy permissions from — a snapshot, and never across projects');
  const copied = await request(baseUrl, 'POST', `/api/projects/${p2}/members`, {
    token: alice.token,
    json: { userId: carol.userId.toString(), projectRole: 'professional', copyFromGrantId: tplGrant.id },
  });
  check(copied.status === 201, 'A grant may be copied from another person on the SAME project', copied.status);
  check(
    JSON.stringify((copied.body as { member: MemberRow }).member.permissions) ===
      JSON.stringify(['project.edit', 'task.create']),
    'And it carries the same permissions',
  );
  const copiedId = (copied.body as { member: MemberRow }).member.id;
  await request(baseUrl, 'PATCH', `/api/permissions/grants/${tplGrant.id}`, {
    token: alice.token,
    json: { permissions: ['project.cancel'] },
  });
  const afterSourceChange = await ProjectMembershipModel.findById(copiedId).lean().exec();
  check(
    JSON.stringify(afterSourceChange?.permissions) === JSON.stringify(['project.edit', 'task.create']),
    'Changing the source afterwards does not move the copy',
    afterSourceChange?.permissions,
  );

  const crossProject = await request(baseUrl, 'POST', `/api/projects/${p2}/members`, {
    token: alice.token,
    json: { userId: bob.userId.toString(), projectRole: 'viewer', copyFromGrantId: bobGrantId },
  });
  check(crossProject.status === 404, 'Copying a grant from a DIFFERENT project is refused', crossProject.status);
  check(
    (await ProjectMembershipModel.countDocuments({ project: p2, user: bob.userId }).exec()) === 0,
    'And the refused copy wrote no row',
  );

  const twoSources = await request(baseUrl, 'POST', `/api/projects/${p2}/members`, {
    token: alice.token,
    json: { userId: bob.userId.toString(), projectRole: 'viewer', templateId: tplId, copyFromGrantId: copiedId },
  });
  check(twoSources.status === 400, 'Two sources of authority at once are refused', twoSources.status);

  section('Cross-project isolation — every project stands on its own');
  const bobOnP2 = await request(baseUrl, 'GET', `/api/projects/${p2}/members`, { token: bob.token });
  check(bobOnP2.status === 404, 'Full authority on one project is invisible on another', bobOnP2.status);
  const bobInvitesOnP2 = await request(baseUrl, 'POST', `/api/projects/${p2}/members`, {
    token: bob.token,
    json: { userId: carol.userId.toString(), projectRole: 'viewer' },
  });
  check(bobInvitesOnP2.status === 404, 'And buys nothing there', bobInvitesOnP2.status);
  const bobCentral = await request(baseUrl, 'GET', '/api/permissions', { token: bob.token });
  const bobAdmin = (bobCentral.body as { projects: { id: string }[] }).projects;
  check(bobAdmin.length === 1 && bobAdmin[0]?.id === p1,
    'The central surface offers him exactly the one project he administers', bobAdmin.length);

  section('No company-wide grant was created anywhere');
  const aliceGrants = await ProjectMembershipModel.find({ user: alice.userId }).lean().exec();
  check(aliceGrants.length === 2, 'The creator holds one row per project, never a company-wide one', aliceGrants.length);
  check(aliceGrants.every((row) => row.project !== undefined), 'And every grant names a project');
  const danOnP1 = await ProjectMembershipModel.findOne({ project: p1, user: dan.userId }).lean().exec();
  const danOnP2 = await ProjectMembershipModel.findOne({ project: p2, user: dan.userId }).lean().exec();
  check(
    danOnP1?.permissions.length === 0 &&
      (danOnP2?.permissions.length ?? 0) > 0 &&
      JSON.stringify(danOnP1?.permissions) !== JSON.stringify(danOnP2?.permissions),
    'Two rows for one person differ per project — nothing is shared between them',
    [danOnP1?.permissions, danOnP2?.permissions],
  );

  section('Nobody can remove their own authority from the member list either');
  const aliceOnP1 = await ProjectMembershipModel.findOne({ project: p1, user: alice.userId }).lean().exec();
  const selfRemove = await request(
    baseUrl,
    'DELETE',
    `/api/projects/${p1}/members/${aliceOnP1?._id.toString()}`,
    { token: alice.token },
  );
  check(selfRemove.status === 409, 'Removing your own membership is refused', selfRemove.status);
  const intact = await ProjectMembershipModel.findById(aliceOnP1?._id).lean().exec();
  check(intact?.status === 'active' && intact.fullAuthority === true, 'And the row is untouched');

  section('Another authorized grantor may still reduce you');
  const reducedByOther = await request(baseUrl, 'PATCH', `/api/permissions/grants/${aliceOnP1?._id.toString()}`, {
    token: bob.token,
    json: { fullAuthority: false, permissions: ['project.edit'] },
  });
  check(reducedByOther.status === 200, 'A second full-authority holder may reduce the first', reducedByOther.status);
  const reducedRow = await ProjectMembershipModel.findById(aliceOnP1?._id).lean().exec();
  check(reducedRow?.fullAuthority === false, 'The reduction took effect');
  const removedByOther = await request(
    baseUrl,
    'DELETE',
    `/api/projects/${p1}/members/${aliceOnP1?._id.toString()}`,
    { token: bob.token },
  );
  check(removedByOther.status === 204, 'And may remove them entirely', removedByOther.status);
  const removedRow = await ProjectMembershipModel.findById(aliceOnP1?._id).lean().exec();
  check(removedRow?.status === 'removed', 'The row is kept as history, marked removed', removedRow?.status);
  check(removedRow?.fullAuthority === false && removedRow.permissions.length === 0, 'With its authority cleared');
  const gone = await request(baseUrl, 'GET', `/api/projects/${p1}/members`, { token: alice.token });
  check(gone.status === 200, 'Her company still SEES the project it owns', gone.status);
  check(
    (gone.body as unknown as MembersBody).viewer.canInvite === false,
    'But the removal ended her authority on it',
  );

  section('A removed person is invited back, never silently re-added');
  const backIn = await request(baseUrl, 'POST', `/api/permissions/grants`, {
    token: bob.token,
    json: { projectId: p1, userId: alice.userId.toString(), projectRole: 'main_contractor', fullAuthority: true },
  });
  check(backIn.status === 201, 'A grantor may offer the seat back', backIn.status);
  const backRow = await ProjectMembershipModel.findById(aliceOnP1?._id).lean().exec();
  check(backRow?.status === 'invited', 'And it arrives as an invitation to answer', backRow?.status);
  const stillOut = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: alice.token,
    json: { name: 'nope' },
  });
  check(stillOut.status === 403, 'Until she answers, the authority is not in force', stillOut.status);
  await request(baseUrl, 'POST', `/api/project-invitations/${aliceOnP1?._id.toString()}/accept`, {
    token: alice.token,
  });
  const backEdits = await request(baseUrl, 'PATCH', `/api/projects/${p1}`, {
    token: alice.token,
    json: { name: 'אתר הרצל 8' },
  });
  check(backEdits.status === 200, 'After accepting, it is', backEdits.status);

  section('Editing a grant never answers an invitation on the invitee’s behalf');
  const openInvite = await ProjectMembershipModel.findById(danRow.id).lean().exec();
  check(openInvite?.status === 'invited', 'Dan’s invitation on the first project is still open');
  await request(baseUrl, 'POST', '/api/permissions/grants', {
    token: alice.token,
    json: { projectId: p1, userId: dan.userId.toString(), projectRole: 'professional', permissions: ['task.create'] },
  });
  const afterGrantEdit = await ProjectMembershipModel.findById(danRow.id).lean().exec();
  check(afterGrantEdit?.status === 'invited', 'Editing his permissions left it open', afterGrantEdit?.status);
  check(
    JSON.stringify(afterGrantEdit?.permissions) === JSON.stringify(['task.create']),
    'While the permissions did change',
  );
  const danReads = await request(baseUrl, 'GET', `/api/projects/${p1}`, { token: dan.token });
  check(danReads.status === 404, 'And he still cannot see the project he has not joined', danReads.status);

  section('Cancelling a project takes its memberships and open invitations with it');
  const p3 = await newProject(alice.token, 'אתר זמני');
  const doomed = await request(baseUrl, 'POST', `/api/projects/${p3}/members`, {
    token: alice.token,
    json: { userId: dan.userId.toString(), projectRole: 'viewer' },
  });
  check(doomed.status === 201, 'Somebody is invited to it', doomed.status);
  check((await invitationsOf(dan.token)).some((row) => row.projectId === p3), 'The invitation is offered');
  const cancelled = await request(baseUrl, 'DELETE', `/api/projects/${p3}`, { token: alice.token });
  check(cancelled.status === 204, 'The project is cancelled before it started', cancelled.status);
  check(
    (await ProjectMembershipModel.countDocuments({ project: p3 }).exec()) === 0,
    'No membership row is left behind',
  );
  check(!(await invitationsOf(dan.token)).some((row) => row.projectId === p3),
    'And the invitation is gone from his list');

  const companies = [alice.companyId, bob.companyId, carol.companyId, dan.companyId];
  const owned = await ProjectModel.find({ company: { $in: companies } }).select('_id').lean().exec();
  await BlockModel.deleteMany({ $or: [{ blocker: alice.userId }, { blocker: carol.userId }] }).exec();
  await ProjectMembershipModel.deleteMany({ project: { $in: owned.map((row) => row._id) } }).exec();
  await PermissionTemplateModel.deleteMany({ company: { $in: companies } }).exec();
  await ProjectModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
