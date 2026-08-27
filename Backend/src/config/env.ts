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

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongoUri: string;
  readonly corsOrigins: readonly string[];
  readonly tokens: TokenConfig;
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
}).unknown(true);

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
  };
};
