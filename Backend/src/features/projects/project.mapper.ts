import { resolveEffectiveCalendar, type WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';
import type { ProjectDto } from './project.dto.js';
import type { ProjectRecord } from './project.model.js';
import { formatCalendarDate, overrunCeiling, overrunFromOriginal } from './projectDates.js';
import { deriveStatus, isCancellable } from './projectLifecycle.service.js';

/**
 * The one place a stored project becomes the shape a client reads. Every surface that shows a
 * project goes through here, so there is a single representation and nothing derives a status,
 * a ceiling or an overrun a second time.
 */
export const toProjectDto = (
  project: ProjectRecord,
  viewerManages: boolean,
  /** From the Tasks domain. The one fact the closed start rule needs that the project cannot hold. */
  firstTaskStarted: boolean,
  baseConfig?: WorkingCalendarConfig,
): ProjectDto => ({
  id: project._id.toString(),
  companyId: project.company.toString(),
  name: project.name,
  description: project.description ?? null,
  projectType: project.projectType,
  projectTypeOther: project.projectTypeOther ?? null,
  size: project.size,
  calendar: {
    versionId: project.calendarVersion.toString(),
    overrides: project.calendarOverrides ?? null,
    effective:
      baseConfig === undefined
        ? null
        : resolveEffectiveCalendar(baseConfig, project.calendarOverrides),
    adoptionCount: project.calendarAdoptions.length,
  },
  location: {
    place: project.location?.place ?? null,
    city: project.location?.city ?? null,
    region: project.location?.region ?? null,
    address: project.location?.address ?? null,
  },
  dates: {
    startDate: formatCalendarDate(project.startDate),
    targetEndDate: formatCalendarDate(project.targetEndDate),
    originalTargetEndDate: formatCalendarDate(project.originalTargetEndDate),
    overrunAllowanceDays: project.overrunAllowanceDays,
    overrunCeilingDate: formatCalendarDate(
      overrunCeiling(project.originalTargetEndDate, project.overrunAllowanceDays),
    ),
    overrunDaysFromOriginal: overrunFromOriginal(project.originalTargetEndDate, project.targetEndDate),
  },
  status: deriveStatus(project, firstTaskStarted),
  cancellable: isCancellable(project, firstTaskStarted),
  viewerManages,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});
