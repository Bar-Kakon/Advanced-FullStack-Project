import Joi from 'joi';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongoUri: string;
  readonly corsOrigins: readonly string[];
}

interface RawEnv {
  readonly NODE_ENV: NodeEnv;
  readonly PORT: number;
  readonly MONGODB_URI: string;
  readonly CORS_ORIGINS: string;
}

const rawEnvSchema: Joi.ObjectSchema<RawEnv> = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
  CORS_ORIGINS: Joi.string().required(),
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
  };
};
