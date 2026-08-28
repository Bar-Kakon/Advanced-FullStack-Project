import Joi from 'joi';

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

const MAX_EMAIL_LENGTH = 254;
/** A shape guard, not a password policy: bcrypt on an unbounded string is a cheap way to burn CPU. */
const MAX_PASSWORD_LENGTH = 200;

/**
 * Login checks that a credential was *submitted*, never that it is well-formed enough to be a
 * plausible password. Register owns the password policy; applying it here would tell an attacker
 * which passwords could never belong to an account.
 */
export const loginBodySchema = Joi.object<LoginBody>({
  email: Joi.string().trim().lowercase().email().max(MAX_EMAIL_LENGTH).required(),
  password: Joi.string().min(1).max(MAX_PASSWORD_LENGTH).required(),
});
