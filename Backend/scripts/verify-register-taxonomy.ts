/**
 * The three registration routes, the father-approved taxonomy, and the Step 2 email choice.
 *
 * The validation matrix runs against `registerBodySchema` itself, with the exact options
 * `validateRequest` uses. Register is rate limited to ten requests an hour per IP, and the matrix
 * alone is over forty cases — driving it over HTTP would spend a real product protection to test
 * the same object the route already delegates to. Everything that has to prove storage, Browse or
 * the profile guard goes over real HTTP against the real app.
 */
import { Types } from 'mongoose';

import { registerBodySchema } from '../src/features/auth/auth.validation.js';
import { UserModel } from '../src/features/users/user.model.js';
import {
  ARCHITECTURAL_SPECIALTIES,
  CONTRACTOR_SPECIALTIES,
  DRILLING_TYPES,
  OTHER_SPECIALTIES,
  OTHER_SPECIALTY,
  REGISTRATION_CATEGORIES,
  SPECIALTIES,
  SPECIALTIES_BY_CATEGORY,
  SUPPLIER_SPECIALTIES,
} from '../src/features/users/user.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'regtax-verify';
const PASSWORD = 'CorrectHorse42!';

const VALIDATION_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true } as const;

/** The codes the father's list removed. None may survive anywhere in the taxonomy. */
const RETIRED_CODES = [
  'general', 'concrete', 'saferoom', 'hvac', 'earthworks', 'supply', 'other',
  'doors', 'sandpumps', 'aluminum', 'development',
];

/**
 * `contractorCategory` classifies a contracting business, so it rides along only on the contractor
 * route. A supplier or an architectural registration carrying one is refused, which is what the
 * matrix below asserts directly.
 */
const baseBody = (over: Record<string, unknown> = {}): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    firstName: 'Taxonomy',
    lastName: 'Verify',
    standing: 'owner',
    companyName: `${MARKER} Ltd`,
    email: 'taxonomy@example.com',
    password: PASSWORD,
    confirmPassword: PASSWORD,
    registrationCategory: 'contractor',
    specialty: 'electrical',
    city: 'חיפה',
    region: 'haifa',
    availability: 'open',
    acceptedTerms: true,
    operationalEmail: true,
    ...over,
  };

  if (body['standing'] === 'owner' && body['registrationCategory'] === 'contractor') {
    return { contractorCategory: 'subcontractor', ...body };
  }
  return body;
};

