import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { ConnectionsService } from './connections.service.js';
import type { ConnectionUserParams } from './connections.validation.js';

export interface ConnectionsController {
  readonly handleRequest: RequestHandler;
  readonly handleAccept: RequestHandler;
  readonly handleDecline: RequestHandler;
  readonly handleRemove: RequestHandler;
  readonly handleWithdraw: RequestHandler;
}

export const createConnectionsController = (service: ConnectionsService): ConnectionsController => ({
  handleRequest: async (req: Request, res: Response) => {
    const { userId } = getValidated<ConnectionUserParams>(res, 'params');
    await service.request(getAuthenticatedUserId(res), userId);

    res.status(201).json({ state: 'outgoing_request' });
  },

  handleAccept: async (req: Request, res: Response) => {
    const { userId } = getValidated<ConnectionUserParams>(res, 'params');
    await service.accept(getAuthenticatedUserId(res), userId);

    res.json({ state: 'connected' });
  },

  handleDecline: async (req: Request, res: Response) => {
    const { userId } = getValidated<ConnectionUserParams>(res, 'params');
    await service.decline(getAuthenticatedUserId(res), userId);

    res.json({ state: 'none' });
  },

  handleRemove: async (req: Request, res: Response) => {
    const { userId } = getValidated<ConnectionUserParams>(res, 'params');
    await service.remove(getAuthenticatedUserId(res), userId);

    res.json({ state: 'none' });
  },

  handleWithdraw: async (req: Request, res: Response) => {
    const { userId } = getValidated<ConnectionUserParams>(res, 'params');
    await service.withdraw(getAuthenticatedUserId(res), userId);

    res.json({ state: 'none' });
  },
});
