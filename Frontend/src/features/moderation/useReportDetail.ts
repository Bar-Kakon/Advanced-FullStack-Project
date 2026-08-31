import { isAxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';

import {
  applyAccountAction,
  claimModerationReport,
  fetchModerationReport,
  resolveModerationReport,
} from '../../api/moderation.api';
import type { AccountAction, ModerationReport, ResolutionOutcome } from '../../api/moderation.types';
import type { ApiErrorBody } from '../../api/types';

export type DetailFailure =
  | 'ALREADY_RESOLVED'
  | 'NOT_APPLICABLE'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';

const classify = (error: unknown): DetailFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const code = (error.response.data as ApiErrorBody | undefined)?.code;
  if (code === 'REPORT_ALREADY_RESOLVED') return 'ALREADY_RESOLVED';
  if (code === 'ACCOUNT_ACTION_NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (error.response.status === 404) return 'NOT_FOUND';
  return 'UNKNOWN';
};

export const useReportDetail = (reportId: string) => {
  const [report, setReport] = useState<ModerationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DetailFailure | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      setReport((await fetchModerationReport(reportId)).report);
    } catch (error) {
      setFailure(classify(error));
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every action replaces the whole report with what the server returned, so the screen never
   * shows a state it decided for itself. A refused action re-reads instead, which is what puts a
   * moderator who lost a race in front of the verdict that actually won.
   */
  const run = async (call: () => Promise<{ report: ModerationReport }>): Promise<void> => {
    setBusy(true);
    setFailure(null);
    try {
      setReport((await call()).report);
    } catch (error) {
      setFailure(classify(error));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return {
    report,
    loading,
    busy,
    failure,
    reload: load,
    claim: () => run(() => claimModerationReport(reportId)),
    resolve: (outcome: ResolutionOutcome, note?: string) =>
      run(() => resolveModerationReport(reportId, outcome, note)),
    act: (action: AccountAction, reason: string) =>
      run(() => applyAccountAction(reportId, action, reason)),
  };
};