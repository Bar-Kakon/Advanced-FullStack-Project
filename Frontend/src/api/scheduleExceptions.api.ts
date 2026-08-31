import { api } from './client';
import type {
  ExceptionKind,
  ExceptionScope,
  ScheduleException,
  ScheduleExceptionList,
} from './scheduleExceptions.types';

export const listScheduleExceptions = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ScheduleExceptionList> => {
  const { data } = await api.get<ScheduleExceptionList>(
    `/schedule-exceptions/projects/${projectId}`,
    signal ? { signal } : {},
  );
  return data;
};

/**
 * No `professionalId` is ever sent. A professional requests for themself, so the subject is the
 * account behind the token and the server refuses a body that names anybody else.
 */
export const requestScheduleException = async (
  projectId: string,
  payload: {
    kind: ExceptionKind;
    scope: ExceptionScope;
    taskId?: string;
    fromDate: string;
    toDate: string;
    reason?: string;
  },
): Promise<ScheduleException> => {
  const { data } = await api.post<{ exception: ScheduleException }>(
    `/schedule-exceptions/projects/${projectId}`,
    payload,
  );
  return data.exception;
};

export const modifyScheduleException = async (
  exceptionId: string,
  payload: { kind?: ExceptionKind; fromDate?: string; toDate?: string; note?: string },
): Promise<ScheduleException> => {
  const { data } = await api.patch<{ exception: ScheduleException }>(
    `/schedule-exceptions/${exceptionId}`,
    payload,
  );
  return data.exception;
};

export const decideScheduleException = async (
  exceptionId: string,
  approve: boolean,
  note?: string,
): Promise<ScheduleException> => {
  const { data } = await api.post<{ exception: ScheduleException }>(
    `/schedule-exceptions/${exceptionId}/decision`,
    { approve, ...(note === undefined ? {} : { note }) },
  );
  return data.exception;
};

export const cancelScheduleException = async (
  exceptionId: string,
): Promise<ScheduleException> => {
  const { data } = await api.post<{ exception: ScheduleException }>(
    `/schedule-exceptions/${exceptionId}/cancel`,
    {},
  );
  return data.exception;
};
