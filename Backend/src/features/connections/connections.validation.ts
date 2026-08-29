import Joi from 'joi';

export interface ConnectionUserParams {
  readonly userId: string;
}

export const connectionUserParamsSchema = Joi.object<ConnectionUserParams>({
  userId: Joi.string().hex().length(24).required(),
});
