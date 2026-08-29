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

  nav: {
    home: 'FieldSync — home',
    label: 'Main',
    browse: 'Browse',
    network: 'Network',
    projects: 'Projects',
    myTasks: 'My Tasks',
    notifications: 'Notifications',
    accountMenu: 'Account menu',
  },

  login: {
    brand: {
      beta: 'Beta',
      headline: 'Coordination that moves at the speed of construction.',
      sub: 'Tasks, dependencies, and reschedules handled inside the platform — not over the phone.',
      featuresLabel: 'Platform highlights',
      features: [
        'Cascade scheduling with one-click negotiation',
        // Approved 2026-08-29. Replaces "Messaging opens only after a connection is accepted",
        // the gate D9 reversed; it states the request gate instead and names no delegation.
        'A first message from someone you are not connected to arrives as a request — approve, decline, or block',
        'Trust scores built from real behaviour — not self-reported',
      ],
      footerNote:
        'The same contractor can be a GC on one project and a sub on another. Roles follow the work, not the person.',
    },
    title: 'Welcome back',
    subtitle: 'Sign in to your account to continue',
    email: { label: 'Email address', placeholder: 'you@example.com' },
    password: { label: 'Password', placeholder: '••••••••' },
    forgot: 'Forgot password?',
    submit: 'Sign in',
    submitting: 'Signing in…',
    dividerOr: 'or',
    google: 'Continue with Google',
    noAccount: "Don't have an account?",
    createOne: 'Create one',
    secureNote: 'TLS · end-to-end encrypted session',
    togglePassword: 'Toggle password visibility',
    errors: {
      credentials: 'Invalid email or password. Please try again.',
      network: 'We could not reach the server. Check your connection and try again.',
      generic: 'Something went wrong. Please try again.',
    },
  },

  dashboard: {
    title: 'Personal dashboard',
    welcome: 'Hello, {name}.',
    notMigrated:
      'The Personal dashboard is the approved destination after signing in, and the screen itself has not been migrated to React yet.',
  },

  profile: {
    title: 'My profile',
    lede: 'This is how your profile reads. Your rating and flexibility score are calculated for you — they cannot be edited.',
    edit: 'Edit profile',
    summary: 'Profile summary',
    rating: {
      label: 'Your rating',
      foot: 'Based on {count} ratings from completed work',
      empty: 'No ratings yet',
    },
    flexibility: {
      label: 'Your flexibility score',
      foot: 'Based on {count} responses to date changes · updated {month}',
      empty: 'No flexibility score yet',
    },
    explain: {
      question: 'How is the flexibility score calculated?',
      answerOne:
        'The score is built from how you actually answer requests to change a date — approving, rejecting or proposing an alternative. You do not rate yourself and it cannot be edited, which is what makes it mean something to a contractor reading it.',
      answerTwo:
        'While there are not enough responses, no score is shown at all — no score is better than one resting on a single answer.',
    },
    about: 'About',
    work: {
      title: 'Completed work',
      lede: 'The "Completed on FieldSync" mark means the completion is recorded on the platform; it is not a judgement of quality.',
      badge: 'Completed on FieldSync',
    },
    details: {
      title: 'Details and work area',
      companyName: 'Company name',
      email: 'Email address',
      officePhone: 'Office phone',
      businessPhone: 'Business phone',
      city: 'City',
      region: 'Region',
      travel: 'Travel distance',
      km: 'km',
      notProvided: 'Not provided',
    },
    scheduling: {
      title: 'Scheduling preferences',
      lede: 'These are not hard rules — they tell the other side what works for you before they propose a date.',
      delay: 'Delay you can absorb',
      notice: 'Notice you need',
      days: 'days',
    },
    ratings: {
      title: 'Ratings you received',
      lede: '{count} ratings from contractors you worked with on shared completed work.',
      empty: 'No ratings yet',
    },
  },

  editProfile: {
    title: 'Edit profile',
    lede: 'Update the details other contractors see about you and your coordination preferences. Your rating and flexibility score are calculated for you — they cannot be edited.',
    identity: {
      title: 'Identity',
      lede: 'These are the details other contractors find you by when browsing.',
    },
    avatar: {
      upload: 'Upload photo',
      remove: 'Remove',
      hint: 'JPG or PNG, up to 5 MB.',
    },
    availabilityLegend: 'Availability for new work',
    firstName: 'First name',
    lastName: 'Last name',
    companyName: { label: 'Company name', placeholder: 'Smith Contracting Ltd.' },
    officePhone: { label: 'Office phone', placeholder: '03-1234567' },
    businessPhone: { label: 'Business phone', placeholder: '050-1234567' },
    optional: 'Optional',
    phonesHint: 'The office phone belongs to the business and the business phone belongs to you. Each stands on its own — supply one, both, or neither.',
    bio: {
      label: 'Bio',
      placeholder: 'What you do, how long you have done it, and the projects you take on',
      hint: 'Up to 600 characters.',
    },
    specialties: {
      legend: 'Specialties',
      hint: 'You may select more than one specialty.',
      otherLabel: 'Specify the specialty',
      otherPlaceholder: 'For example: structural steelwork',
    },
    equipment: {
      trigger: 'Select the equipment you operate',
      title: 'Heavy equipment',
      lede: 'Select only the equipment you own or operate.',
      done: 'Done',
      close: 'Close',
      items: {
        excavator: 'Excavator',
        backhoe: 'Backhoe loader',
        drill_rig: 'Drilling rigs',
        mini_excavator: 'Mini excavator',
        crawler: 'Crawler',
        jcb: 'JCB backhoe',
        wheel_loader: 'Wheel loader',
        bobcat: 'Bobcat + mini',
        bulldozer: 'Bulldozer',
        hooklift_truck: 'Truck with articulated crane',
      },
    },
    location: {
      title: 'Where you work',
      lede: 'The work area is selected from a fixed list.',
      city: 'City',
      cityPlaceholder: 'Haifa',
      region: 'Region',
      regionPlaceholder: 'Select a region…',
      travel: 'Travel distance',
      km: 'km',
      travelHint: 'How far you are willing to travel from your city.',
      travelNa: 'Not relevant when you work nationwide.',
    },
    scheduling: {
      title: 'Scheduling preferences',
      lede: 'Scheduling preferences are not binding. They show the other party the timing framework that suits you.',
      notice: 'Your scheduling preferences are shown on your public profile, so other contractors can propose suitable dates in advance.',
      delay: 'Delay you can absorb',
      delayHint: 'The number of delay days that can be absorbed without materially affecting the planned schedule.',
      notice2: 'Notice you need',
      notice2Hint: 'The advance notice required in order to arrange crew and equipment.',
      days: 'days',
    },
    work: {
      lede: 'Images from work you have completed, including work from before you joined. Linking an entry to work coordinated on the platform is optional.',
      add: 'Add image',
      remove: 'Remove image',
      notStored: 'Completed work is not stored on the server yet — it has no data model and no file upload — so this change was not saved.',
    },
    ratingsLede: '{count} ratings from contractors you worked with on shared completed work. They cannot be edited.',
    actions: {
      save: 'Save changes',
      cancel: 'Cancel',
      aside: 'To change your email or password, go to Settings.',
      noEndpoint: 'Saving a profile is not built on the server yet, so nothing was saved.',
    },
  },

  success: {
    title: 'Account created',
    body: "Welcome, {name}. {company} is set up and you're already signed in.",
    next: 'The next step of registration — completing your profile — is not built yet.',
  },
};
