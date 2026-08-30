import type { Types } from 'mongoose';

import type { ContractorSummaryDto } from '../browse/publicProfile.dto.js';
import type { RatingRepository } from '../ratings/rating.repository.js';
import { encodeNetworkCursor, decodeNetworkCursor } from './network.cursor.js';
import type { BlockedPageDto, NetworkGroup, NetworkPageDto } from './network.dto.js';
import type { NetworkEdge, NetworkPerson, NetworkRepository } from './network.repository.js';

export interface NetworkListInput {
  readonly group: NetworkGroup;
  readonly limit: number;
  readonly cursor?: string;
}

export interface BlockedListInput {
  readonly limit: number;
  readonly cursor?: string;
}

export interface NetworkService {
  list(viewerId: string, input: NetworkListInput): Promise<NetworkPageDto>;
  listBlocked(viewerId: string, input: BlockedListInput): Promise<BlockedPageDto>;
}

export interface NetworkDependencies {
  readonly network: NetworkRepository;
  readonly ratings: RatingRepository;
}

const RELATIONSHIP_OF: Record<NetworkGroup, ContractorSummaryDto['relationship']> = {
  connected: 'connected',
  incoming: 'incoming_request',
  outgoing: 'outgoing_request',
};

export const createNetworkService = ({ network, ratings }: NetworkDependencies): NetworkService => {
  const summarise = async (
    edges: readonly NetworkEdge[],
    relationship: ContractorSummaryDto['relationship'],
  ): Promise<Map<string, ContractorSummaryDto>> => {
    const ids = edges.map((edge) => edge.otherUserId);
    const [people, ratingSummaries] = await Promise.all([
      network.findPeople(ids),
      ratings.summaryForMany(ids),
    ]);

    const byId = new Map<string, NetworkPerson>(people.map((person) => [person._id.toString(), person]));
    const summaries = new Map<string, ContractorSummaryDto>();

    for (const id of ids) {
      const key = id.toString();
      const person = byId.get(key);
      if (person === undefined) continue;

      const rating = ratingSummaries.get(key);

      summaries.set(key, {
        userId: key,
        firstName: person.firstName,
        lastName: person.lastName,
        companyName: person.companyName ?? null,
        registrationCategory: person.registrationCategory,
        specialties: person.specialties ?? [],
        specialtyOther: person.specialtyOther ?? null,
        city: person.location?.city ?? null,
        region: person.location?.region ?? null,
        avatarUrl: person.avatar?.fileId ? `/api/browse/contractors/${key}/avatar` : null,
        availability: person.availability ?? null,
        relationship,
        rating: rating ? { average: rating.average, count: rating.count } : null,
        flexibility: null,
        drivingDistanceMeters: null,
      });
    }

    return summaries;
  };

  /** One row beyond the page is fetched, so the cursor is only issued when more genuinely exist. */
  const paginate = <T>(edges: readonly NetworkEdge[], limit: number, build: (edge: NetworkEdge) => T | null) => {
    const page = edges.slice(0, limit);
    const rows = page.flatMap((edge) => {
      const row = build(edge);
      return row === null ? [] : [row];
    });

    const last = page.at(-1);
    const nextCursor =
      edges.length > limit && last !== undefined
        ? encodeNetworkCursor({ at: last.at, id: last._id as Types.ObjectId })
        : null;

    return { rows, nextCursor };
  };

  return {
    async list(viewerId, { group, limit, cursor }) {
      const edges = await network.findEdges({
        userId: viewerId,
        group,
        cursor: decodeNetworkCursor(cursor),
        limit: limit + 1,
      });

      const summaries = await summarise(edges.slice(0, limit), RELATIONSHIP_OF[group]);

      return paginate(edges, limit, (edge) => {
        const person = summaries.get(edge.otherUserId.toString());
        return person === undefined ? null : { person, since: edge.at.toISOString() };
      });
    },

    async listBlocked(viewerId, { limit, cursor }) {
      const edges = await network.findBlocks({
        userId: viewerId,
        cursor: decodeNetworkCursor(cursor),
        limit: limit + 1,
      });

      // A blocked person has no relationship state to show: blocking is not a connection state.
      const summaries = await summarise(edges.slice(0, limit), 'none');

      return paginate(edges, limit, (edge) => {
        const person = summaries.get(edge.otherUserId.toString());
        return person === undefined ? null : { person, blockedAt: edge.at.toISOString() };
      });
    },
  };
};
