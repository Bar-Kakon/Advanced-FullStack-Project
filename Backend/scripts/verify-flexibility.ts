/**
 * The Flexibility Score: the closed formula, the event classification, the privacy of the
 * explanatory context, and the real coordination adapter that now feeds it.
 */
import { Types } from 'mongoose';

import { outcomeOf } from '../src/features/coordination/coordinationOutcome.adapter.js';
import type { HandoffRecord } from '../src/features/coordination/handoff.model.js';
import type { ProposalItemRecord, ProposalRecord } from '../src/features/coordination/proposal.model.js';

import {
  computeFlexibility,
  isScoreRelevant,
  isWorkableResolution,
  type CoordinationEvent,
  type CoordinationOutcome,
} from '../src/features/flexibility/flexibility.js';
import {
  flexibilitySubjectOf,
  unbuiltCoordinationOutcomePort,
  type CoordinationOutcomePort,
} from '../src/features/flexibility/coordinationOutcome.port.js';
import { createFlexibilityService } from '../src/features/flexibility/flexibility.service.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const event = (
  outcome: CoordinationOutcome,
  over: Partial<CoordinationEvent> = {},
): CoordinationEvent => ({
  dimension: 'schedule',
  outcome,
  requestedByCounterparty: true,
  noticeDays: 7,
  ...over,
});

const scheduleOf = (events: readonly CoordinationEvent[]) => computeFlexibility(events).schedule;

const portOf = (events: readonly CoordinationEvent[]): CoordinationOutcomePort => ({
  available: true,
  async eventsFor() {
    return events;
  },
});

