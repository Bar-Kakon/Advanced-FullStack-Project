import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { BlocksService } from '../blocks/blocks.service.js';
import { userRepository } from '../users/user.repository.js';
import { connectionRepository } from './connection.repository.js';
import { createConnectionsController } from './connections.controller.js';
import { createConnectionsService } from './connections.service.js';
import { connectionUserParamsSchema } from './connections.validation.js';
import { createRelationshipService, type RelationshipService } from './relationship.service.js';

export interface ConnectionsModule {
  readonly router: Router;
  /** Shared with discovery, so a card and a profile answer the same relationship rule. */
  readonly relationships: RelationshipService;
}

export const createConnectionsModule = (
  requireAccessToken: RequestHandler,
  blocks: BlocksService,
): ConnectionsModule => {
  const service = createConnectionsService({
    connections: connectionRepository,
    users: userRepository,
    blocks,
  });
  const controller = createConnectionsController(service);

  const router = Router();
  router.use(requireAccessToken);

  const params = validateRequest({ params: connectionUserParamsSchema });
  router.post('/:userId/request', params, controller.handleRequest);
  router.post('/:userId/accept', params, controller.handleAccept);
  router.post('/:userId/decline', params, controller.handleDecline);

  return { router, relationships: createRelationshipService({ connections: connectionRepository }) };
};
