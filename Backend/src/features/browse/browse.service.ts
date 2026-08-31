import { Types } from 'mongoose';

import type { BlocksService } from '../blocks/blocks.service.js';
import type { RelationshipService } from '../connections/relationship.service.js';
import type { RatingRepository } from '../ratings/rating.repository.js';
import type { RoutesAdapter } from '../location/routes.adapter.js';
import type { Availability } from '../companies/company.model.js';
import type { Region, RegistrationCategory, Specialty } from '../users/user.model.js';
import { decodeCursor, encodeCursor } from './browse.cursor.js';
import type { BrowseCandidate, BrowseRepository, BrowseSort } from './browse.repository.js';
import type { BrowsePageDto, ContractorSummaryDto } from './publicProfile.dto.js';

export interface BrowseFilters {
  readonly text?: string;
  /** Which registration routes to search. Absent searches all three. */
  readonly categories?: readonly RegistrationCategory[];
  readonly specialties?: readonly Specialty[];
  readonly regions?: readonly Region[];
  readonly availability?: readonly Availability[];
  /** Explicit willingness: matched against the contractor's own approved list. */
  readonly approvedPlaceId?: string;
  /** Driving distance: a road-distance question answered by the routing service. */
  readonly originPlaceId?: string;
  readonly maxDrivingKm?: number;
  /** A floor on the average a contractor has actually been given. Never a default or a guess. */
  readonly minRating?: number;
  readonly sort: BrowseSort;
  readonly cursor?: string;
  readonly limit: number;
}

export interface BrowseService {
  search(viewerId: string, filters: BrowseFilters): Promise<BrowsePageDto>;
}

export interface BrowseDependencies {
  readonly browse: BrowseRepository;
  readonly blocks: BlocksService;
  readonly relationships: RelationshipService;
  readonly ratings: RatingRepository;
  readonly routes: RoutesAdapter;
}

/** Fetched a little wider than the page, so a distance filter can drop rows and still fill it. */
const OVERFETCH_FACTOR = 3;

/** Mirrors the repository's unrated key, so a rating cursor keeps the same order it paged in. */
const UNRATED_CURSOR_SCORE = -1;

