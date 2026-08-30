import { Schema, model, type Types } from 'mongoose';

/**
 * One piece of work. Project work and standalone work share this document and are told apart by a
 * stored `kind`, so the source is a fact rather than an inference from an empty field.
 *
 * Progress is binary and stored as two timestamps. There is no status field and no percentage: the
 * state a screen shows is derived on read, and overdue is a comparison, never stored.
 */
export const TASK_KINDS = ['project', 'standalone'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Whole work or part of it — the delegator's choice, inside the single-level model. */
export const DELEGATION_SCOPES = ['whole', 'part'] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

export interface TaskDelegation {
  /** Who actually performs. Never visible to the party above. */
  readonly delegate: Types.ObjectId;
  readonly scope: DelegationScope;
  /** What was handed over when the scope is `part`. The delegate is shown only this. */
  readonly partDescription?: string;
  readonly delegatedAt: Date;
}

export interface TaskRecord {
  readonly _id: Types.ObjectId;
  readonly kind: TaskKind;
  /** Present only on project work, and required there. */
  readonly project?: Types.ObjectId;
  /** Which stage of the project this work sits in. Dependencies live between stages, not tasks. */
  readonly stage?: Types.ObjectId;
  readonly company?: Types.ObjectId;

  readonly title: string;
  readonly description?: string;

  /** Provenance, and the counterparty an ordinary assignee answers to. Never authority. */
  readonly createdBy: Types.ObjectId;
  /** The responsible party. Absent once the work is orphaned — never silently reassigned. */
  readonly assignee?: Types.ObjectId;

  readonly startDate: Date;
  readonly dueDate: Date;
  /** The whole of progress reporting. */
  readonly startedAt?: Date;
  readonly completedAt?: Date;

  readonly delegation?: TaskDelegation;
  /** The GC's own-crew-only term: this work may not be handed to anybody else. */
  readonly ownCrewOnly: boolean;
  /** The GC may require the delegator on site even after handing the work over. */
  readonly delegatorOnSiteRequired: boolean;

  /** Orphan state: the node survives, the owner may be absent, and dates freeze. */
  readonly orphanedAt?: Date;
  /** Who was responsible before. Always preserved — the closed orphan rule requires it. */
  readonly previousAssignee?: Types.ObjectId;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const delegationSchema = new Schema(
  {
    delegate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, enum: DELEGATION_SCOPES, required: true },
    partDescription: { type: String, trim: true, maxlength: 400 },
    delegatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const taskSchema = new Schema(
  {
    kind: { type: String, enum: TASK_KINDS, required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    stage: { type: Schema.Types.ObjectId, ref: 'ProjectStage', index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },

    delegation: { type: delegationSchema },
    ownCrewOnly: { type: Boolean, required: true, default: false },
    delegatorOnSiteRequired: { type: Boolean, required: true, default: false },

    orphanedAt: { type: Date },
    previousAssignee: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// The `kind` and the project reference must never describe two different things.
taskSchema.pre('validate', async function preValidate() {
  const kind = this.get('kind') as TaskKind;
  const project = this.get('project') as Types.ObjectId | undefined;
  if (kind === 'project' && !project) throw new Error('A project task must name its project.');
  if (kind === 'standalone' && project) throw new Error('Standalone work cannot name a project.');
});

// My Tasks reads one person's queue in due-date order; `_id` breaks ties so a cursor never repeats.
taskSchema.index({ assignee: 1, dueDate: 1, _id: 1 });
// The delegate's own queue — delegated work still has to reach whoever actually performs it.
taskSchema.index({ 'delegation.delegate': 1, dueDate: 1, _id: 1 });

export const TaskModel = model('Task', taskSchema);
