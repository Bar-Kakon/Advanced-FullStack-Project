import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { BlocksService } from './blocks.service.js';
import type { BlockUserParams } from './blocks.validation.js';

export interface BlocksController {
  readonly handleBlock: RequestHandler;
  readonly handleUnblock: RequestHandler;
  readonly handleListMine: RequestHandler;
}

export const createBlocksController = (service: BlocksService): BlocksController => ({
  handleBlock: async (req: Request, res: Response) => {
    const { userId } = getValidated<BlockUserParams>(res, 'params');
    await service.block(getAuthenticatedUserId(res), userId);

    res.status(201).json({ blocked: true });
  },

  handleUnblock: async (req: Request, res: Response) => {
    const { userId } = getValidated<BlockUserParams>(res, 'params');
    await service.unblock(getAuthenticatedUserId(res), userId);

    res.json({ blocked: false });
  },

  /** Only what this caller blocked, which is the list My Network will offer Unblock from. */
  handleListMine: async (req: Request, res: Response) => {
    const blocks = await service.listMyBlocks(getAuthenticatedUserId(res));

    res.json({ blocks });
  },
});