const accepts = (over: Record<string, unknown>): boolean =>
  registerBodySchema.validate(baseBody(over), VALIDATION_OPTIONS).error === undefined;

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  await CompanyMembershipModel.deleteMany({ user: { $in: users } });
  await CompanyModel.deleteMany({ name: { $regex: `^${MARKER}` } });
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } });
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await wipe();

  section('1. The father-approved taxonomy, exactly');
  check(REGISTRATION_CATEGORIES.length === 3, 'three registration routes, and only three',
    REGISTRATION_CATEGORIES);
  check(CONTRACTOR_SPECIALTIES.length === 20, 'the contractor route carries 19 professions plus its own other',
    CONTRACTOR_SPECIALTIES.length);
  check(ARCHITECTURAL_SPECIALTIES.length === 5, 'the architectural route carries 4 professions plus its own other',
    ARCHITECTURAL_SPECIALTIES.length);
  check(SUPPLIER_SPECIALTIES.length === 12, 'the supplier route carries 11 categories plus its own other',
    SUPPLIER_SPECIALTIES.length);

  const codes = new Set(SPECIALTIES);
  check(codes.size === SPECIALTIES.length, 'no code appears in two routes', SPECIALTIES.length);
  check(RETIRED_CODES.every((code) => !codes.has(code as never)),
    'every retired legacy code is gone rather than kept for compatibility',
    RETIRED_CODES.filter((code) => codes.has(code as never)));
  check(!codes.has('other' as never), 'there is no route-neutral catch-all specialty');

  for (const category of REGISTRATION_CATEGORIES) {
    const other = OTHER_SPECIALTY[category];
    check(SPECIALTIES_BY_CATEGORY[category].includes(other as never),
      `${category} carries its own other code`, other);
    const elsewhere = REGISTRATION_CATEGORIES
      .filter((c) => c !== category)
      .some((c) => SPECIALTIES_BY_CATEGORY[c].includes(other as never));
    check(!elsewhere, `${category}'s other code belongs to no other route`, other);
  }

  check(codes.has('drilling'), 'קבלן קידוחים survives as a contractor profession');
  check(DRILLING_TYPES.length === 1 && DRILLING_TYPES[0] === 'injection_pvc',
    'קידוחי החדרה וצנרת PVC is the nested drilling subtype, not a top-level profession', DRILLING_TYPES);
  check(codes.has('drainage_pipe_supplier') && !CONTRACTOR_SPECIALTIES.includes('drainage_pipe_supplier' as never),
    'drainage pipe is a supplier category and not a separate drilling specialty');

  section('2. Step 1 — the route decides which taxonomy is offered');
  check(!accepts({ registrationCategory: undefined }), 'a registration with no route is refused');
  check(accepts({ registrationCategory: 'contractor', specialty: 'electrical' }),
    'a contractor may register as עבודות חשמל');
  check(!accepts({ registrationCategory: 'contractor', specialty: 'architect' }),
    'a contractor may not register as אדריכל');
  check(accepts({ registrationCategory: 'supplier', specialty: 'stone_supplier' }),
    'a supplier may register as ספק שיש');
  check(!accepts({ registrationCategory: 'supplier', specialty: 'electrical' }),
    'a supplier may not register as עבודות חשמל');
  check(accepts({ registrationCategory: 'architectural', specialty: 'structural_engineer' }),
    'the architectural route may register as קונסטרוקטור');
  check(!accepts({ registrationCategory: 'architectural', specialty: 'stone_supplier' }),
    'the architectural route may not register as ספק שיש');

  const crossed: string[] = [];
  for (const category of REGISTRATION_CATEGORIES) {
    for (const specialty of SPECIALTIES) {
      const own = SPECIALTIES_BY_CATEGORY[category].includes(specialty as never);
      // An other code still needs its free text, so it is supplied and the route stays the subject.
      const free = OTHER_SPECIALTIES.includes(specialty) ? { specialtyOther: 'פירוט' } : {};
      if (accepts({ registrationCategory: category, specialty, ...free }) !== own) {
        crossed.push(`${category}/${specialty}`);
      }
    }
  }
  check(crossed.length === 0, 'across all 37 codes, every route accepts only its own list', crossed);

  for (const code of RETIRED_CODES) {
    check(!accepts({ specialty: code }), `the retired code ${code} is refused`);
  }

  section('3. Other lives inside a route, never instead of one');
  check(!accepts({ specialty: 'contractor_other' }),
    'the contractor other code without free text is refused');
  check(accepts({ specialty: 'contractor_other', specialtyOther: 'פיגומים' }),
    'the contractor other code with free text is accepted');
  check(accepts({ registrationCategory: 'supplier', specialty: 'supplier_other', specialtyOther: 'ספק זכוכית' }),
    'the supplier other code with free text is accepted');
  check(!accepts({ specialty: 'electrical', specialtyOther: 'פיגומים' }),
    'free text on a named profession is refused, so the two can never disagree');
  check(!accepts({ registrationCategory: 'supplier', specialty: 'contractor_other', specialtyOther: 'x' }),
    "a supplier cannot borrow the contractor route's other code");

  section('4. The nested drilling subtype');
  check(accepts({ specialty: 'drilling', drillingTypes: ['injection_pvc'] }),
    'drilling accepts its nested subtype');
  check(accepts({ specialty: 'drilling' }), 'drilling without a subtype is still a valid registration');
  check(!accepts({ specialty: 'electrical', drillingTypes: ['injection_pvc'] }),
    'a subtype on any other profession is refused');
  check(!accepts({ specialty: 'drilling', drillingTypes: ['sonic'] }),
    'an unapproved subtype is refused');

  section('5. Step 2 — the email choice is explicit and has no default');
  const withoutChoice = registerBodySchema.validate(
    { ...baseBody(), operationalEmail: undefined },
    VALIDATION_OPTIONS,
  );
  check(withoutChoice.error !== undefined, 'a registration that answers neither option is refused');
  check(withoutChoice.value['operationalEmail'] === undefined,
    'and no answer is defaulted in on the way through', withoutChoice.value['operationalEmail']);
  check(accepts({ operationalEmail: true }), 'choosing operational email is accepted');
  check(accepts({ operationalEmail: false }), 'declining operational email is equally accepted');

  section('6. Over the real API: the route and the choice are persisted');
  const register = async (
    name: string,
    over: Record<string, unknown>,
  ): Promise<{ token: string; id: string }> => {
    const email = `${MARKER}-${name}@example.com`.toLowerCase();
    const created = await request(baseUrl, 'POST', '/api/auth/register', {
      json: {
        ...baseBody(over),
        firstName: name,
        email,
        companyName: `${MARKER} ${name} Ltd`,
      },
    });
    if (created.status !== 201) throw new Error(`register ${name}: ${JSON.stringify(created.body)}`);

    const signedIn = await request(baseUrl, 'POST', '/api/auth/login', {
      json: { email, password: PASSWORD },
    });
    const user = signedIn.body['user'] as { id: string };
    return { token: signedIn.body['accessToken'] as string, id: user.id };
  };

  const contractor = await register('Cara', { specialty: 'drilling', drillingTypes: ['injection_pvc'] });
  const supplier = await register('Sam', {
    registrationCategory: 'supplier', specialty: 'stone_supplier', operationalEmail: false,
  });
  const architect = await register('Arik', {
    registrationCategory: 'architectural', specialty: 'architect',
  });

  const storedContractor = await UserModel.findById(new Types.ObjectId(contractor.id)).lean();
  check(storedContractor?.registrationCategory === 'contractor',
    'the contractor route is stored on the account', storedContractor?.registrationCategory);
  check(storedContractor?.notificationPreferences?.operationalEmail === true,
    'and so is the email choice they made', storedContractor?.notificationPreferences);
  check(JSON.stringify(storedContractor?.drillingTypes) === JSON.stringify(['injection_pvc']),
    'the nested drilling subtype is stored', storedContractor?.drillingTypes);

  const storedSupplier = await UserModel.findById(new Types.ObjectId(supplier.id)).lean();
  check(storedSupplier?.registrationCategory === 'supplier',
    'the supplier route is stored, not derived from the specialty', storedSupplier?.registrationCategory);
  check(storedSupplier?.notificationPreferences?.operationalEmail === false,
    'declining email still registered the account and recorded the refusal',
    storedSupplier?.notificationPreferences);

  section('7. Browse represents all three routes');
  const all = await request(baseUrl, 'GET', '/api/browse/contractors?limit=48', {
    token: contractor.token,
  });
  const rows = (all.body['contractors'] ?? []) as { userId: string; registrationCategory: string }[];
  const mine = rows.filter((row) => [supplier.id, architect.id].includes(row.userId));
  check(mine.length === 2, 'a supplier and an architectural account both appear in Browse', mine.length);
  check(mine.every((row) => row.registrationCategory !== undefined),
    'every card names the route it came from rather than being assumed a contractor',
    mine.map((row) => row.registrationCategory));

  const suppliersOnly = await request(baseUrl, 'GET', '/api/browse/contractors?category=supplier&limit=48', {
    token: contractor.token,
  });
  const supplierRows = (suppliersOnly.body['contractors'] ?? []) as { registrationCategory: string }[];
  check(supplierRows.length > 0 && supplierRows.every((row) => row.registrationCategory === 'supplier'),
    'filtering by route returns only that route', supplierRows.length);
  const badCategory = await request(baseUrl, 'GET', '/api/browse/contractors?category=plumber', {
    token: contractor.token,
  });
  check(badCategory.status === 400, 'an unknown route code is refused by validation', badCategory.status);

  section('8. The route still constrains the account after registration');
  const crossEdit = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: supplier.token,
    json: { specialties: ['electrical'] },
  });
  check(crossEdit.status === 422, 'a supplier cannot edit their way into the contractor taxonomy',
    crossEdit.status);
  check(crossEdit.body['code'] === 'SPECIALTY_OUTSIDE_CATEGORY', 'and the refusal names the rule',
    crossEdit.body['code']);

  const ownEdit = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: supplier.token,
    json: { specialties: ['stone_supplier', 'ceramics_supplier'] },
  });
  check(ownEdit.status === 200, 'but may hold several specialties from their own route', ownEdit.status);

  const dropDrilling = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: contractor.token,
    json: { specialties: ['electrical'] },
  });
  check(dropDrilling.status === 200, 'dropping drilling succeeds', dropDrilling.status);
  const afterDrop = await UserModel.findById(new Types.ObjectId(contractor.id)).lean();
  check((afterDrop?.drillingTypes ?? []).length === 0,
    'and the nested subtype goes with the profession that carried it', afterDrop?.drillingTypes);

  const profile = await request(baseUrl, 'GET', '/api/users/me', { token: supplier.token });
  const profileBody = profile.body['user'] as { registrationCategory: string; operationalEmail: boolean };
  check(profileBody.registrationCategory === 'supplier', 'the profile reports the route it registered through',
    profileBody.registrationCategory);
  check(profileBody.operationalEmail === false, 'and the email choice made at Step 2',
    profileBody.operationalEmail);

  await wipe();
  await finish(harness);
};

void run();
