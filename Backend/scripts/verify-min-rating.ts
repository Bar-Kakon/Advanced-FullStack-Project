/** The minimum-rating filter, proved on the result set rather than on the query it was sent. */
import { Types } from 'mongoose';

import { RatingModel } from '../src/features/ratings/rating.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { cleanUp, createAccount, type Account } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'minrating-verify';
const TOKEN = `Rated${Date.now()}`;

interface Subject {
  readonly label: string;
  readonly account: Account;
  /** The average the seeded scores actually produce, or `null` for nobody. */
  readonly average: number | null;
}

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const viewer = await createAccount(baseUrl, MARKER, 1);
  const raterOne = await createAccount(baseUrl, MARKER, 2);
  const raterTwo = await createAccount(baseUrl, MARKER, 3);

  /*
   * Every average is produced by real ratings rather than written as a number, because that is how
   * a 2.5 exists in production: two people, two scores, one mean.
   */
  const scoresFor: Record<string, readonly number[]> = {
    unrated: [],
    '2.5': [2, 3],
    '3.0': [3, 3],
    '3.5': [3, 4],
    '4.0': [4, 4],
    '5.0': [5, 5],
  };

  const subjects: Subject[] = [];
  let index = 4;

  for (const [label, scores] of Object.entries(scoresFor)) {
    const account = await createAccount(baseUrl, MARKER, index);
    index += 1;

    await CompanyModel.updateOne({ _id: account.companyId }, { $set: { name: `${TOKEN} ${label} Ltd` } }).exec();
    for (const [position, score] of scores.entries()) {
      await RatingModel.create({
        rater: position === 0 ? raterOne.userId : raterTwo.userId,
        ratee: account.userId,
        score,
        task: new Types.ObjectId(),
      });
    }

    subjects.push({
      label,
      account,
      average: scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length,
    });
  }

  const idOf = (label: string): string =>
    subjects.find((s) => s.label === label)!.account.userId.toString();
  const labelsIn = (rows: { userId: string }[]): string[] =>
    subjects.filter((s) => rows.some((r) => r.userId === s.account.userId.toString()))
      .map((s) => s.label);

  const search = async (query: string) => {
    const answer = await request(baseUrl, 'GET', `/api/browse/contractors?${query}`, {
      token: viewer.token,
    });
    return {
      status: answer.status,
      rows: (answer.body['contractors'] ?? []) as { userId: string; rating: { average: number } | null }[],
      nextCursor: (answer.body['nextCursor'] ?? null) as string | null,
    };
  };

  /** Everything the seeded set contains, scoped by the run token so nothing else can leak in. */
  const scoped = (extra = ''): string => `q=${TOKEN}&limit=48${extra}`;

  section('1. The seeded set is what the test thinks it is');
  const everyone = await search(scoped());
  check(everyone.status === 200, 'the unfiltered search answers 200', everyone.status);
  check(labelsIn(everyone.rows).length === 6, 'all six contractors are discoverable',
    labelsIn(everyone.rows).sort().join(', '));

  for (const subject of subjects) {
    const row = everyone.rows.find((r) => r.userId === subject.account.userId.toString());
    const reported = row?.rating?.average ?? null;
    check(reported === subject.average,
      `the card for ${subject.label} reports the average it really has`, `${reported}`);
  }

  section('2. minRating=3 — the threshold is inclusive, and unrated is not a zero');
  const three = await search(scoped('&minRating=3'));
  const atThree = labelsIn(three.rows);
  check(!atThree.includes('2.5'), '2.5 is excluded', atThree.join(', '));
  check(atThree.includes('3.0'), '3.0 is included — exactly at the threshold');
  check(atThree.includes('3.5'), '3.5 is included');
  check(atThree.includes('4.0'), '4.0 is included');
  check(atThree.includes('5.0'), '5.0 is included');
  check(!atThree.includes('unrated'), 'unrated is excluded, never counted as a zero');
  check(atThree.length === 4, 'and nothing else came back', atThree.sort().join(', '));

  section('3. minRating=4');
  const four = await search(scoped('&minRating=4'));
  const atFour = labelsIn(four.rows);
  check(!atFour.includes('2.5') && !atFour.includes('3.0') && !atFour.includes('3.5'),
    'everything below 4 is excluded', atFour.join(', '));
  check(atFour.includes('4.0'), 'exactly 4.0 is included');
  check(atFour.includes('5.0'), 'above 4 is included');
  check(!atFour.includes('unrated'), 'unrated is excluded');
  check(atFour.length === 2, 'and nothing else came back', atFour.sort().join(', '));

  section('4. minRating=5 — only a real 5.0');
  const five = await search(scoped('&minRating=5'));
  const atFive = labelsIn(five.rows);
  check(atFive.length === 1 && atFive[0] === '5.0', 'only the 5.0 contractor', atFive.join(', '));

  section('5. Clearing the filter brings everybody back');
  const cleared = await search(scoped());
  check(labelsIn(cleared.rows).length === 6, 'all six again', labelsIn(cleared.rows).sort().join(', '));

  section('6. Every returned card really meets the floor it was filtered by');
  for (const floor of [3, 4, 5]) {
    const page = await search(scoped(`&minRating=${floor}`));
    const below = page.rows.filter((r) => (r.rating?.average ?? -1) < floor);
    check(below.length === 0, `minRating=${floor} returns nobody under ${floor}`,
      below.map((r) => r.rating?.average).join(', '));
    const missingRating = page.rows.filter((r) => r.rating === null);
    check(missingRating.length === 0, `minRating=${floor} returns nobody without a rating`,
      `${missingRating.length}`);
  }

  section('7. Combined with the other filters');
  const combos: [string, string, string[]][] = [
    ['text search', `q=${TOKEN} 5.0&limit=48&minRating=3`, ['5.0']],
    ['specialty', `${scoped('&minRating=3')}&specialty=drilling`, ['3.0', '3.5', '4.0', '5.0']],
    ['region', `${scoped('&minRating=3')}&region=haifa`, ['3.0', '3.5', '4.0', '5.0']],
    ['availability', `${scoped('&minRating=3')}&availability=open`, ['3.0', '3.5', '4.0', '5.0']],
    ['a specialty nobody has', `${scoped('&minRating=3')}&specialty=plumbing`, []],
    ['a region nobody is in', `${scoped('&minRating=3')}&region=south`, []],
  ];

  for (const [name, query, expected] of combos) {
    const page = await search(query);
    const got = labelsIn(page.rows).sort();
    check(JSON.stringify(got) === JSON.stringify([...expected].sort()),
      `minRating=3 combined with ${name}`, `${got.join(', ') || 'none'}`);
  }

  section('8. Pagination — no duplicate, and nobody eligible is skipped');
  const walked: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const page: { rows: { userId: string }[]; nextCursor: string | null } = await search(
      `q=${TOKEN}&limit=2&minRating=3${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    walked.push(...page.rows.map((r) => r.userId));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 20);

  check(cursor === null, 'paging terminates', `${pages} pages`);
  check(new Set(walked).size === walked.length, 'no contractor appeared twice',
    `${walked.length} rows, ${new Set(walked).size} unique`);

  const eligibleIds = ['3.0', '3.5', '4.0', '5.0'].map(idOf);
  check(eligibleIds.every((id) => walked.includes(id)),
    'every eligible contractor was reached across the pages',
    `${walked.length} of ${eligibleIds.length} expected`);
  check(!walked.includes(idOf('2.5')) && !walked.includes(idOf('unrated')),
    'and no ineligible contractor slipped in on a later page');

  section('9. The filter is the server’s, not the client’s');
  const anonymous = await request(baseUrl, 'GET', '/api/browse/contractors?minRating=3');
  check(anonymous.status === 401, 'an unauthenticated caller is refused', anonymous.status);

  const belowRange = await search(scoped('&minRating=0'));
  check(belowRange.status === 400, 'a floor under the scale is refused', belowRange.status);
  const aboveRange = await search(scoped('&minRating=6'));
  check(aboveRange.status === 400, 'a floor over the scale is refused', aboveRange.status);
  const notANumber = await search(scoped('&minRating=high'));
  check(notANumber.status === 400, 'a non-numeric floor is refused', notANumber.status);

  section('10. A half-star floor works too, because the scale allows one');
  const twoAndAHalf = await search(scoped('&minRating=2.5'));
  const atTwoFive = labelsIn(twoAndAHalf.rows);
  check(atTwoFive.includes('2.5'), '2.5 meets a 2.5 floor exactly', atTwoFive.sort().join(', '));
  check(!atTwoFive.includes('unrated'), 'and unrated still does not');
  check(atTwoFive.length === 5, 'everyone rated is included', atTwoFive.sort().join(', '));

  await RatingModel.deleteMany({ ratee: { $in: subjects.map((s) => s.account.userId) } }).exec();
  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});