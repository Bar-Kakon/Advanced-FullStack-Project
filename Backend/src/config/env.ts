import Joi from 'joi';

export type NodeEnv = 'development' | 'test' | 'production';

/**
 * Access and Refresh tokens keep separate secrets and separate lifetimes because they are separate
 * credentials — see `features/auth/tokens`. Sharing either value would make them interchangeable.
 */
export interface TokenConfig {
  readonly accessSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshSecret: string;
  readonly refreshTtlSeconds: number;
}

/**
 * Which Terms a signup is accepting. It comes from the deployment rather than the request: the
 * server knows which version it is currently serving, and a client-supplied version could claim
 * anything. Stored with every acceptance so the record stays provable after the terms change.
 */
export interface TermsConfig {
  readonly version: string;
}

/** SMTP is all-or-nothing: partial credentials fail at send time, which is too late to notice. */
export type MailConfig =
  | {
      readonly mode: 'smtp';
      readonly host: string;
      readonly port: number;
      readonly user: string;
      readonly pass: string;
      readonly from: string;
    }
  | { readonly mode: 'log' };

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongoUri: string;
  readonly corsOrigins: readonly string[];
  readonly tokens: TokenConfig;
  readonly terms: TermsConfig;
  readonly mail: MailConfig;
  /** Base URL of the React client. The reset link is built against it. */
  readonly frontendUrl: string;
}

interface RawEnv {
  readonly NODE_ENV: NodeEnv;
  readonly PORT: number;
  readonly MONGODB_URI: string;
  readonly CORS_ORIGINS: string;
  readonly ACCESS_TOKEN_SECRET: string;
  readonly ACCESS_TOKEN_TTL_SECONDS: number;
  readonly REFRESH_TOKEN_SECRET: string;
  readonly REFRESH_TOKEN_TTL_SECONDS: number;
  readonly TERMS_VERSION: string;
  readonly FRONTEND_URL: string;
  readonly SMTP_HOST?: string;
  readonly SMTP_PORT: number;
  readonly SMTP_USER?: string;
  readonly SMTP_PASS?: string;
  readonly MAIL_FROM?: string;
}

const MIN_SECRET_LENGTH = 32;
const DEFAULT_ACCESS_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TTL_SECONDS = 604_800;

const rawEnvSchema: Joi.ObjectSchema<RawEnv> = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
  CORS_ORIGINS: Joi.string().required(),

  ACCESS_TOKEN_SECRET: Joi.string().min(MIN_SECRET_LENGTH).required(),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(DEFAULT_ACCESS_TTL_SECONDS),
  REFRESH_TOKEN_SECRET: Joi.string()
    .min(MIN_SECRET_LENGTH)
    .disallow(Joi.ref('ACCESS_TOKEN_SECRET'))
    .required()
    .messages({ 'any.invalid': 'REFRESH_TOKEN_SECRET must not be the same value as ACCESS_TOKEN_SECRET.' }),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(DEFAULT_REFRESH_TTL_SECONDS),

  // No Terms document exists yet, so the default says so rather than naming a version that was
  // never published. The deployment replaces it the moment real Terms ship.
  TERMS_VERSION: Joi.string().trim().min(1).default('draft'),

  // Required: a reset email with the wrong link is worse than a server that refuses to start.
  FRONTEND_URL: Joi.string().uri({ scheme: ['http', 'https'] }).required(),

  SMTP_HOST: Joi.string().hostname().optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  MAIL_FROM: Joi.string().trim().min(1).optional(),
}).unknown(true);

/**
 * All four SMTP values or none. Three out of four is a deployment that looks configured and fails
 * on the first send, which is the failure this refuses to start with.
 */
const buildMailConfig = (value: RawEnv): MailConfig => {
  const supplied = [value.SMTP_HOST, value.SMTP_USER, value.SMTP_PASS, value.MAIL_FROM];
  const present = supplied.filter((entry) => entry !== undefined && entry !== '');

  if (present.length === 0) return { mode: 'log' };

  if (present.length !== supplied.length) {
    throw new Error(
      'SMTP is partially configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM together, ' +
        'or leave all four unset to run without sending mail.',
    );
  }

  return {
    mode: 'smtp',
    host: value.SMTP_HOST as string,
    port: value.SMTP_PORT,
    user: value.SMTP_USER as string,
    pass: value.SMTP_PASS as string,
    from: value.MAIL_FROM as string,
  };
};

/** Trailing slash removed once here, so no caller has to think about double slashes in a link. */
const normaliseBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const parseOrigins = (value: string): readonly string[] => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must list at least one allowed origin.');
  }

  return origins;
};

/**
 * An Access Token that outlives its Refresh Token inverts their purposes, so the process refuses to
 * start rather than serve a broken token model. Checked here because it spans two fields, which a
 * per-field schema rule cannot express once defaults are involved.
 */
const buildTokenConfig = (value: RawEnv): TokenConfig => {
  if (value.REFRESH_TOKEN_TTL_SECONDS <= value.ACCESS_TOKEN_TTL_SECONDS) {
    throw new Error(
      'REFRESH_TOKEN_TTL_SECONDS must be greater than ACCESS_TOKEN_TTL_SECONDS ' +
        `(got ${value.REFRESH_TOKEN_TTL_SECONDS} and ${value.ACCESS_TOKEN_TTL_SECONDS}).`,
    );
  }

  return {
    accessSecret: value.ACCESS_TOKEN_SECRET,
    accessTtlSeconds: value.ACCESS_TOKEN_TTL_SECONDS,
    refreshSecret: value.REFRESH_TOKEN_SECRET,
    refreshTtlSeconds: value.REFRESH_TOKEN_TTL_SECONDS,
  };
};

export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const { value, error } = rawEnvSchema.validate(source, { abortEarly: false, convert: true });

  if (error) {
    const problems = error.details.map((detail) => `  - ${detail.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    mongoUri: value.MONGODB_URI,
    corsOrigins: parseOrigins(value.CORS_ORIGINS),
    tokens: buildTokenConfig(value),
    terms: { version: value.TERMS_VERSION },
    mail: buildMailConfig(value),
    frontendUrl: normaliseBaseUrl(value.FRONTEND_URL),
  };
};
