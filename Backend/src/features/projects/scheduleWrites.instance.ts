import { runInTransaction } from '../../db/mongoose.js';
import { projectRepository } from './project.repository.js';
import { createScheduleWrites } from './scheduleWrites.js';

export const scheduleWrites = createScheduleWrites({
  projects: projectRepository,
  transactions: { run: runInTransaction },
});
