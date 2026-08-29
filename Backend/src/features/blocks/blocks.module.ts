import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { userRepository } from '../users/user.repository.js';
import { blockRepository } from './block.repository.js';
import { createBlocksController } from './blocks.controller.js';
import { createBlocksService, type BlocksService } from './blocks.service.js';
import { blockUserParamsSchema } from './blocks.validation.js';

export interface BlocksModule {
  readonly router: Router;
  /** Shared with discovery, so one rule decides who is hidden from whom. */
  readonly service: BlocksService;
}

export const createBlocksModule = (requireAccessToken: RequestHandler): BlocksModule => {
  const service = createBlocksService({ blocks: blockRepository, users: userRepository });
  const controller = createBlocksController(service);

  const router = Router();
  router.use(requireAccessToken);

  router.get('/', controller.handleListMine);
  router.put('/:userId', validateRequest({ params: blockUserParamsSchema }), controller.handleBlock);
  router.delete('/:userId', validateRequest({ params: blockUserParamsSchema }), controller.handleUnblock);

  return { router, service };
};
