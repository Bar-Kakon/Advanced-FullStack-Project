import { Types } from 'mongoose';

import { ProjectMembershipModel } from '../projectaccess/projectMembership.model.js';
import { effectiveProjectPermissions, type ProjectPermission } from '../projectaccess/projectPermission.js';
import { TaskModel } from '../tasks/task.model.js';
import type { PhoneVisibilityReason } from './publicProfile.dto.js';

export interface PhoneVisibilityInput {
  readonly viewerId: string;
  readonly subjectId: string;
}

export interface PhoneVisibilityService {
  decide(input: PhoneVisibilityInput): Promise<PhoneVisibilityReason>;
}

/**
 * The closed phone-visibility policy, decided on the server.
 *
 * Four parts. (1) A personal phone is never displayed anywhere — and no `users.phone` field exists
 * for this service to reach, so that part holds by construction rather than by filtering. (2)
 * Inside a shared project the management side sees a professional's number. (3) Under a real work
 * commitment the two committed parties see each other's, mutually. (4) Every case (2) and (3) do
 * not cover is the professional's own control, which lives in `users.contactVisibility` and is
 * applied by the caller — this service answers only whether an AUTOMATIC case applies.
 *
 * Connection state confers nothing, which is why the connections domain is not consulted here at
 * all: there is no path by which being connected could produce a visible answer.
 *
 * The mapping from the three named management roles onto the model. Authority lives only in the
 * permission catalogue — `projectRole` is descriptive and never read, and a company position
 * grants nothing. What those three roles hold in common over a schedule is `schedule.change.manage`,
 * which the coordination domain already treats as the management side of a project, so the same
 * grant answers here rather than a second, parallel notion of who runs a job.
 */
const MANAGEMENT_GRANT: ProjectPermission = 'schedule.change.manage';

export const createPhoneVisibilityService = (): PhoneVisibilityService => ({
  async decide({ viewerId, subjectId }) {
    if (viewerId === subjectId) return 'self';
    if (!Types.ObjectId.isValid(viewerId) || !Types.ObjectId.isValid(subjectId)) {
      return 'hidden_no_approved_case';
    }

    const viewer = new Types.ObjectId(viewerId);
    const subject = new Types.ObjectId(subjectId);

    /**
     * A task both people are party to: the person who opened the work and the person responsible
     * for it, and — separately — the responsible party and their delegate.
     *
     * The delegate is never paired with the party ABOVE. That pairing would tell each of them the
     * other exists, which is what the confidential-delegation wall forbids.
     */
    const commitment = await TaskModel.countDocuments({
      $or: [
        { createdBy: viewer, assignee: subject },
        { createdBy: subject, assignee: viewer },
        { assignee: viewer, 'delegation.delegate': subject },
        { assignee: subject, 'delegation.delegate': viewer },
      ],
    }).exec();
    if (commitment > 0) return 'visible_work_commitment';

    // Both memberships must be active: an invitation nobody accepted is not a shared project, and
    // somebody who has left is not on the job any more.
    const [viewerRows, subjectRows] = await Promise.all([
      ProjectMembershipModel.find({ user: viewer, status: 'active' })
        .select('project permissions fullAuthority')
        .lean<
          { project: Types.ObjectId; permissions: ProjectPermission[]; fullAuthority: boolean }[]
        >()
        .exec(),
      ProjectMembershipModel.find({ user: subject, status: 'active' })
        .select('project')
        .lean<{ project: Types.ObjectId }[]>()
        .exec(),
    ]);

    const subjectProjects = new Set(subjectRows.map((row) => row.project.toString()));
    const manages = viewerRows.some(
      (row) =>
        subjectProjects.has(row.project.toString()) &&
        effectiveProjectPermissions(row).includes(MANAGEMENT_GRANT),
    );

    // Ordinary co-membership is not an approved case: another subcontractor on the same job sees
    // nothing, and gets the same answer as a stranger.
    return manages ? 'visible_shared_project_role' : 'hidden_no_approved_case';
  },
});
