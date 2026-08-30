import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyCreateTaskError,
  createStage,
  createTask,
  fetchCreateOptions,
  fetchProjectCreateOptions,
  type CreateTaskFailure,
} from '../../api/createTask.api';
import type {
  CreateOptions,
  CreateTaskResult,
  ProjectCreateOptions,
} from '../../api/createTask.types';
import { isAbortError } from '../../api/projects.api';
import type { TaskKind } from '../../api/tasks.types';

export interface CreateTaskValues {
  kind: TaskKind;
  projectId: string;
  stageId: string;
  assigneeId: string;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  ownCrewOnly: boolean;
  delegatorOnSiteRequired: boolean;
}

export const emptyCreateTask: CreateTaskValues = {
  kind: 'project',
  projectId: '',
  stageId: '',
  assigneeId: '',
  title: '',
  description: '',
  startDate: '',
  dueDate: '',
  ownCrewOnly: false,
  delegatorOnSiteRequired: false,
};

export type CreateTaskErrors = Partial<Record<keyof CreateTaskValues, string>>;

export interface CreateTaskMessages {
  readonly required: string;
  readonly dueBeforeStart: string;
  readonly outsideWindow: string;
}

/**
 * The same checks the server makes, as a courtesy. Every one of them is made again on the server,
 * so a bypassed control still cannot persist anything invalid.
 */
export const validate = (
  values: CreateTaskValues,
  messages: CreateTaskMessages,
  window: ProjectCreateOptions | null,
): CreateTaskErrors => {
  const errors: CreateTaskErrors = {};

  if (values.title.trim().length === 0) errors.title = messages.required;
  if (values.startDate.length === 0) errors.startDate = messages.required;
  if (values.dueDate.length === 0) errors.dueDate = messages.required;

  if (values.kind === 'project') {
    if (values.projectId.length === 0) errors.projectId = messages.required;
    // A project task belongs to a stage, and there is no stage-less shortcut.
    if (values.stageId.length === 0) errors.stageId = messages.required;
    if (values.assigneeId.length === 0) errors.assigneeId = messages.required;
  }

  if (values.startDate && values.dueDate && values.dueDate < values.startDate) {
    errors.dueDate = messages.dueBeforeStart;
  }

  if (values.kind === 'project' && window !== null) {
    if (values.startDate && values.startDate < window.startDate) {
      errors.startDate = messages.outsideWindow;
    }
    if (values.dueDate && values.dueDate > window.endDate) {
      errors.dueDate = messages.outsideWindow;
    }
  }

  return errors;
};

export const useCreateTask = (viewerId: string, initialProjectId?: string) => {
  const [values, setValues] = useState<CreateTaskValues>({
    ...emptyCreateTask,
    ...(initialProjectId ? { projectId: initialProjectId } : {}),
  });
  const [options, setOptions] = useState<CreateOptions | null>(null);
  const [window, setWindow] = useState<ProjectCreateOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<CreateTaskFailure | null>(null);
  const [errors, setErrors] = useState<CreateTaskErrors>({});

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await fetchCreateOptions(controller.signal);
        if (!mounted.current) return;
        setOptions(loaded);
        // With only one kind open to this account, that kind is the form — there is nothing to pick.
        if (loaded.projects.length === 0 && loaded.canCreateStandalone) {
          setValues((current) => ({ ...current, kind: 'standalone' }));
        }
        setFailure(null);
      } catch (error) {
        if (isAbortError(error) || !mounted.current) return;
        setFailure(classifyCreateTaskError(error));
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // The chosen project decides the stages, the assignable people and the schedulable window.
  useEffect(() => {
    if (values.kind !== 'project' || values.projectId.length === 0) {
      setWindow(null);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      setLoadingProject(true);
      try {
        const loaded = await fetchProjectCreateOptions(values.projectId, controller.signal);
        if (!mounted.current) return;
        setWindow(loaded);
        // Without `task.assign` the work can only be this account's own, so it names itself.
        if (!loaded.canAssignOthers) {
          setValues((current) => ({ ...current, assigneeId: viewerId }));
        }
        setFailure(null);
      } catch (error) {
        if (isAbortError(error) || !mounted.current) return;
        setWindow(null);
        setFailure(classifyCreateTaskError(error));
      } finally {
        if (mounted.current) setLoadingProject(false);
      }
    })();
    return () => controller.abort();
  }, [values.kind, values.projectId, viewerId]);

  const set = useCallback(
    <K extends keyof CreateTaskValues>(key: K, value: CreateTaskValues[K]) => {
      setValues((current) => {
        const next = { ...current, [key]: value };
        // A stage and an assignee belong to one project, so changing it clears both.
        if (key === 'projectId') return { ...next, stageId: '', assigneeId: '' };
        return next;
      });
    },
    [],
  );

  const addStage = useCallback(
    async (name: string, isGate: boolean): Promise<void> => {
      if (window === null || saving) return;
      setSaving(true);
      try {
        const stage = await createStage(window.projectId, name, isGate);
        if (!mounted.current) return;
        setWindow({ ...window, stages: [...window.stages, stage] });
        setValues((current) => ({ ...current, stageId: stage.id }));
      } catch (error) {
        if (mounted.current) setFailure(classifyCreateTaskError(error));
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [window, saving],
  );

  const submit = useCallback(
    async (messages: CreateTaskMessages): Promise<CreateTaskResult | null> => {
      if (saving) return null;

      const found = validate(values, messages, window);
      setErrors(found);
      if (Object.keys(found).length > 0) return null;

      setSaving(true);
      try {
        const description = values.description.trim();
        const result = await createTask(
          values.kind === 'project'
            ? {
                kind: 'project',
                projectId: values.projectId,
                stageId: values.stageId,
                assigneeId: values.assigneeId,
                title: values.title.trim(),
                ...(description ? { description } : {}),
                startDate: values.startDate,
                dueDate: values.dueDate,
                ownCrewOnly: values.ownCrewOnly,
                delegatorOnSiteRequired: values.delegatorOnSiteRequired,
              }
            : {
                kind: 'standalone',
                title: values.title.trim(),
                ...(description ? { description } : {}),
                startDate: values.startDate,
                dueDate: values.dueDate,
              },
        );
        if (mounted.current) setFailure(null);
        return result;
      } catch (error) {
        if (mounted.current) setFailure(classifyCreateTaskError(error));
        return null;
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [saving, values, window],
  );

  return { values, set, options, window, loading, loadingProject, saving, failure, errors, submit, addStage };
};
