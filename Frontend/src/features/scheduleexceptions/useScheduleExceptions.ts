import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelScheduleException,
  decideScheduleException,
  listScheduleExceptions,
  modifyScheduleException,
  requestScheduleException,
} from '../../api/scheduleExceptions.api';
import type {
  ExceptionKind,
  ExceptionScope,
  ScheduleExceptionList,
} from '../../api/scheduleExceptions.types';

export type ExceptionFailure =
  | 'network'
  | 'load'
  | 'submit'
  | 'window'
  | 'tooLong'
  | 'notPermitted'
  | 'decided'
  | 'projectScope';

const CODES: Readonly<Record<string, ExceptionFailure>> = {
  SCHEDULE_EXCEPTION_BAD_WINDOW: 'window',
  SCHEDULE_EXCEPTION_TOO_LONG: 'tooLong',
  SCHEDULE_EXCEPTION_NOT_PERMITTED: 'notPermitted',
  SCHEDULE_EXCEPTION_NOT_MODIFIABLE: 'notPermitted',
  SCHEDULE_EXCEPTION_NOT_CANCELLABLE: 'notPermitted',
  SCHEDULE_EXCEPTION_NOT_RESPONSIBLE: 'notPermitted',
  SCHEDULE_EXCEPTION_DECIDED: 'decided',
  SCHEDULE_EXCEPTION_PROJECT_SCOPE: 'projectScope',
};

const classify = (error: unknown, fallback: ExceptionFailure): ExceptionFailure => {
  const response = (error as { response?: { data?: { code?: string } } }).response;
  if (response === undefined) return 'network';
  return CODES[response.data?.code ?? ''] ?? fallback;
};

export const useScheduleExceptions = (projectId: string) => {
  const [data, setData] = useState<ScheduleExceptionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ExceptionFailure | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const loaded = await listScheduleExceptions(projectId);
      if (!mounted.current) return;
      setData(loaded);
      setFailure(null);
    } catch (error) {
      if (mounted.current) setFailure(classify(error, 'load'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (work: () => Promise<unknown>, fallback: ExceptionFailure): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        await load();
        if (mounted.current) setFailure(null);
        return true;
      } catch (error) {
        if (mounted.current) setFailure(classify(error, fallback));
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [load],
  );

  return {
    data,
    loading,
    busy,
    failure,
    reload: load,
    submit: (payload: {
      kind: ExceptionKind;
      scope: ExceptionScope;
      taskId?: string;
      fromDate: string;
      toDate: string;
      reason?: string;
    }) => run(() => requestScheduleException(projectId, payload), 'submit'),
    modify: (id: string, payload: { fromDate?: string; toDate?: string; note?: string }) =>
      run(() => modifyScheduleException(id, payload), 'submit'),
    decide: (id: string, approve: boolean, note?: string) =>
      run(() => decideScheduleException(id, approve, note), 'submit'),
    withdraw: (id: string) => run(() => cancelScheduleException(id), 'submit'),
  };
};