export const createBrowseService = ({
  browse,
  blocks,
  relationships,
  ratings,
  routes,
}: BrowseDependencies): BrowseService => ({
  async search(viewerId, filters) {
    // One indexed read resolves every person hidden from this viewer, in either direction.
    const hidden = await blocks.hiddenUserIdsFor(viewerId);
    const excludeUserIds = Types.ObjectId.isValid(viewerId)
      ? [new Types.ObjectId(viewerId), ...hidden]
      : [...hidden];

    const wantsDistance = Boolean(filters.originPlaceId && filters.maxDrivingKm);
    const wantsRating = filters.minRating !== undefined;
    const fetchLimit = wantsDistance || wantsRating
      ? filters.limit * OVERFETCH_FACTOR
      : filters.limit + 1;

    const candidates = await browse.find({
      excludeUserIds,
      ...(filters.text === undefined ? {} : { text: filters.text }),
      ...(filters.categories === undefined ? {} : { categories: filters.categories }),
      ...(filters.specialties === undefined ? {} : { specialties: filters.specialties }),
      ...(filters.regions === undefined ? {} : { regions: filters.regions }),
      ...(filters.availability === undefined ? {} : { availability: filters.availability }),
      ...(filters.approvedPlaceId === undefined ? {} : { approvedPlaceId: filters.approvedPlaceId }),
      sort: filters.sort,
      cursor: decodeCursor(filters.cursor),
      limit: fetchLimit,
    });

    const { kept, distances, degraded } = wantsDistance
      ? await applyDrivingDistance(routes, candidates, filters.originPlaceId!, filters.maxDrivingKm!)
      : { kept: candidates, distances: new Map<string, number>(), degraded: false };

    /*
     * A minimum rating asks for standing a contractor has actually been given, so somebody with no
     * ratings at all cannot meet one. They are excluded rather than counted as zero, which would
     * be inventing a score for them.
     */
    const ratedSummaries = wantsRating
      ? await ratings.summaryForMany(kept.map((candidate) => candidate._id))
      : null;

    const eligible = ratedSummaries === null
      ? kept
      : kept.filter((candidate) => {
          const summary = ratedSummaries.get(candidate._id.toString());
          return summary !== undefined && summary.average >= filters.minRating!;
        });

    const page = eligible.slice(0, filters.limit);
    const exhausted = candidates.length < fetchLimit;
    const cursorAnchor = page.length === filters.limit ? page.at(-1) : candidates.at(-1);
    const hasMore = !exhausted || eligible.length > filters.limit;

    const ids = page.map((candidate) => candidate._id);
    const [relationshipStates, ratingSummaries] = await Promise.all([
      relationships.forCandidates(viewerId, ids),
      ratedSummaries ?? ratings.summaryForMany(ids),
    ]);

    const contractors: ContractorSummaryDto[] = page.map((candidate) => {
      const id = candidate._id.toString();
      const summary = ratingSummaries.get(id);

      return {
        userId: id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        companyName: candidate.companyName,
        registrationCategory: candidate.registrationCategory,
        specialties: candidate.specialties ?? [],
        specialtyOther: candidate.specialtyOther ?? null,
        city: candidate.location?.city ?? null,
        region: candidate.location?.region ?? null,
        avatarUrl: candidate.avatar?.fileId ? `/api/browse/contractors/${id}/avatar` : null,
        availability: candidate.availability,
        relationship: relationshipStates.get(id) ?? 'none',
        rating: summary ? { average: summary.average, count: summary.count } : null,
        flexibility: null,
        drivingDistanceMeters: distances.get(id) ?? null,
      };
    });

    // The cursor names a position in whichever order the page was built in.
    const nextCursor = hasMore && cursorAnchor
      ? filters.sort === 'rating_desc'
        ? encodeCursor({
            kind: 'rating',
            score: cursorAnchor.ratingSortKey ?? UNRATED_CURSOR_SCORE,
            id: cursorAnchor._id,
          })
        : encodeCursor({ kind: 'discovery', createdAt: cursorAnchor.createdAt, id: cursorAnchor._id })
      : null;

    return { contractors, nextCursor, distanceFilterDegraded: degraded };
  },
});

/**
 * One Route Matrix call for the whole page, keyed by each contractor's structured base place.
 * A contractor with no structured place cannot be measured by road and is dropped from a distance
 * filter — reported through `degraded` rather than silently treated as far away.
 *
 * Database order is preserved, because the cursor names a position in that order.
 */
const applyDrivingDistance = async (
  routes: RoutesAdapter,
  candidates: readonly BrowseCandidate[],
  originPlaceId: string,
  maxDrivingKm: number,
): Promise<{ kept: BrowseCandidate[]; distances: Map<string, number>; degraded: boolean }> => {
  const routable = candidates.filter((candidate) => candidate.location?.place?.placeId);
  const distances = new Map<string, number>();
  let degraded = candidates.length !== routable.length;

  if (routable.length === 0) return { kept: [], distances, degraded };

  const destinationPlaceIds = [
    ...new Set(routable.map((candidate) => candidate.location!.place!.placeId)),
  ];
  const matrix = await routes.computeRouteMatrix(originPlaceId, destinationPlaceIds);
  const byPlaceId = new Map(matrix.map((row) => [row.destinationPlaceId, row]));

  const limitMeters = maxDrivingKm * 1000;
  const kept: BrowseCandidate[] = [];

  for (const candidate of routable) {
    const route = byPlaceId.get(candidate.location!.place!.placeId);

    // A failed route is an infrastructure problem, never evidence the contractor is too far.
    if (!route || route.status === 'failed') {
      degraded = true;
      continue;
    }
    if (route.status === 'no_route' || route.distanceMeters === null) continue;
    if (route.distanceMeters > limitMeters) continue;

    distances.set(candidate._id.toString(), route.distanceMeters);
    kept.push(candidate);
  }

  return { kept, distances, degraded };
};