import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { NetworkService } from './network.service.js';
import type { BlockedListQuery, NetworkListQuery } from './network.validation.js';

export interface NetworkController {
  readonly handleList: RequestHandler;
  readonly handleListBlocked: RequestHandler;
}

export const createNetworkController = (service: NetworkService): NetworkController => ({
  handleList: async (req: Request, res: Response) => {
    const query = getValidated<NetworkListQuery>(res, 'query');

    const page = await service.list(getAuthenticatedUserId(res), {
      group: query.group,
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    res.json(page);
  },

  handleListBlocked: async (req: Request, res: Response) => {
    const query = getValidated<BlockedListQuery>(res, 'query');

    const page = await service.listBlocked(getAuthenticatedUserId(res), {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    res.json(page);
  },
});
