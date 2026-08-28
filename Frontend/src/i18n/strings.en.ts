import type { Strings } from './strings.types';

/**
 * The `: Strings` annotation is the whole safety net: this object is checked against the Hebrew
 * file's shape, so a key that is renamed on one side and not the other stops the build instead of
 * rendering an empty label in one language only.
 *
 * Copy is verbatim from `screens/register.html`. Where a Hebrew and English pair say different
 * things, that difference is deliberate and predates this migration.
 */
export const en: Strings = {
  langName: 'EN',
  otherLangName: 'עב',
  langSwitchLabel: 'Language / שפה',

  brand: {
    beta: 'Beta',
    headline: 'One account. Every project you run.',
    sub: 'General contractors, subcontractors, and suppliers — all equal users, on one platform.',
    featuresLabel: 'Platform highlights',
    features: [
      'Cascade scheduling with one-click negotiation',
      'Two actions, start and complete — no progress chasing',
      'Trust scores built from real behaviour — not self-reported',
    ],
    footerNote:
      'The same contractor can be a GC on one project and a sub on another. Roles follow the work, not the person.',
  },

  form: {
    title: 'Create your account',
    subtitle: "A few details and you're ready to coordinate",
    optional: 'Optional',
    submit: 'Create account',
    submitting: 'Creating account…',
    dividerOr: 'or',
    google: 'Sign up with Google',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
    secureNote: 'TLS · end-to-end encrypted session',
    togglePassword: 'Toggle password visibility',

    firstName: { label: 'First name', placeholder: 'John' },
    lastName: { label: 'Last name', placeholder: 'Smith' },
    companyName: { label: 'Company name', placeholder: 'Smith Contracting Ltd.' },
    email: { label: 'Email address', placeholder: 'you@example.com', error: 'Please enter a valid email address' },
    specialty: { label: 'Primary trade', placeholder: 'Select your trade…', hint: 'You can add or change trades later' },
    specialtyOther: { label: 'Specify your trade', placeholder: 'e.g. scaffolding, landscaping, elevators' },
    city: { label: 'City', placeholder: 'Tel Aviv' },
    region: { label: 'Region', placeholder: 'Select a region…' },
    officePhone: { label: 'Office phone', placeholder: '03-1234567' },
    businessPhone: { label: 'Business phone', placeholder: '050-1234567' },
    availability: { label: 'Availability', hint: 'You can change this at any time from your profile.' },
    password: { label: 'Password', placeholder: '••••••••', hint: 'At least 8 characters', error: 'Password must be at least 8 characters' },
    confirmPassword: { label: 'Confirm password', placeholder: '••••••••', error: "Passwords don't match" },
    terms: { before: 'I have read and agree to the ', tos: 'Terms of Service', between: ' and ', privacy: 'Privacy Policy' },
  },

  trades: {
    general: 'General contracting',
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    drilling: 'Drilling & foundations',
    shell: 'Shell',
    concrete: 'Concrete',
    saferoom: 'Safe rooms (mamad)',
    carpentry: 'Carpentry',
    aluminum: 'Aluminum & glazing',
    hvac: 'HVAC / air conditioning',
    painting: 'Painting',
    tiling: 'Tiling & flooring',
    plastering: 'Plastering',
    earthworks: 'Earthworks',
    waterproofing: 'Waterproofing',
    supply: 'Supply / materials',
    development: 'Development & infrastructure',
    doors: 'Doors',
    sandpumps: 'Sand pumping',
    haulage_crane: 'Haulage & crane work',
    concrete_cutting: 'Concrete cutting',
    heavy_equipment: 'Heavy equipment',
    other: 'Other',
  },

  regions: {
    nationwide: 'Nationwide (all Israel)',
    north: 'North',
    haifa: 'Haifa & Krayot',
    sharon: 'Sharon',
    center: 'Center',
    telaviv: 'Tel Aviv',
    jerusalem: 'Jerusalem area',
    lowlands: 'Lowlands (Shfela)',
    south: 'South',
  },

  availability: {
    open: 'Available for new work',
    limited: 'Limited availability for new work',
    closed: 'No availability for new work at the moment',
  },

  errors: {
    generic: 'Something went wrong. Please check your details and try again.',
    emailTaken: 'That email address is already registered. You can sign in instead.',
    validation: 'Some details are not valid. Please check the highlighted fields and try again.',
    network: 'We could not reach the server. Check your connection and try again.',
  },

  success: {
    title: 'Account created',
    body: "Welcome, {name}. {company} is set up and you're already signed in.",
    next: 'The next step of registration — completing your profile — is not built yet.',
  },
};
