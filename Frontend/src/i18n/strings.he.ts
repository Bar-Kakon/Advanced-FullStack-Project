/**
 * Hebrew is the default language, so this file is the reference the English one is checked
 * against: the `Strings` type is derived from this object, and a missing English key is a
 * compile error. That direction is why this file imports nothing — importing the type it
 * defines would be circular.
 *
 * Every string here is lifted verbatim from `screens/register.html`. Nothing was reworded in the
 * migration — the copy on this screen has been reviewed and some Hebrew/English pairs deliberately
 * differ, which is recorded in the source-of-truth document.
 */
export const he = {
  langName: 'עב',
  otherLangName: 'EN',
  langSwitchLabel: 'Language / שפה',

  brand: {
    beta: 'בטא',
    headline: 'חשבון אחד. כל הפרויקטים שלך.',
    sub: 'קבלנים ראשיים, קבלני משנה וספקים — כולם משתמשים שווים, על פלטפורמה אחת.',
    featuresLabel: 'עיקרי הפלטפורמה',
    features: [
      'תזמון מדורג עם משא ומתן בלחיצה אחת',
      'דיווח בשתי פעולות — התחלה וסיום, בלי מעקב התקדמות',
      'ציוני אמון מהתנהגות אמיתית — לא מדיווח עצמי',
    ],
    footerNote:
      'אותו קבלן יכול להיות קבלן ראשי בפרויקט אחד וקבלן משנה באחר. התפקיד עוקב אחר העבודה, לא אחרי האדם.',
  },

  form: {
    title: 'יצירת חשבון',
    subtitle: 'כמה פרטים ואפשר להתחיל לתאם',
    optional: 'אופציונלי',
    submit: 'יצירת חשבון',
    dividerOr: 'או',
    google: 'הרשמה עם Google',
    haveAccount: 'כבר יש לך חשבון?',
    signIn: 'התחברות',
    secureNote: 'TLS · חיבור מוצפן מקצה לקצה',
    togglePassword: 'הצגת סיסמה',

    firstName: { label: 'שם פרטי', placeholder: 'ישראל' },
    lastName: { label: 'שם משפחה', placeholder: 'ישראלי' },
    companyName: { label: 'שם חברה', placeholder: 'ישראלי בנייה בע״מ' },
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com', error: 'יש להזין כתובת אימייל תקינה' },
    specialty: { label: 'תחום עיקרי', placeholder: 'בחירת תחום…', hint: 'אפשר להוסיף ולשנות תחומים בהמשך' },
    specialtyOther: { label: 'פירוט התחום', placeholder: 'לדוגמה: פיגומים, גינון, מעליות' },
    city: { label: 'עיר', placeholder: 'תל אביב' },
    region: { label: 'אזור', placeholder: 'בחירת אזור…' },
    officePhone: { label: 'טלפון משרד', placeholder: '03-1234567' },
    businessPhone: { label: 'טלפון עסקי', placeholder: '050-1234567' },
    availability: { label: 'זמינות', hint: 'אפשר לשנות בכל שלב בפרופיל.' },
    standing: {
      label: 'איך אתם מצטרפים ל-FieldSync?',
      placeholder: 'בחירה…',
      owner: 'בעלים של חברה',
      employee: 'עובד/ת בחברה',
      // Says what will happen to the registration, and names no internal state.
      employeeHint: 'ההרשמה תותאם להזמנה שהחברה פתחה עבורכם לפי השם המלא, שם החברה והתפקיד.',
    },
    companyPosition: { label: 'תפקיד בחברה', placeholder: 'בחירת תפקיד…' },
    password: { label: 'סיסמה', placeholder: '••••••••', hint: 'לפחות 8 תווים', error: 'הסיסמה חייבת להכיל לפחות 8 תווים' },
    confirmPassword: { label: 'אימות סיסמה', placeholder: '••••••••', error: 'הסיסמאות אינן תואמות' },
    terms: { before: 'קראתי ואני מסכים/ה ל', tos: 'תנאי השימוש', between: ' ול', privacy: 'מדיניות הפרטיות' },
  },

  trades: {
    general: 'קבלנות כללית',
    electrical: 'חשמל',
    plumbing: 'אינסטלציה',
    drilling: 'קידוחים וביסוס',
    shell: 'קבלן שלד',
    concrete: 'בטון',
    saferoom: 'בניית ממ"דים',
    carpentry: 'נגרות',
    aluminum: 'אלומיניום וזיגוג',
    hvac: 'מיזוג אוויר',
    painting: 'צביעה',
    tiling: 'ריצוף וחיפוי',
    plastering: 'טיח',
    earthworks: 'עבודות עפר',
    waterproofing: 'איטום',
    supply: 'אספקה וחומרים',
    development: 'קבלן לעבודות פיתוח ותשתיות',
    doors: 'דלתות',
    sandpumps: 'משאבות חול',
    haulage_crane: 'הובלות ועבודות מנוף',
    concrete_cutting: 'ניסור בטון',
    heavy_equipment: 'כלי צמ״ה',
    other: 'אחר',
  },

  /**
   * One canonical label per code, and this is the only place they are written. `מנהל אתר` is a
   * synonym of `מנהל עבודה` and is deliberately NOT a second primary label — a product that calls
   * the same role two things on two screens is a product with two roles as far as a reader is
   * concerned. Keep it for a glossary or a search alias if one is ever needed, never here.
   *
   * `main_contractor` is `קבלן ביצוע ראשי`, not `קבלן ראשי`: that shorter form is already the
   * Hebrew for the per-project `gc` role, and a company job title must not share a string with a
   * project role. It stays correct in the brand footer above, which is about that role.
   */
  companyPositions: {
    main_contractor: 'קבלן ביצוע ראשי',
    construction_manager: 'מנהל אתרים',
    regional_construction_manager: 'מנהל אתרים אזורי',
    site_manager: 'מנהל עבודה',
    contractor: 'קבלן',
    employee: 'עובד',
  },

  regions: {
    nationwide: 'כל הארץ',
    north: 'צפון',
    haifa: 'חיפה והקריות',
    sharon: 'השרון',
    center: 'מרכז',
    telaviv: 'תל אביב',
    jerusalem: 'ירושלים והסביבה',
    lowlands: 'שפלה',
    south: 'דרום',
  },

  availability: {
    open: 'זמינות לעבודות חדשות',
    limited: 'זמינות מוגבלת לעבודות חדשות',
    closed: 'אין זמינות לקבלת עבודות חדשות כעת',
  },

  errors: {
    generic: 'משהו השתבש. בדקו את הפרטים ונסו שוב.',
    emailTaken: 'כתובת האימייל הזו כבר רשומה. אפשר להתחבר במקום.',
    validation: 'חלק מהפרטים אינם תקינים. בדקו את השדות המסומנים ונסו שוב.',
    network: 'לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.',
    noInvitation: 'לא נמצאה הזמנה התואמת לפרטים שהוזנו. בדקו את הפרטים ונסו שוב, או פנו לחברה שהזמינה אתכם.',
    // Neutral on purpose: the person cannot resolve which internal row is theirs, so they are not
    // asked to. The server still distinguishes INVITATION_AMBIGUOUS in its own answer.
    ambiguousInvitation: 'לא ניתן להשלים את ההרשמה עם הפרטים שהוזנו. פנו לחברה שהזמינה אתכם.',
  },

  /** The app navbar, shared by every authenticated screen. */
  nav: {
    home: 'FieldSync — דף הבית',
    label: 'ניווט ראשי',
    browse: 'עיון בקבלנים',
    network: 'הרשת שלי',
    projects: 'פרויקטים',
    myTasks: 'המשימות שלי',
    notifications: 'התראות',
    accountMenu: 'תפריט חשבון',
    account: {
      myProfile: 'הפרופיל שלי',
      settings: 'הגדרות',
      settingsUnavailable: 'מסך ההגדרות עדיין לא נבנה.',
      logOut: 'התנתקות',
    },
    employees: 'ניהול עובדים',
  },

  login: {
    brand: {
      beta: 'בטא',
      headline: 'תיאום שזז במהירות של הבנייה.',
      sub: 'משימות, תלויות ותזמונים מחדש — מנוהלים בפנים, לא בטלפון.',
      featuresLabel: 'עיקרי הפלטפורמה',
      features: [
        'תזמון מדורג עם משא ומתן בלחיצה אחת',
        // Approved 2026-08-29. It replaces `הודעות נפתחות רק לאחר אישור בקשת חיבור`, which stated
        // the connection gate D9 reversed: it states the request gate instead, names no
        // delegation, and repeats neither bullet beside it.
        'הודעה ראשונה ממי שאינכם מחוברים אליו מגיעה כבקשה — לאישור, לדחייה או לחסימה',
        'ציוני אמון מהתנהגות אמיתית — לא מדיווח עצמי',
      ],
      footerNote:
        'אותו קבלן יכול להיות קבלן ראשי בפרויקט אחד וקבלן משנה באחר. התפקיד עוקב אחר העבודה, לא אחרי האדם.',
    },
    title: 'ברוכים השבים',
    subtitle: 'התחברו לחשבונכם כדי להמשיך',
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com' },
    password: { label: 'סיסמה', placeholder: '••••••••' },
    forgot: 'שכחת סיסמה?',
    submit: 'כניסה',
    dividerOr: 'או',
    google: 'המשך עם Google',
    noAccount: 'אין לך חשבון?',
    createOne: 'צור חשבון',
    secureNote: 'TLS · חיבור מוצפן מקצה לקצה',
    togglePassword: 'הצגת סיסמה',
    errors: {
      // One answer for a wrong address and a wrong password alike. The server raises a single
      // INVALID_CREDENTIALS for both, and a second message here would undo that.
      credentials: 'אימייל או סיסמה שגויים. אנא נסו שוב.',
      network: 'לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.',
      generic: 'משהו השתבש. אנא נסו שוב.',
    },
  },

  /**
   * Copy lifted verbatim from `screens/forgot-password.html`. The non-committal wording is the
   * point of the screen: the same answer is shown whether or not an account exists, so the form
   * cannot be used to discover who is registered.
   */
  forgotPassword: {
    brand: {
      beta: 'בטא',
      headline: 'הפרויקטים שלכם ממתינים — בואו נחזיר לכם גישה.',
      sub: 'איפוס סיסמה מאובטח. נשלח קישור חד-פעמי לאימייל שבחשבון, והוא יפוג בתוך 30 דקות.',
      featuresLabel: 'עיקרי האיפוס',
      features: [
        'קישור חד-פעמי עם תוקף מוגבל',
        'מטעמי אבטחה, תוצג אותה הודעה בין אם קיים חשבון לכתובת האימייל ובין אם לא.',
        'כל הסשנים הפעילים יינותקו לאחר האיפוס',
      ],
      footerNote: 'מטעמי פרטיות אותה הודעה מוצגת בכל מקרה, כדי שלא ניתן יהיה ללמוד מי רשום למערכת.',
    },
    backToSignIn: 'חזרה להתחברות',
    title: 'שכחת סיסמה?',
    subtitle: 'הזינו את האימייל המשויך לחשבון ונשלח אליכם קישור לאיפוס.',
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com', error: 'יש להזין כתובת אימייל תקינה' },
    submit: 'שליחת קישור לאיפוס הסיסמה',
    remembered: 'נזכרתם בסיסמה?',
    signIn: 'להתחברות',
    sentTitle: 'בדקו את תיבת הדואר',
    sentSubtitle: 'אם קיים חשבון לכתובת שהזנתם, קישור לאיפוס בדרך אליכם. הקישור יפוג בתוך 30 דקות.',
    backButton: 'חזרה להתחברות',
    noMail: 'לא הגיע כלום?',
    resend: 'שליחה מחדש',
    /** The honest build state, in the same voice the other screens use for an absent endpoint. */
    errors: {
      network: 'לא ניתן להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.',
      generic: 'אירעה שגיאה. נסו שוב.',
    },
  },

  resetPassword: {
    brand: {
      beta: 'בטא',
      headline: 'סיסמה חדשה, ואתם שוב בפנים.',
      sub: 'בחרו סיסמה חזקה שלא השתמשתם בה בעבר. לאחר האיפוס כל הסשנים הפעילים יינותקו.',
      featuresLabel: 'הנחיות לסיסמה',
      features: [
        'לפחות 8 תווים',
        'שילוב של אותיות, מספרים וסימנים מחזק את הסיסמה',
        'אל תשתמשו בסיסמה מאתר אחר',
      ],
      footerNote: 'הקישור לאיפוס הוא חד-פעמי ומאבד תוקף לאחר השימוש או בתום 30 דקות.',
    },
    backToSignIn: 'חזרה להתחברות',
    title: 'בחירת סיסמה חדשה',
    subtitle: 'בחרו סיסמה חזקה שלא השתמשתם בה בעבר.',
    newPassword: { label: 'סיסמה חדשה', placeholder: '••••••••', error: 'הסיסמה חייבת לכלול לפחות 8 תווים' },
    confirmPassword: { label: 'אימות סיסמה', placeholder: '••••••••', hint: 'יש להזין את אותה הסיסמה שוב לאימות.', error: 'הסיסמאות אינן תואמות' },
    togglePassword: 'הצגת סיסמה',
    submit: 'שמירת הסיסמה החדשה',
    doneTitle: 'הסיסמה עודכנה',
    doneSubtitle: 'הסיסמה שלכם שונתה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.',
    continue: 'המשך להתחברות',
    errors: {
      // The server answers one code for unknown, expired, superseded and already-used alike.
      invalidToken: 'הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו. ניתן לשלוח קישור חדש.',
      weakPassword: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
      network: 'לא ניתן להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.',
      generic: 'אירעה שגיאה. נסו שוב.',
    },
    /** Shown beside the email field when the page was opened without a usable link. */
    noLinkLede: 'הזינו את כתובת המייל כדי שנוכל לשלוח לכם קישור חדש לאיפוס הסיסמה.',
    sendNewLink: 'שליחת קישור חדש',
  },

  dashboard: {
    title: 'לוח הבקרה האישי',
    welcome: 'שלום, {name}.',
    notMigrated: 'לוח הבקרה האישי הוא היעד המאושר אחרי כניסה, והמסך עצמו עדיין לא הועבר ל-React.',
    management: {
      title: 'ניהול',
      employees: { name: 'ניהול עובדים', lede: 'הזמנת עובדים ואישור הצטרפות לחברה.' },
    },
  },

  /**
   * Employee management. One resource for both places the feature is used, because it is one
   * feature: the surrounding navigation differs and nothing a reader sees does.
   */
  employees: {
    title: 'ניהול עובדים',
    lede: 'פתחו מקום לעובד/ת, ואשרו את מי שכבר נרשם/ה וההצטרפות שלו/ה ממתינה לאישור החברה.',

    invite: {
      title: 'פתיחת מקום לעובד/ת',
      // Says why so little is asked for, so the two fields do not read as a form cut short.
      lede: 'נדרשים רק שם ותפקיד. את כתובת המייל והסיסמה העובד/ת בוחר/ת בעצמו/ה בעת ההרשמה.',
      fullName: {
        label: 'שם מלא',
        placeholder: 'ישראל ישראלי',
        hint: 'השם המלא כפי שהעובד/ת יזין/תזין אותו בהרשמה.',
      },
      companyPosition: { label: 'תפקיד בחברה', placeholder: 'בחירת תפקיד…' },
      submit: 'פתיחת מקום',
      created: 'המקום נפתח. העובד/ת יכול/ה להירשם עכשיו עם השם והתפקיד האלה.',
    },

    list: {
      title: 'עובדים והזמנות',
      /** Named rather than numbered, so a row nobody has claimed is not read as a person. */
      count: '{count} רשומות',
      name: 'שם מלא',
      position: 'תפקיד',
      status: 'סטטוס',
      /** The invitation carries a name and the position carries a code, so neither can be empty. */
      nameMissing: 'ללא שם',
      positionMissing: 'ללא תפקיד',
    },

    /**
     * One label per lifecycle code, and this is the only place they are written. The wording says
     * what has happened to the relationship, never what the code is called.
     */
    status: {
      invited: 'הזמנה פתוחה — טרם נרשמו',
      pending_company_approval: 'נרשם/ה, ממתין/ה לאישור החברה',
      active: 'פעיל/ה',
      inactive: 'לא פעיל/ה',
    },

    actions: {
      approve: 'אישור ההצטרפות',
      approveAll: 'אישור כל הממתינים ({count})',
      refresh: 'רענון הרשימה',
    },

    empty: {
      /** The first thing an owner sees, so it says what to do rather than that nothing is here. */
      noEmployees: 'עדיין לא נפתחו מקומות לעובדים. אפשר לפתוח את המקום הראשון בטופס שלמעלה.',
      noPending: 'אין כרגע הצטרפויות הממתינות לאישור.',
    },

    loading: 'טוען את רשימת העובדים…',

    onboarding: {
      title: 'הוספת העובדים שלכם',
      lede: 'אפשר לפתוח עכשיו מקומות לעובדים, ואפשר לדלג ולחזור לזה מתי שתרצו.',
      skip: 'דילוג לעת עתה',
      finish: 'סיום והמשך',
      /** Says the step will not come back, so Skip is not a decision anyone has to weigh. */
      note: 'ניהול העובדים יישאר זמין מלוח הבקרה גם אם תדלגו.',
    },

    errors: {
      notPermitted: 'אין לכם הרשאה לנהל את העובדים של החברה הזו. פנו לבעל/ת החברה.',
      noCompany: 'החשבון שלכם אינו משויך לחברה פעילה, ולכן אין עובדים לנהל.',
      unauthenticated: 'ההתחברות פגה. התחברו שוב כדי להמשיך.',
      // A stale screen rather than a failed action: somebody else already approved this person.
      nothingToApprove: 'ההצטרפות הזו כבר אושרה או שאינה ממתינה לאישור. רעננו את הרשימה.',
      validation: 'חלק מהפרטים אינם תקינים. בדקו את השדות המסומנים ונסו שוב.',
      network: 'לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.',
      generic: 'משהו השתבש. אנא נסו שוב.',
    },
  },

  /** Copy approved verbatim. It names no internal state and no internal vocabulary. */
  waitingForApproval: {
    heading: 'ההרשמה הושלמה',
    body: 'החשבון שלכם פעיל, וההצטרפות לחברה ממתינה לאישור. לאחר שהחברה תאשר את ההצטרפות תוכלו להמשיך להשתמש במערכת כרגיל.',
    secondary: 'אין צורך להירשם מחדש.',
    checkStatus: 'בדיקת סטטוס',
    signOut: 'התנתקות',
    stillWaiting: 'ההצטרפות עדיין ממתינה לאישור החברה.',
    errors: {
      network: 'לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.',
      generic: 'משהו השתבש. אנא נסו שוב.',
    },
  },

  profile: {
    title: 'הפרופיל שלי',
    lede: 'כך נראה הפרופיל שלכם. הדירוג וציון הגמישות מחושבים לבד — אי אפשר לערוך אותם.',
    edit: 'עריכת הפרופיל',
    summary: 'סיכום הפרופיל',
    rating: {
      label: 'הדירוג שלכם',
      foot: 'מבוסס על {count} דירוגים מעבודות שהושלמו',
      empty: 'אין עדיין דירוגים',
    },
    flexibility: {
      label: 'ציון הגמישות שלכם',
      foot: 'מבוסס על {count} תגובות שלכם לשינויי תאריך · עודכן ב{month}',
      empty: 'אין עדיין ציון גמישות',
    },
    explain: {
      question: 'איך מחושב ציון הגמישות?',
      answerOne:
        'הציון נבנה מהאופן שבו אתם עונים בפועל לבקשות לשינוי תאריך — אישור, דחייה או הצעה נגדית. אתם לא מדרגים את עצמכם ואי אפשר לערוך אותו, ולכן הוא אומר משהו אמיתי לקבלן שרואה אותו.',
      answerTwo:
        'כל עוד אין מספיק תגובות, לא מוצג ציון כלל — עדיף בלי ציון מאשר ציון שנשען על תגובה אחת.',
    },
    about: 'על עצמי',
    work: {
      title: 'עבודות שהושלמו',
      lede: 'הסימון "הושלם ב־FieldSync" מציין שההשלמה רשומה במערכת, ואינו חוות דעת על איכות העבודה.',
      badge: 'הושלם ב־FieldSync',
    },
    details: {
      title: 'פרטים ואזור עבודה',
      companyName: 'שם החברה',
      email: 'כתובת אימייל',
      officePhone: 'טלפון משרד',
      businessPhone: 'טלפון עסקי',
      city: 'עיר',
      region: 'אזור',
      travel: 'מרחק נסיעה',
      km: 'ק״מ',
      notProvided: 'לא הוזן',
    },
    scheduling: {
      title: 'העדפות תיאום',
      lede: 'אלה לא כללים נוקשים — הם אומרים לצד השני מה מתאים לכם לפני שהוא מציע תאריך.',
      delay: 'עיכוב שאפשר לספוג',
      notice: 'התראה מראש שאתם צריכים',
      days: 'ימים',
    },
    ratings: {
      title: 'הדירוגים שקיבלתם',
      lede: '{count} דירוגים מקבלנים שעבדתם איתם על עבודה משותפת שהושלמה.',
      empty: 'אין עדיין דירוגים',
    },
  },

  editProfile: {
    title: 'עריכת הפרופיל',
    lede: 'עדכנו את הפרטים שקבלנים אחרים רואים עליכם ואת העדפות התיאום שלכם. הדירוג וציון הגמישות מחושבים לבד — אי אפשר לערוך אותם.',
    identity: {
      title: 'פרטים מזהים',
      lede: 'אלה הפרטים שקבלנים אחרים מוצאים לפיהם בעיון בקבלנים.',
    },
    avatar: {
      upload: 'העלאת תמונה',
      remove: 'הסרה',
      hint: 'JPG או PNG, עד 5 מ״ב.',
    },
    availabilityLegend: 'זמינות לעבודות חדשות',
    firstName: 'שם פרטי',
    lastName: 'שם משפחה',
    companyName: { label: 'שם חברה', placeholder: 'ישראלי בנייה בע״מ' },
    officePhone: { label: 'טלפון משרד', placeholder: '03-1234567' },
    businessPhone: { label: 'טלפון עסקי', placeholder: '050-1234567' },
    optional: 'אופציונלי',
    phonesHint: 'טלפון המשרד שייך לעסק והטלפון העסקי שייך לכם. כל אחד מהם עומד בפני עצמו, ואפשר למלא אחד, את שניהם או אף אחד.',
    bio: {
      label: 'תיאור קצר',
      placeholder: 'במה אתם עוסקים, כמה שנים, ובאילו סוגי פרויקטים',
      hint: 'עד 600 תווים.',
    },
    specialties: {
      legend: 'תחומי התמחות',
      hint: 'אפשר לבחור יותר מתחום התמחות אחד.',
      otherLabel: 'פירוט תחום ההתמחות',
      otherPlaceholder: 'למשל: מסגרות בניין',
    },
    equipment: {
      trigger: 'בחירת הכלים שברשותכם',
      title: 'כלי צמ״ה',
      lede: 'סמנו רק את הכלים שברשותכם או שאתם מפעילים.',
      done: 'סיום',
      close: 'סגירה',
      items: {
        excavator: 'באגר',
        backhoe: 'מחפרון',
        drill_rig: 'מכונות קידוח',
        mini_excavator: 'מיני באגר',
        crawler: 'זחל',
        jcb: 'JCB מחפרון',
        wheel_loader: 'שופל',
        bobcat: 'בובקט + מיני',
        bulldozer: 'דחפור',
        hooklift_truck: 'משאית פרקית',
      },
    },
    location: {
      title: 'אזור עבודה',
      lede: 'אזור הפעילות נבחר מרשימה קבועה.',
      city: 'עיר',
      cityPlaceholder: 'חיפה',
      region: 'אזור',
      regionPlaceholder: 'בחירת אזור…',
      travel: 'מרחק נסיעה',
      km: 'ק״מ',
      travelHint: 'עד כמה רחוק אתם מוכנים להגיע מהעיר שלכם.',
      travelNa: 'לא רלוונטי כשבחרתם כל הארץ.',
    },
    scheduling: {
      title: 'העדפות תיאום',
      lede: 'העדפות התיאום אינן מחייבות. הן מציגות לצד השני את מסגרת הזמנים המתאימה לכם.',
      notice: 'העדפות התיאום שלכם מוצגות בפרופיל הציבורי, כדי שקבלנים אחרים יוכלו להציע מועדים מתאימים מראש.',
      delay: 'עיכוב שאפשר לספוג',
      delayHint: 'מספר ימי העיכוב שניתן לספוג ללא פגיעה מהותית בלוח הזמנים המתוכנן.',
      notice2: 'התראה מראש שאתם צריכים',
      notice2Hint: 'ההתראה המוקדמת הנדרשת לצורך היערכות של צוות וציוד.',
      days: 'ימים',
    },
    work: {
      lede: 'תמונות מעבודות שהשלמתם, כולל עבודות מלפני ההצטרפות. קישור לעבודה שנוהלה בפלטפורמה הוא רשות.',
      add: 'הוספת תמונה',
      remove: 'הסרת התמונה',
      // The same honest note Save carries, for the half of the screen that has even less behind it.
      notStored: 'עבודות שהושלמו עדיין אינן נשמרות בשרת — אין להן מבנה נתונים ואין העלאת קבצים — ולכן השינוי הזה לא נשמר.',
    },
    ratingsLede: '{count} דירוגים מקבלנים שעבדתם איתם על עבודה משותפת שהושלמה. אי אפשר לערוך אותם.',
    actions: {
      save: 'שמירת שינויים',
      cancel: 'ביטול',
      aside: 'לשינוי כתובת המייל או הסיסמה, עברו להגדרות.',
      // The same honest note the Register success state uses for a step that is not built.
      noEndpoint: 'שמירת פרופיל עדיין לא נבנתה בשרת, ולכן השינויים לא נשמרו.',
    },
  },
} as const;
