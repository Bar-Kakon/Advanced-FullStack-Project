import Joi from 'joi';

import { RATING_MAX, RATING_MIN } from './rating.model.js';

export interface CreateRatingBody {
  readonly rateeUserId: string;
  readonly taskId: string;
  readonly score: number;
  readonly comment?: string;
}

export const createRatingBodySchema = Joi.object<CreateRatingBody>({
  rateeUserId: Joi.string().hex().length(24).required(),
  taskId: Joi.string().hex().length(24).required(),
  score: Joi.number().integer().min(RATING_MIN).max(RATING_MAX).required(),
  comment: Joi.string().trim().max(600).optional(),
});
