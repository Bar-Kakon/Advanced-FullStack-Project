import Joi from 'joi';

export interface BlockUserParams {
  readonly userId: string;
}

export const blockUserParamsSchema = Joi.object<BlockUserParams>({
  userId: Joi.string().hex().length(24).required(),
});
