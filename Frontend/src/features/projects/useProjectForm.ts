import { useCallback, useEffect, useRef, useState } from 'react';

import {
  adoptCurrentCalendar,
  cancelProject,
  classifyProjectError,
  createProject,
  fetchOutdatedCalendarCount,
  fetchProject,
  isAbortError,
  updateProject,
  type ProjectFailure,
} from '../../api/projects.api';
import type { Project, ProjectLocationPayload, ProjectType } from '../../api/projects.types';
import type { StructuredPlace } from '../../location/place.types';
import type { Region } from '../../api/types';

export interface ProjectFormValues {
  name: string;
  projectType: ProjectType | '';
  projectTypeOther: string;
  size: string;
  description: string;
  place: StructuredPlace | null;
  city: string;
  region: Region | '';
  address: string;
  startDate: string;
  targetEndDate: string;
  overrunAllowanceDays: string;
}

export const emptyForm: ProjectFormValues = {
  name: '',
  projectType: '',
  projectTypeOther: '',
  size: '',
  description: '',
  place: null,
  city: '',
  region: '',
  address: '',
  startDate: '',
  targetEndDate: '',
  overrunAllowanceDays: '',
};

const toForm = (project: Project): ProjectFormValues => ({
  name: project.name,
  projectType: project.projectType,
  projectTypeOther: project.projectTypeOther ?? '',
  size: project.size,
  description: project.description ?? '',
  place: project.location.place,
  city: project.location.city ?? '',
  region: project.location.region ?? '',
  address: project.location.address ?? '',
  startDate: project.dates.startDate,
  targetEndDate: project.dates.targetEndDate,
  overrunAllowanceDays: String(project.dates.overrunAllowanceDays),
});

export type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

export interface ValidationMessages {
  readonly required: string;
  readonly targetBeforeStart: string;
  readonly overrunCeiling: string;
  readonly allowanceRange: string;
}

/**
 * Client-side checks are a courtesy that mirror the server's. The server validates every one of
 * them again, so a bypassed control cannot persist anything invalid.
 */
export const validate = (
  values: ProjectFormValues,
  messages: ValidationMessages,
  ceiling?: string,
): FieldErrors => {
  const errors: FieldErrors = {};

  if (values.name.trim().length === 0) errors.name = messages.required;
  if (values.projectType === '') errors.projectType = messages.required;
  if (values.projectType === 'other' && values.projectTypeOther.trim().length === 0) {
    errors.projectTypeOther = messages.required;
  }
  if (values.size.trim().length === 0) errors.size = messages.required;
  if (values.startDate.length === 0) errors.startDate = messages.required;
  if (values.targetEndDate.length === 0) errors.targetEndDate = messages.required;

  if (values.startDate && values.targetEndDate && values.targetEndDate < values.startDate) {
    errors.targetEndDate = messages.targetBeforeStart;
  }

  if (ceiling === undefined) {
    const allowance = Number(values.overrunAllowanceDays);
    if (values.overrunAllowanceDays.trim().length === 0) errors.overrunAllowanceDays = messages.required;
    else if (!Number.isInteger(allowance) || allowance < 0 || allowance > 3650) {
      errors.overrunAllowanceDays = messages.allowanceRange;
    }
  } else if (values.targetEndDate && values.targetEndDate > ceiling) {
    errors.targetEndDate = messages.overrunCeiling;
  }

  return errors;
};

export const useProjectForm = (projectId?: string) => {
  const [values, setValues] = useState<ProjectFormValues>(emptyForm);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(projectId !== undefined);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ProjectFailure | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [outdatedCalendar, setOutdatedCalendar] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (projectId === undefined) return;
    const controller = new AbortController();

    void (async () => {
      setLoading(true);
      try {
        const loaded = await fetchProject(projectId, controller.signal);
        if (!mounted.current) return;
        setProject(loaded);
        setValues(toForm(loaded));
        setFailure(null);
        // Only ever asks whether a newer version exists. Nothing is applied by reading.
        const behind = await fetchOutdatedCalendarCount(controller.signal).catch(() => 0);
        if (mounted.current) setOutdatedCalendar(behind > 0);
      } catch (error) {
        if (isAbortError(error) || !mounted.current) return;
        setFailure(classifyProjectError(error));
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [projectId]);

  const set = useCallback(<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const buildLocation = (): ProjectLocationPayload | null => {
    const hasAny =
      values.place !== null || values.city.trim() || values.region || values.address.trim();
    if (!hasAny) return null;

    return {
      ...(values.place ? { place: values.place } : {}),
      ...(values.city.trim() ? { city: values.city.trim() } : {}),
      ...(values.region ? { region: values.region } : {}),
      ...(values.address.trim() ? { address: values.address.trim() } : {}),
    };
  };

  const save = useCallback(
    async (messages: ValidationMessages): Promise<Project | null> => {
      if (saving) return null;

      const found = validate(values, messages, project?.dates.overrunCeilingDate);
      setErrors(found);
      if (Object.keys(found).length > 0) return null;

      setSaving(true);
      try {
        const location = buildLocation();
        const saved =
          project === null
            ? await createProject({
                name: values.name.trim(),
                projectType: values.projectType as ProjectType,
                ...(values.projectType === 'other'
                  ? { projectTypeOther: values.projectTypeOther.trim() }
                  : {}),
                size: values.size.trim(),
                ...(values.description.trim() ? { description: values.description.trim() } : {}),
                ...(location ? { location } : {}),
                startDate: values.startDate,
                targetEndDate: values.targetEndDate,
                overrunAllowanceDays: Number(values.overrunAllowanceDays),
              })
            : await updateProject(project.id, {
                name: values.name.trim(),
                projectType: values.projectType as ProjectType,
                ...(values.projectType === 'other'
                  ? { projectTypeOther: values.projectTypeOther.trim() }
                  : {}),
                size: values.size.trim(),
                description: values.description.trim(),
                location,
                startDate: values.startDate,
                targetEndDate: values.targetEndDate,
              });

        if (mounted.current) setFailure(null);
        return saved;
      } catch (error) {
        if (mounted.current) setFailure(classifyProjectError(error));
        return null;
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    // `values` and `project` are read fresh on every call; buildLocation closes over them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saving, values, project],
  );

  const cancel = useCallback(async (): Promise<boolean> => {
    if (project === null || saving) return false;
    setSaving(true);
    try {
      await cancelProject(project.id);
      return true;
    } catch (error) {
      if (mounted.current) setFailure(classifyProjectError(error));
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [project, saving]);

  const adoptCalendar = useCallback(
    async (keepOverrides: boolean): Promise<void> => {
      if (project === null || saving) return;
      setSaving(true);
      try {
        const updated = await adoptCurrentCalendar(project.id, keepOverrides);
        if (!mounted.current) return;
        setProject(updated);
        setOutdatedCalendar(false);
      } catch (error) {
        if (mounted.current) setFailure(classifyProjectError(error));
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [project, saving],
  );

  return {
    values, set, project, loading, saving, failure, errors, save, cancel,
    adoptCalendar, outdatedCalendar,
  };
};
