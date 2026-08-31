import { api } from './client';

/**
 * What this viewer may change, answered before the form is drawn so no control is offered that the
 * PATCH would refuse.
 */
export interface EditableFields {
  readonly canEditDetails: boolean;
  readonly canMoveStage: boolean;
  /** True only on standalone work, which involves no other professional. */
  readonly canEditDatesDirectly: boolean;
  /** On project work the dates belong to the date-change flow, never to this form. */
  readonly datesGoThroughProposal: boolean;
}

export interface EditedTask {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly stageId: string | null;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;
  readonly startDate: string;
  readonly dueDate: string;
}

export interface EditTaskPayload {
  readonly title?: string;
  readonly description?: string | null;
  readonly ownCrewOnly?: boolean;
  readonly delegatorOnSiteRequired?: boolean;
  readonly stageId?: string;
  readonly startDate?: string;
  readonly dueDate?: string;
}

export const fetchEditableFields = async (
  taskId: string,
  signal?: AbortSignal,
): Promise<EditableFields> => {
  const { data } = await api.get<{ editable: EditableFields }>(
    `/tasks/${taskId}/editable`,
    signal ? { signal } : {},
  );
  return data.editable;
};

export const editTask = async (taskId: string, payload: EditTaskPayload): Promise<EditedTask> => {
  const { data } = await api.patch<{ task: EditedTask }>(`/tasks/${taskId}`, payload);
  return data.task;
};