const run = async (): Promise<void> => {
  const harness = await startHarness();

  section('1. A resolved acceptance is a positive outcome');
  const accepted = scheduleOf([event('accepted')]);
  check(accepted?.score === 100, 'one accepted change scores 100', accepted?.score);
  check(accepted?.context.events === 1, 'and counts as one relevant event', accepted?.context.events);

  section('2. A counter that reached a workable solution scores the same as an acceptance');
  for (const outcome of ['counter_agreed', 'alternative_agreed', 'other_solution_agreed'] as const) {
    const agreed = scheduleOf([event(outcome)]);
    check(agreed?.score === accepted?.score, `${outcome} carries the same base value as accepted`,
      agreed?.score);
    check(isWorkableResolution(outcome), `${outcome} is classified as a workable resolution`);
  }
  const mixed = scheduleOf([event('accepted'), event('counter_agreed'), event('alternative_agreed')]);
  check(mixed?.score === 100, 'negotiating never lowers a score where the work was kept', mixed?.score);

  section('3. A justified decline does not hurt the score');
  const withDecline = scheduleOf([event('accepted'), event('declined_justified')]);
  check(withDecline?.score === 100, 'a justified decline beside an acceptance leaves 100',
    withDecline?.score);
  check(withDecline?.context.events === 1,
    'because it is excluded from the denominator, not merely from the numerator',
    withDecline?.context.events);
  check(withDecline?.context.justifiedDeclines === 1,
    'it is still reported honestly as context', withDecline?.context.justifiedDeclines);
  check(!isScoreRelevant('declined_justified'), 'and is classified as not score-relevant');
  const onlyDeclines = scheduleOf([event('declined_justified'), event('declined_justified')]);
  check(onlyDeclines === null, 'declines alone produce no score at all, rather than zero',
    String(onlyDeclines));

  section('4. Only resolved outcomes count');
  const noEvents = scheduleOf([]);
  check(noEvents === null, 'a contractor with no resolved event has no score, never zero',
    String(noEvents));
  check(computeFlexibility([]).scope === null, 'and no scope score either');

  section('5. An unresolved failure is the negative case');
  const failed = scheduleOf([event('unresolved_replaced')]);
  check(failed?.score === 0, 'work that fell through with no justification scores 0', failed?.score);
  const half = scheduleOf([event('accepted'), event('unresolved_replaced')]);
  check(half?.score === 50, 'one of each is 50', half?.score);
  check(half?.context.unresolvedFailures === 1, 'and the failure is counted',
    half?.context.unresolvedFailures);

  section('6. History begins at one event and updates continuously');
  check(scheduleOf([event('accepted')])?.score === 100, 'one qualifying event is enough to score');
  const four = [event('accepted'), event('counter_agreed'), event('unresolved_replaced'), event('accepted')];
  check(scheduleOf(four)?.score === 75, 'adding events moves the number', scheduleOf(four)?.score);
  check(scheduleOf(four)?.context.events === 4, 'and the viewer is told how much evidence there is',
    scheduleOf(four)?.context.events);
  const older = scheduleOf([event('unresolved_replaced'), event('accepted'), event('accepted')]);
  const newer = scheduleOf([event('accepted'), event('accepted'), event('unresolved_replaced')]);
  check(older?.score === newer?.score, 'order carries no weight — there is no ageing or decay',
    `${older?.score} vs ${newer?.score}`);

  section('7. Notice and requester are context, never hidden arithmetic');
  const late = scheduleOf([event('accepted', { noticeDays: 0 })]);
  const early = scheduleOf([event('accepted', { noticeDays: 30 })]);
  check(late?.score === early?.score, 'notice given does not change the score',
    `${late?.score} vs ${early?.score}`);
  const byOther = scheduleOf([event('accepted', { requestedByCounterparty: true })]);
  const bySelf = scheduleOf([event('accepted', { requestedByCounterparty: false })]);
  check(byOther?.score === bySelf?.score, 'who asked for the change does not change the score',
    `${byOther?.score} vs ${bySelf?.score}`);
  const spread = scheduleOf([
    event('accepted', { noticeDays: 14, requestedByCounterparty: true }),
    event('counter_agreed', { noticeDays: null, requestedByCounterparty: false }),
  ]);
  check(spread?.context.withAdvanceNotice === 1, 'advance notice is reported as a count',
    spread?.context.withAdvanceNotice);
  check(spread?.context.noticeUnknown === 1, 'and an unknown notice is admitted, not assumed',
    spread?.context.noticeUnknown);
  check(spread?.context.changesRequestedByCounterparty === 1
    && spread?.context.changesRequestedBySelf === 1,
    'who requested each change is reported as counts on both sides');

  section('8. The two dimensions are scored separately');
  const both = computeFlexibility([event('accepted'), event('unresolved_replaced', { dimension: 'scope' })]);
  check(both.schedule?.score === 100, 'schedule evidence scores on its own', both.schedule?.score);
  check(both.scope?.score === 0, 'scope evidence scores on its own', both.scope?.score);
  const scheduleOnly = computeFlexibility([event('accepted')]);
  check(scheduleOnly.scope === null,
    'and with no scope evidence the scope dimension is null, not a fabricated zero',
    String(scheduleOnly.scope));

  section('9. Delegation attributes the outcome to the delegator');
  const delegator = new Types.ObjectId();
  const delegate = new Types.ObjectId();
  const subject = flexibilitySubjectOf({ assignee: delegator, delegation: { delegate } });
  check(String(subject) === String(delegator), 'the responsible party carries the impact',
    String(subject));
  check(String(subject) !== String(delegate), 'and the confidential delegate never does');
  check(flexibilitySubjectOf({ delegation: { delegate } }) === null,
    'orphaned work attributes to nobody rather than falling to the delegate');

  section('10. The explanatory context is aggregate only');
  const context = scheduleOf(four)?.context;
  const values = Object.values(context ?? {});
  check(values.length > 0 && values.every((value) => typeof value === 'number'),
    'every field the viewer receives is a number', values.join(','));
  const serialized = JSON.stringify(context);
  const leaks = ['name', 'project', 'task', 'user', 'date', 'reason', 'counterparty', 'Id', '_id'];
  check(leaks.every((word) => !serialized.includes(word)),
    'so no name, project, task, date, reason or counterparty can travel with it', serialized);

  section('11. The score is server-derived and cannot be submitted');
  const service = createFlexibilityService(portOf([event('accepted'), event('unresolved_replaced')]));
  const view = await service.forUser('anyone');
  check(view?.schedule?.score === 50, 'the service computes from the port', view?.schedule?.score);
  const unbuilt = createFlexibilityService(unbuiltCoordinationOutcomePort);
  check((await unbuilt.forUser('anyone')) === null,
    'and answers null while the outcome domain is unbuilt',
    String(await unbuilt.forUser('anyone')));
  check(unbuiltCoordinationOutcomePort.available === false,
    'the port says plainly that it cannot answer yet');

  section('12. The real adapter maps resolved proposal outcomes, and only resolved ones');
  const proposalOf = (over: Partial<ProposalRecord> = {}): ProposalRecord =>
    ({ changes: {}, requestedBy: new Types.ObjectId(), ...over }) as ProposalRecord;
  const itemOf = (over: Partial<ProposalItemRecord> = {}): ProposalItemRecord =>
    ({ response: 'pending', resolution: 'none', excluded: false, ...over }) as ProposalItemRecord;

  check(
    outcomeOf(proposalOf(), itemOf({ response: 'accepted', resolution: 'proposed' })) === 'accepted',
    'an acceptance the resolver applied is a direct acceptance',
  );
  check(
    outcomeOf(
      proposalOf({ changes: { alternativeStart: new Date() } }),
      itemOf({ response: 'accepted', resolution: 'proposed' }),
    ) === 'alternative_agreed',
    'accepting a request that offered an alternate date is an agreed alternative',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'countered', resolution: 'counter' })) === 'counter_agreed',
    'a counter the resolver accepted is a workable resolution',
  );
  check(
    outcomeOf(
      proposalOf(),
      itemOf({ response: 'declined', resolution: 'none', declineReason: 'materials_not_arrived' }),
    ) === 'declined_justified',
    'a decline carrying an approved reason is the neutral case',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'declined', resolution: 'none' })) === null,
    'a decline with no reason and no replacement produces no event at all',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'other_proposed', resolution: 'other' })) === 'other_solution_agreed',
    'an other workable solution both sides agreed to is its own positive outcome',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'other_proposed', resolution: 'none' })) === null,
    'while one the resolver did not agree to produces nothing',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'declined', resolution: 'replaced' })) === null,
    'a replacement with no completed handover is not yet an outcome',
  );
  const handoverFor = (item: ProposalItemRecord, at: Date) => [
    {
      state: 'accepted',
      task: item.task,
      from: item.respondent,
      decidedAt: at,
    } as unknown as HandoffRecord,
  ];
  const replacedItem = itemOf({
    response: 'declined',
    resolution: 'replaced',
    task: new Types.ObjectId(),
    respondent: new Types.ObjectId(),
  });
  const resolvedProposal = proposalOf({
    resolution: { by: new Types.ObjectId(), at: new Date(2027, 0, 1) },
  });
  check(
    outcomeOf(resolvedProposal, replacedItem, handoverFor(replacedItem, new Date(2027, 0, 2))) ===
      'unresolved_replaced',
    'and it becomes the negative case only once responsibility really moved',
  );
  check(outcomeOf(proposalOf(), itemOf()) === null, 'a pending item is not an outcome');
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'accepted', resolution: 'none' })) === null,
    'nor is an acceptance the resolver never applied — elapsed time alone scores nothing',
  );
  check(
    outcomeOf(proposalOf(), itemOf({ response: 'accepted', resolution: 'proposed', excluded: true })) === null,
    'and excluded work is outside the score entirely',
  );

  const workable = [
    outcomeOf(proposalOf(), itemOf({ response: 'accepted', resolution: 'proposed' })),
    outcomeOf(proposalOf(), itemOf({ response: 'countered', resolution: 'counter' })),
    outcomeOf(proposalOf(), itemOf({ response: 'other_proposed', resolution: 'other' })),
    outcomeOf(
      proposalOf({ changes: { alternativeDue: new Date() } }),
      itemOf({ response: 'accepted', resolution: 'proposed' }),
    ),
  ].filter((outcome): outcome is CoordinationOutcome => outcome !== null);
  check(
    scheduleOf(workable.map((outcome) => event(outcome)))?.score === 100,
    'all four of them carry exactly the same weight',
    String(scheduleOf(workable.map((outcome) => event(outcome)))?.score),
  );

  section('13. Only the schedule dimension has evidence');
  const fromAdapter = workable.map((outcome) => event(outcome));
  check(computeFlexibility(fromAdapter).scope === null,
    'the scope dimension stays null, because a date proposal is not scope-change evidence');
  check(computeFlexibility(fromAdapter).schedule !== null, 'while the schedule dimension is real');

  const { baseUrl } = harness;
  const stamp = Date.now();
  const email = `flex-${stamp}@example.com`;
  const created = await request(baseUrl, 'POST', '/api/auth/register', {
    json: {
      firstName: 'Flex', lastName: 'Verify', standing: 'owner', contractorCategory: 'subcontractor',
      companyName: `Flex ${stamp} Ltd`, email,
      password: 'CorrectHorse42!', confirmPassword: 'CorrectHorse42!',
      registrationCategory: 'contractor', specialty: 'electrical',
      city: 'חיפה', region: 'haifa', availability: 'open',
      acceptedTerms: true, operationalEmail: true,
    },
  });
  check(created.status === 201, 'a real account exists to read a profile for', created.status);
  const signedIn = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email, password: 'CorrectHorse42!' },
  });
  const token = signedIn.body['accessToken'] as string;

  const me = await request(baseUrl, 'GET', '/api/users/me', { token });
  const profile = me.body['user'] as Record<string, unknown>;
  check('flexibility' in profile, 'the profile carries the flexibility field');
  check(profile['flexibility'] === null,
    'and it is null over the wire while nothing can be computed — not 0',
    JSON.stringify(profile['flexibility']));

  const patched = await request(baseUrl, 'PATCH', '/api/users/me', {
    token,
    json: { flexibility: { schedule: { score: 100, context: { events: 99 } } } },
  });
  const after = await request(baseUrl, 'GET', '/api/users/me', { token });
  check((after.body['user'] as Record<string, unknown>)['flexibility'] === null,
    'a client that submits its own score changes nothing',
    `${patched.status} ${JSON.stringify((after.body['user'] as Record<string, unknown>)['flexibility'])}`);

  await finish(harness);
};

void run();
