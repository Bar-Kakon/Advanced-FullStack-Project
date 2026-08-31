/** What the server chooses to say about one version of one plan. There is no owner id in it. */
export type WorkPlanVisibility = 'shared' | 'private';

export interface WorkPlan {
  readonly id: string;
  /** The version group. Asking for history or adding a version both go through this. */
  readonly planId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly visibility: WorkPlanVisibility;
  /** The responsible party. The server never names a confidential delegate here. */
  readonly uploadedByName: string | null;
}
