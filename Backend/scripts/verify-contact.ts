/**
 * Landing-page contact submission, end to end, against the real server.
 *
 * What it proves: the endpoint is public, a legitimate message is stored, the receipt tells the
 * sender nothing beyond that, the storage-only fields cannot be written from the body, there is no
 * route that reads a message back, and the limiter fires.
 *
 * The field bounds are checked against the schema directly rather than over HTTP. The limiter sits
 * in front of validation on purpose — a flood is refused without being parsed — so it counts
 * rejected requests too, and ten malformed bodies would spend the whole budget before the flood
 * check could run. The schema is the contract; one malformed request over HTTP proves it is wired
 * in, and the rest are checked where no limiter stands in the way.
 *
 * It spends the whole contact budget, so it needs a freshly started server: the counter lives in
 * memory and resets when the process does.
 */
import { ContactMessageModel } from '../src/features/contact/contactMessage.model.js';
import { submitContactMessageBodySchema } from '../src/features/contact/contact.validation.js';
import { CONTACT_SUBMISSION_RATE_LIMIT } from '../src/middleware/rateLimit.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = `verify-contact-${Date.now()}`;
const address = (suffix: string) => `${MARKER}.${suffix}@example.com`;

const valid = {
  name: 'Dana Levi',
  email: address('ok'),
  topic: 'support',
  message: 'שאלה על קישור בין משימות בפרויקט קיים.',
  language: 'he',
} as const;

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;

  const post = (json: unknown) => request(baseUrl, 'POST', '/api/contact/messages', { json });
  const idOf = (body: unknown) => (body as { message?: { id?: string } }).message?.id;
  await ContactMessageModel.deleteMany({ email: new RegExp(MARKER, 'i') }).exec();

  section('1. Every field is bounded — checked against the schema the route mounts');
  const rejects: readonly (readonly [string, unknown])[] = [
    ['a missing name is refused', { ...valid, name: undefined }],
    ['a one-character name is refused', { ...valid, name: 'A' }],
    ['a 101-character name is refused', { ...valid, name: 'x'.repeat(101) }],
    ['a malformed address is refused', { ...valid, email: 'not-an-address' }],
    ['a missing address is refused', { ...valid, email: undefined }],
    ['a 255-character address is refused', { ...valid, email: `${'x'.repeat(245)}@example.com` }],
    ['an unknown topic is refused', { ...valid, topic: 'billing' }],
    ['a missing topic is refused', { ...valid, topic: undefined }],
    ['a missing message is refused', { ...valid, message: undefined }],
    ['a 9-character message is refused', { ...valid, message: 'too short' }],
    ['a 2001-character message is refused', { ...valid, message: 'x'.repeat(2001) }],
    ['an unknown language is refused', { ...valid, language: 'fr' }],
  ];
  for (const [description, body] of rejects) {
    check(submitContactMessageBodySchema.validate(body).error !== undefined, description);
  }

  const accepted = submitContactMessageBodySchema.validate(valid);
  check(accepted.error === undefined, 'a legitimate body is accepted', accepted.error?.message);
  const defaulted = submitContactMessageBodySchema.validate({ ...valid, language: undefined });
  check(defaulted.error === undefined, 'the language may be omitted', defaulted.error?.message);
  check(defaulted.value.language === 'he', 'and it defaults to Hebrew, the product default', defaulted.value.language);

  section('2. The endpoint is public — a signed-out visitor is who it exists for');
  const sent = await post(valid);
  check(sent.status === 201, 'a message from an unauthenticated caller is accepted', sent.status);

  const receipt = (sent.body as { message?: { id?: string; createdAt?: string } }).message;
  check(typeof receipt?.id === 'string', 'a receipt with an id comes back', JSON.stringify(sent.body));
  check(typeof receipt?.createdAt === 'string', 'the receipt carries the arrival time', JSON.stringify(sent.body));
  check(
    Object.keys(receipt ?? {}).length === 2,
    'the receipt carries nothing else — no inbox address and no delivery status',
    Object.keys(receipt ?? {}),
  );

  section('3. The message is really stored — the success state is not decorative');
  const stored = await ContactMessageModel.findById(receipt?.id).lean().exec();
  check(stored !== null, 'the document exists in contactMessages');
  check(stored?.name === valid.name, 'the name is stored', stored?.name);
  check(stored?.email === valid.email, 'the address is stored, lowercased', stored?.email);
  check(stored?.topic === valid.topic, 'the topic code is stored', stored?.topic);
  check(stored?.message === valid.message, 'the message body is stored verbatim', stored?.message);
  check(stored?.language === 'he', 'the language the form was in is stored', stored?.language);
  check(stored?.status === 'new', 'a new message opens as new', stored?.status);

  section('4. A sender cannot write a field that is not theirs');
  const crafted = await post({
    ...valid,
    email: address('crafted'),
    language: undefined,
    status: 'handled',
    notifiedAt: new Date().toISOString(),
  });
  check(crafted.status === 201, 'the unknown keys are stripped rather than rejected', crafted.status);
  const craftedDoc = await ContactMessageModel.findById(idOf(crafted.body)).lean().exec();
  check(craftedDoc?.status === 'new', 'the crafted status did not take — it is still new', craftedDoc?.status);
  check(craftedDoc?.notifiedAt === undefined, 'the crafted delivery timestamp did not take', craftedDoc?.notifiedAt);
  check(craftedDoc?.language === 'he', 'and the omitted language really defaulted on the way in', craftedDoc?.language);

  section('5. The schema is wired into the route, not merely present');
  const malformed = await post({ ...valid, email: 'not-an-address' });
  check(malformed.status === 400, 'a malformed body is refused over HTTP too', malformed.status);
  check(
    (malformed.body as { code?: string }).code === 'REQUEST_VALIDATION_FAILED',
    'and the refusal uses the shared validation contract',
    malformed.body,
  );

  section('6. Submission is the only thing this router does');
  const listed = await request(baseUrl, 'GET', '/api/contact/messages', {});
  check(listed.status === 404, 'there is no route that lists stored messages', listed.status);
  const read = await request(baseUrl, 'GET', `/api/contact/messages/${receipt?.id}`, {});
  check(read.status === 404, 'there is no route that reads one back', read.status);

  section('7. The limiter is mounted, and it is the last word');
  // Three of the budget are already spent above — the accepted pair and the malformed one, which
  // counts because the limiter runs before validation.
  const spent = 3;
  const remaining = CONTACT_SUBMISSION_RATE_LIMIT.limit - spent;
  let allowed = 0;
  let blocked: { status: number; body: unknown } | null = null;

  for (let attempt = 0; attempt < remaining + 2; attempt += 1) {
    const response = await post({ ...valid, email: address(`flood-${attempt}`) });
    if (response.status === 429) {
      blocked = response;
      break;
    }
    allowed += 1;
  }

  check(allowed === remaining, `exactly the remaining ${remaining} of the budget got through`, allowed);
  check(blocked !== null, 'a flood from one address is then refused');
  check(
    (blocked?.body as { code?: string } | undefined)?.code === 'TOO_MANY_REQUESTS',
    'and the refusal uses the shared 429 contract',
    blocked?.body,
  );
  const beyondBudget = await ContactMessageModel.countDocuments({ email: new RegExp(`${MARKER}.flood`, 'i') }).exec();
  check(beyondBudget === remaining, 'nothing past the budget was stored', beyondBudget);

  await ContactMessageModel.deleteMany({ email: new RegExp(MARKER, 'i') }).exec();
  await finish(harness);
};

void run();
