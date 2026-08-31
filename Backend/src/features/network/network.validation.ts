import Joi from 'joi';

import { NETWORK_GROUPS, type NetworkGroup } from './network.dto.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export interface NetworkListQuery {
  readonly group: NetworkGroup;
  readonly limit: number;
  readonly cursor?: string;
}

export interface BlockedListQuery {
  readonly limit: number;
  readonly cursor?: string;
}

export const networkListQuerySchema = Joi.object<NetworkListQuery>({
  group: Joi.string()
    .valid(...NETWORK_GROUPS)
    .required(),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: Joi.string().max(200),
});

export const blockedListQuerySchema = Joi.object<BlockedListQuery>({
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: Joi.string().max(200),
});
