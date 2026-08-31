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
    headline: 'חשבון אחד. כל הפרויקטים במקום אחד.',
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
    haveAccount: 'כבר קיים חשבון?',
    signIn: 'התחברות',
    secureNote: 'TLS · חיבור מוצפן מקצה לקצה',
    togglePassword: 'הצגת סיסמה',

    firstName: { label: 'שם פרטי', placeholder: 'ישראל' },
    lastName: { label: 'שם משפחה', placeholder: 'ישראלי' },
    companyName: { label: 'שם חברה', placeholder: 'ישראלי בנייה בע״מ' },
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com', error: 'יש להזין כתובת אימייל תקינה' },
    registrationCategory: {
      label: 'מסלול הרשמה',
      placeholder: 'בחירת מסלול…',
      hint: 'המסלול קובע אילו תחומים מוצגים בהמשך.',
    },
    specialty: { label: 'תחום עיקרי', placeholder: 'בחירת תחום…', hint: 'אפשר להוסיף ולשנות תחומים בהמשך' },
    specialtyOther: { label: 'פירוט התחום', placeholder: 'לדוגמה: פיגומים, גינון, מעליות' },
    drillingTypes: { label: 'תחומי קידוח', hint: 'אפשר לסמן את סוגי הקידוח הרלוונטיים.' },
    city: { label: 'עיר', placeholder: 'תל אביב' },
    region: { label: 'אזור', placeholder: 'בחירת אזור…' },
    officePhone: { label: 'טלפון משרד', placeholder: '03-1234567' },
    businessPhone: { label: 'טלפון עסקי', placeholder: '050-1234567' },
    availability: { label: 'זמינות', hint: 'אפשר לשנות בכל שלב בפרופיל.' },
    standing: {
      label: 'איך מצטרפים ל-FieldSync?',
      placeholder: 'בחירה…',
      owner: 'בעלות על חברה',
      employee: 'העסקה בחברה',
      // Says what will happen to the registration, and names no internal state.
      employeeHint: 'ההרשמה תותאם להזמנה שהחברה פתחה, לפי השם המלא, שם החברה והתפקיד.',
    },
    companyPosition: { label: 'תפקיד בחברה', placeholder: 'בחירת תפקיד…' },
    password: { label: 'סיסמה', placeholder: '••••••••', hint: 'לפחות 8 תווים', error: 'הסיסמה חייבת להכיל לפחות 8 תווים' },
    confirmPassword: { label: 'אימות סיסמה', placeholder: '••••••••', error: 'הסיסמאות אינן תואמות' },
    terms: { before: 'אישור קריאה והסכמה ל', tos: 'תנאי השימוש', between: ' ול', privacy: 'מדיניות הפרטיות' },

    steps: {
      label: 'שלבי ההרשמה',
      of: 'שלב {current} מתוך {total}',
      details: 'פרטי חשבון ועסק',
      notifications: 'התראות בדוא״ל',
      next: 'המשך',
      back: 'חזרה',
    },

    // The owner-approved wording, unchanged. Refusing email blocks nothing.
    emailNotifications: {
      legend: 'התראות בדוא״ל',
      body: 'FieldSync יכולה לשלוח הודעות תפעוליות בדוא״ל בנוגע לפרויקטים, משימות, בקשות, אישורים ושינויים בלוחות זמנים שעשויים לדרוש התייחסות.',
      inApp: 'ההתראות עצמן יופיעו גם בתוך FieldSync בהתאם לאופי האירוע ולהגדרות החשבון.',
      optOut: 'אפשר לבחור שלא לקבל הודעות בדוא״ל ולהמשיך להשתמש במערכת כרגיל. במקרה כזה, חשוב לעקוב אחר ההתראות בתוך FieldSync, משום שעדכון שדורש התייחסות בזמן עלול שלא להיקרא מיד.',
      accept: 'קבלת הודעות תפעוליות בדוא״ל',
      decline: 'הסתמכות על ההתראות בתוך FieldSync בלבד',
      changeable: 'אפשר לשנות את הבחירה בהמשך בהגדרות ההתראות.',
    },
  },

  /** The three registration routes. Each opens its own taxonomy below. */
  specialtyCategories: {
    contractor: 'קבלנים / בעלי מקצוע מבצעים',
    architectural: 'קטגוריה אדריכלית / בעלי מקצוע',
    supplier: 'ספקים',
  },

  specialties: {
    shell: 'קבלן שלד',
    development_infrastructure: 'קבלן פיתוח ותשתיות',
    drilling: 'קבלן קידוחים',
    concrete_cutting: 'ניסור בטון',
    door_installation: 'קבלן התקנות דלתות',
    waterproofing: 'עבודות איטום',
    tiling: 'עבודות ריצוף',
    plastering: 'עבודות טיח',
    painting: 'עבודות צבע',
    electrical: 'עבודות חשמל',
    plumbing: 'עבודות אינסטלציה',
    metalwork: 'עבודות מסגרות',
    carpentry: 'עבודות נגרות',
    stonework: 'עבודות שיש',
    grouting: 'עבודות רובה',
    concrete_pumps: 'משאבות בטון',
    sand_pumps: 'משאבות חול',
    haulage_crane: 'הובלות ועבודות מנוף',
    heavy_equipment: 'כלי צמ״ה',
    contractor_other: 'אחר',

    structural_engineer: 'קונסטרוקטור',
    construction_supervisor: 'מפקח בנייה',
    soil_consultant: 'יועץ קרקע / יועץ אדמה',
    architect: 'אדריכל',
    architectural_other: 'אחר',

    stone_supplier: 'ספק שיש',
    building_materials_supplier: 'ספק חומרי בניין',
    steel_plant: 'מפעלי ברזל',
    concrete_plant: 'מפעלי בטון',
    ceramics_supplier: 'ספק קרמיקה',
    carpentry_supplier: 'ספק נגרות',
    colored_render_plant: 'מפעלי שליכט צבעוני',
    aluminum_supplier: 'ספק אלומיניום',
    doors_supplier: 'ספק דלתות',
    drainage_pipe_supplier: 'ספק צנרת ניקוז',
    concrete_pump_supplier: 'ספק משאבות בטון',
    supplier_other: 'אחר',
  },

  /** The nested subtype of קבלן קידוחים. */
  drillingTypes: {
    injection_pvc: 'קידוחי החדרה וצנרת PVC',
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
    generic: 'משהו השתבש. כדאי לבדוק את הפרטים ולנסות שוב.',
    emailTaken: 'כתובת האימייל הזו כבר רשומה. אפשר להתחבר במקום.',
    validation: 'חלק מהפרטים אינם תקינים. יש לבדוק את השדות המסומנים ולנסות שוב.',
    network: 'אין תקשורת עם השרת. יש לבדוק את החיבור ולנסות שוב.',
    noInvitation: 'לא נמצאה הזמנה התואמת לפרטים שהוזנו. יש לבדוק את הפרטים ולנסות שוב, או לפנות לחברה המזמינה.',
    // Neutral on purpose: the person cannot resolve which internal row is theirs, so they are not
    // asked to. The server still distinguishes INVITATION_AMBIGUOUS in its own answer.
    ambiguousInvitation: 'לא ניתן להשלים את ההרשמה עם הפרטים שהוזנו. יש לפנות לחברה המזמינה.',
  },

  /** Browse Contractors and the Public Profile embedded in it. */
  browse: {
    title: 'עיון בקבלנים',
    lede: 'חיפוש בעלי מקצוע לפי תחום, אזור, זמינות ומרחק נסיעה בפועל.',
    resultsCount: '{count} תוצאות',
    loading: 'טוען קבלנים…',
    loadMore: 'טעינת תוצאות נוספות',
    empty: 'לא נמצאו קבלנים התואמים לסינון. אפשר לנקות חלק מהמסננים ולנסות שוב.',
    /** Says which filter emptied the list, so a correct empty result is not read as a broken one. */
    emptyByRating: 'לא נמצאו קבלנים עם דירוג של {stars} כוכבים ומעלה. קבלנים שטרם קיבלו דירוג אינם נכללים בסינון הזה.',
    clear: 'ניקוי המסננים',

    sort: {
      label: 'מיון',
      relevance: 'רלוונטיות',
      rating_desc: 'דירוג — מהגבוה לנמוך',
    },

    filters: {
      title: 'סינון',
      search: { label: 'חיפוש', placeholder: 'שם בעל מקצוע או שם חברה' },
      category: { label: 'מסלול', placeholder: 'כל המסלולים' },
      specialty: { label: 'תחום', placeholder: 'כל התחומים' },
      region: { label: 'אזור', placeholder: 'כל האזורים' },
      availability: { label: 'זמינות' },
      advanced: 'סינון מתקדם',
      advancedClose: 'סגירת הסינון המתקדם',
    },

    advanced: {
      title: 'סינון מתקדם',
      /** The two location filters are deliberately separate controls. */
      placeTitle: 'סינון לפי מקום',
      placeLede: 'הצגת קבלנים שאישרו במפורש נכונות לעבוד במקום שנבחר.',
      placeLabel: 'מקום',
      distanceTitle: 'סינון לפי מרחק נסיעה',
      distanceLede: 'הצגת קבלנים שמרחק הנסיעה בכביש שלהם מנקודת המוצא קטן מהערך שנבחר.',
      originLabel: 'נקודת מוצא',
      maxKmLabel: 'מרחק נסיעה מרבי',
      maxKmHint: 'כל מספר בין 1 ל־500 ק״מ.',
      km: 'ק״מ',
      degraded: 'לא ניתן היה לחשב מרחק עבור חלק מהתוצאות.',
      ratingTitle: 'סינון לפי דירוג',
      ratingLede: 'הצגת קבלנים שהדירוג הממוצע שקיבלו הוא לפחות כמספר הכוכבים שנבחר.',
      ratingHint: 'בחירת מספר הכוכבים המינימלי. קבלנים שטרם קיבלו דירוג אינם עומדים בסינון הזה.',
      ratingClear: 'ביטול הסינון לפי דירוג',
    },

    card: {
      viewProfile: 'צפייה בפרופיל',
      connect: 'התחברות',
      message: 'שליחת הודעה',
      connected: 'מחוברים',
      pendingOutgoing: 'בקשת ההתחברות נשלחה',
      pendingIncoming: 'ממתין לתשובתכם',
      manageInNetwork: 'ניהול ברשת שלי',
      noRating: 'אין עדיין דירוג',
      ratingCount: '{count} דירוגים',
      drivingDistance: '{km} ק״מ נסיעה',
      /** Never a number: no approved flexibility arithmetic exists. */
      noFlexibility: 'אין עדיין ציון גמישות',
    },

    profile: {
      close: 'סגירת הפרופיל',
      about: 'על עצמי',
      details: 'פרטים ואזור עבודה',
      city: 'עיר',
      region: 'אזור',
      position: 'תפקיד בחברה',
      travelRadius: 'מרחק נסיעה מועדף',
      approvedPlaces: 'מקומות שאושרו לעבודה',
      noApprovedPlaces: 'לא הוגדרו מקומות מאושרים.',
      work: 'עבודות שהושלמו',
      noWork: 'אין עדיין עבודות שהושלמו.',
      badge: 'הושלם ב־FieldSync',
      phones: 'פרטי קשר',
      officePhone: 'טלפון משרד',
      businessPhone: 'טלפון עסקי',
      phonesHidden: 'אין פרטי קשר זמינים.',
      ratings: 'דירוג',
      noRatings: 'אין עדיין דירוג.',
      rate: 'דירוג בעל המקצוע',
      cannotRateSelf: 'אי אפשר לדרג פרופיל עצמי.',
      cannotRateYet: 'דירוג אפשרי רק לאחר עבודה משותפת שהושלמה במערכת.',
      loading: 'טוען פרופיל…',
      notFound: 'הפרופיל אינו זמין.',
    },

    travel: {
      title: 'המקומות שאושרו להגעה',
      close: 'סגירה',
      radiusLabel: 'מרחק נסיעה מועדף',
      radiusHint: 'כל מספר בין 1 ל־500 ק״מ. אפשר לגרור או להקליד.',
      baseLabel: 'נקודת המוצא',
      baseRequired: 'יש לבחור נקודת מוצא.',
      baseFromProfile: 'זהו המקום השמור בפרופיל, וממנו נמדדים מרחקי הנסיעה. שינוי כאן מעדכן גם את הפרופיל.',
      propose: 'חישוב המקומות',
      /** Approved wording. It states what is approved and offers removal; it never claims completeness. */
      reviewQuestion: 'אלו המקומות שאושרו להגעה. ניתן להסיר אזורים שאינם רלוונטיים.',
      suggestedNote: 'הרשימה מבוססת על הצעות של Google ואינה בהכרח כוללת כל יישוב באזור.',
      partialNote: 'חלק מהמסלולים לא חושבו, ולכן ייתכן שחסרים מקומות ברשימה.',
      remove: 'הסרה',
      removedTitle: 'מקומות שהוסרו',
      removedNote: 'מקומות אלו לא יוצעו שוב. לאישור מקום מחדש יש להוסיף אותו ידנית בשדה שלמטה.',
      addManually: 'הוספת מקום ידנית',
      outsideRadius: 'מחוץ לרדיוס',
      confirm: 'אישור הרשימה',
      openEditor: 'עריכת אזורי הנסיעה שלי',
      saved: 'הרשימה נשמרה.',
      loading: 'טוען העדפות…',
      empty: 'לא נמצאו מקומות מוצעים.',
    },

    place: {
      placeholder: 'הקלדת שם מקום…',
      searching: 'מחפש…',
      noResults: 'לא נמצאו מקומות.',
      clear: 'ניקוי',
      unavailable: 'חיפוש המקומות אינו זמין כרגע.',
    },

    errors: {
      network: 'אין תקשורת עם השרת. יש לבדוק את החיבור ולנסות שוב.',
      locationUnavailable: 'שירות המיקומים אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר.',
      locationNotConfigured: 'שירות המיקומים אינו מוגדר בשרת.',
      invalidPlace: 'לא ניתן לזהות את המקום שנבחר.',
      generic: 'משהו השתבש. אפשר לנסות שוב.',
      retry: 'ניסיון חוזר',
    },
  },

  location: {
    legacyCity: 'המיקום השמור הוא "{city}" בלבד, בלי מיקום על המפה. בחירת מקום מהרשימה תוסיף אותו.',
    unavailableFallback: 'חיפוש המקומות אינו זמין כרגע, ולכן אפשר להקליד את שם היישוב.',
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
        'הודעה ראשונה ממי שאין איתו חיבור מגיעה כבקשה — לאישור, לדחייה או לחסימה',
        'ציוני אמון מהתנהגות אמיתית — לא מדיווח עצמי',
      ],
      footerNote:
        'אותו קבלן יכול להיות קבלן ראשי בפרויקט אחד וקבלן משנה באחר. התפקיד עוקב אחר העבודה, לא אחרי האדם.',
    },
    title: 'ברוכים השבים',
    subtitle: 'התחברות לחשבון כדי להמשיך',
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com' },
    password: { label: 'סיסמה', placeholder: '••••••••' },
    forgot: 'שכחתי את הסיסמה',
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
      credentials: 'אימייל או סיסמה שגויים. אפשר לנסות שוב.',
      network: 'אין תקשורת עם השרת. יש לבדוק את החיבור ולנסות שוב.',
      generic: 'משהו השתבש. אפשר לנסות שוב.',
      emailRequired: 'יש להזין כתובת אימייל.',
      emailInvalid: 'כתובת אימייל לא תקינה.',
      passwordRequired: 'יש להזין סיסמה.',
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
      headline: 'הפרויקטים ממתינים — הגישה תחזור.',
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
    title: 'איפוס סיסמה',
    subtitle: 'הזנת האימייל המשויך לחשבון תשלח קישור לאיפוס.',
    email: { label: 'כתובת אימייל', placeholder: 'you@example.com', error: 'יש להזין כתובת אימייל תקינה' },
    submit: 'שליחת קישור לאיפוס הסיסמה',
    remembered: 'נזכרתי בסיסמה',
    signIn: 'להתחברות',
    sentTitle: 'בדיקת תיבת הדואר',
    sentSubtitle: 'אם קיים חשבון לכתובת שהוזנה, קישור לאיפוס נשלח אליה. הקישור יפוג בתוך 30 דקות.',
    backButton: 'חזרה להתחברות',
    noMail: 'לא הגיע כלום?',
    resend: 'שליחה מחדש',
    /** The honest build state, in the same voice the other screens use for an absent endpoint. */
    errors: {
      network: 'לא ניתן להתחבר לשרת. יש לבדוק את החיבור לאינטרנט ולנסות שוב.',
      generic: 'אירעה שגיאה. אפשר לנסות שוב.',
    },
  },

  resetPassword: {
    brand: {
      beta: 'בטא',
      headline: 'סיסמה חדשה, וחזרה פנימה.',
      sub: 'בחירת סיסמה חזקה שלא הייתה בשימוש בעבר. לאחר האיפוס כל הסשנים הפעילים יינותקו.',
      featuresLabel: 'הנחיות לסיסמה',
      features: [
        'לפחות 8 תווים',
        'שילוב של אותיות, מספרים וסימנים מחזק את הסיסמה',
        'סיסמה מאתר אחר אינה מתאימה',
      ],
      footerNote: 'הקישור לאיפוס הוא חד-פעמי ומאבד תוקף לאחר השימוש או בתום 30 דקות.',
    },
    backToSignIn: 'חזרה להתחברות',
    title: 'בחירת סיסמה חדשה',
    subtitle: 'בחירת סיסמה חזקה שלא הייתה בשימוש בעבר.',
    newPassword: { label: 'סיסמה חדשה', placeholder: '••••••••', error: 'הסיסמה חייבת לכלול לפחות 8 תווים' },
    confirmPassword: { label: 'אימות סיסמה', placeholder: '••••••••', hint: 'יש להזין את אותה הסיסמה שוב לאימות.', error: 'הסיסמאות אינן תואמות' },
    togglePassword: 'הצגת סיסמה',
    submit: 'שמירת הסיסמה החדשה',
    doneTitle: 'הסיסמה עודכנה',
    doneSubtitle: 'הסיסמה שונתה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.',
    continue: 'המשך להתחברות',
    errors: {
      // The server answers one code for unknown, expired, superseded and already-used alike.
      invalidToken: 'הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו. ניתן לשלוח קישור חדש.',
      weakPassword: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
      network: 'לא ניתן להתחבר לשרת. יש לבדוק את החיבור לאינטרנט ולנסות שוב.',
      generic: 'אירעה שגיאה. אפשר לנסות שוב.',
    },
    /** Shown beside the email field when the page was opened without a usable link. */
    noLinkLede: 'הזנת כתובת המייל תשלח קישור חדש לאיפוס הסיסמה.',
    sendNewLink: 'שליחת קישור חדש',
  },

  permissions: {
    title: 'ניהול הרשאות',
    lede: 'ההרשאות בכל הפרויקטים שבניהולי, במקום אחד. כל הרשאה שייכת לפרויקט מסוים.',
    loading: 'טעינת ההרשאות…',
    retry: 'ניסיון נוסף',
    backToProjects: 'חזרה לפרויקטים',
    empty: 'אין פרויקטים שניתן לנהל בהם הרשאות.',
    entry: 'ניהול הרשאות',

    grants: {
      title: 'הרשאות לפי פרויקט',
      role: 'תפקיד בפרויקט',
      status: 'סטטוס',
      permissions: 'הרשאות',
      revoke: 'ביטול ההרשאה',
      none: 'לא הוגדרו הרשאות פרטניות.',
      revoked: 'בוטלה',
      declined: 'ההזמנה נדחתה',
      invited: 'ההזמנה ממתינה לתשובה',
      you: 'ההרשאה שלי',
    },

    fullAuthority: {
      label: 'סמכות ניהול מלאה בפרויקט',
      title: 'מתן סמכות ניהול מלאה',
      disclaimer: 'מתן גישה זו מעניק סמכות ניהול מלאה בפרויקט, כולל הרשאות שיתווספו בעתיד. ניתן לצמצם או לבטל את הגישה בכל עת.',
      confirm: 'מתן הסמכות',
      dismiss: 'חזרה',
      reduce: 'הסרת הסמכות המלאה',
      granted: 'סמכות ניהול מלאה',
    },

    templates: {
      title: 'תבניות הרשאה',
      lede: 'ערכות הרשאות לשימוש חוזר, שנוצרות על ידי החברה. החלת תבנית מעתיקה את ההרשאות באותו רגע.',
      name: 'שם התבנית',
      namePlaceholder: 'קבלן משנה',
      create: 'יצירת תבנית',
      remove: 'מחיקה',
      none: 'עדיין לא נוצרו תבניות.',
      nameTaken: 'כבר קיימת תבנית בשם הזה.',
    },

    perms: {
      'project.edit': 'עריכת הפרויקט',
      'project.cancel': 'ביטול הפרויקט',
      'project.calendar.manage': 'ניהול לוח ימי העבודה',
      'project.stage.manage': 'ניהול שלבי הביצוע ורצף העבודה',
      'project.member.invite': 'הזמנת משתתפים',
      'project.member.manage': 'ניהול משתתפים',
      'project.permission.grant': 'מתן הרשאות',
      'task.create': 'יצירת משימות',
      'task.assign': 'שיוך משימות',
      'schedule.exception.approve': 'אישור חריגים בלוח',
      'schedule.partial_release.manage': 'שחרור חלקי של עבודה להמשך',
    },

    roles: {
      main_contractor: 'קבלן ביצוע ראשי',
      subcontractor: 'קבלן משנה',
      professional: 'בעל מקצוע',
      supplier: 'ספק',
      viewer: 'צפייה בלבד',
    },

    errors: {
      notPermitted: 'אין הרשאה לנהל הרשאות בפרויקט הזה.',
      notFound: 'הפריט לא נמצא.',
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      unknown: 'לא הצלחנו להשלים את הפעולה כרגע.',
    },
  },

  tasks: {
    title: 'המשימות שלי',
    lede: 'משימות בפרויקטים ועבודות עצמאיות במקום אחד.',
    loading: 'טעינת המשימות…',
    loadMore: 'הצגת עוד',
    retry: 'ניסיון נוסף',

    /** Owner-approved 2026-08-30. The pair the whole tracking model is named after. */
    start: 'התחלת עבודה',
    complete: 'סיום עבודה',

    state: {
      not_started: 'טרם התחילה',
      in_progress: 'בביצוע',
      completed: 'הושלמה',
    },
    overdue: 'באיחור',
    overdueBy: 'באיחור של {days} ימים',
    overdueByOne: 'באיחור של יום',
    overdueByTwo: 'באיחור של יומיים',

    kind: {
      project: 'משימה בפרויקט',
      standalone: 'עבודה עצמאית',
    },

    groups: {
      overdue: { title: 'באיחור', lede: 'עבודה שתאריך היעד שלה עבר והיא עדיין לא הושלמה. האיחור מחושב מהתאריך ואינו סטטוס שנשמר.', empty: 'אין כרגע משימות או עבודות באיחור.' },
      open: { title: 'עבודה פתוחה', lede: 'כל מה שעדיין פתוח ואינו באיחור, לפי הקִרבה לתאריך היעד.', empty: 'אין כרגע עבודה פתוחה.' },
      done: { title: 'הושלמו', lede: 'עבודה שסומנה כהושלמה. היא נשארת כאן לצורך מעקב.', empty: 'עדיין לא סומנה עבודה כהושלמה.' },
    },

    row: {
      due: 'יעד {date}',
      from: 'מאת {name}',
      /** Owner-approved 2026-08-30 for the rows with no counterparty at all. */
      selfOpened: 'עבודה שפתחתי',
      delegated: 'העבודה הועברה לביצוע',
      performing: 'העבודה התקבלה לביצוע',
      orphaned: 'אין כרגע אחראי לעבודה הזו',
      noProject: 'ללא פרויקט',
      completedOn: 'הושלמה ב־{date}',
    },

    filters: {
      title: 'סינון ומיון',
      project: { label: 'פרויקט', all: 'כל הפרויקטים', none: 'ללא פרויקט' },
      state: { label: 'סטטוס', all: 'כל הסטטוסים' },
      kind: { label: 'סוג העבודה', all: 'הכול' },
      sort: { label: 'מיון', due_asc: 'יעד קרוב תחילה', due_desc: 'יעד רחוק תחילה' },
    },

    empty: 'לא הוקצו לי משימות בפרויקטים ולא פתחתי עבודה עצמאית. כשמשימה תוקצה לי או כשאפתח עבודה משלי, היא תופיע כאן.',

    detail: {
      title: 'פרטי העבודה',
      back: 'חזרה למשימות',
      loading: 'טעינת פרטי העבודה…',
      notFound: 'העבודה לא נמצאה, או שאין גישה אליה.',
      dates: 'מ-{start} עד {due}',

      stage: {
        title: 'שלב בפרויקט',
        inStage: 'העבודה שייכת לשלב {name}',
        none: 'לא הוגדר שלב לעבודה הזו.',
        gate: 'שלב חוסם',
        blockedBy: 'שלבים שצריכים להסתיים קודם',
        noBlockers: 'אין שלבים שקודמים לשלב הזה.',
        partialRelease: 'שוחרר חלקית',
        note: 'התלויות בפרויקט מוגדרות בין שלבים, לא בין משימות בודדות.',
      },

      delegation: {
        title: 'העברת ביצוע',
        lede: 'העברת הביצוע לגורם אחר. האחריות נשארת אצלי, והצד שמעליי ממשיך לראות אותי כמבצע.',
        performedBy: 'הביצוע הועבר ל{name}',
        scopeWhole: 'כל העבודה',
        scopePart: 'חלק מהעבודה',
        partLabel: 'החלק שהועבר',
        partPlaceholder: 'מעבר הצנרת בלבד',
        who: { label: 'למי להעביר', placeholder: 'חיפוש לפי שם' },
        scope: { label: 'היקף ההעברה' },
        send: 'העברת הביצוע',
        end: 'סיום ההעברה',
        endedNote: 'סיום ההעברה מחזיר את הביצוע אליי.',
        receivedNote: 'העבודה התקבלה לביצוע. פרטי הפרויקט הרחב אינם מוצגים כאן.',
        ownCrewOnly: 'הצד שמעליי דרש ביצוע בצוות עצמי, ולכן לא ניתן להעביר את העבודה הזו.',
        onSite: 'נדרשת נוכחות שלי באתר גם לאחר העברת הביצוע.',
        noRedelegate: 'עבודה שהתקבלה לביצוע אינה ניתנת להעברה נוספת.',
      },

      privateWork: {
        title: 'הארגון הפרטי שלי',
        lede: 'תת-משימות והערות לשימוש עצמי בלבד. אף אחד אחר לא רואה אותן, והן אינן משנות את מצב העבודה.',
        subtask: 'תת-משימה',
        note: 'הערה',
        addLabel: 'הוספת פריט',
        addPlaceholder: 'סימון מסלול',
        add: 'הוספה',
        remove: 'מחיקה',
        none: 'עדיין אין פריטים בארגון הפרטי.',
        noEffect: 'סימון תת-משימה אינו משנה את מצב העבודה כלפי חוץ.',
      },

      dateChange: {
        title: 'בקשה לשינוי תאריך',
        unavailable: 'מנגנון שינוי התאריכים עדיין לא נבנה, ולכן לא ניתן להגיש בקשה מכאן. לא מוצג כאן מספר משימות מושפעות.',
        request: 'בקשה לשינוי תאריך',
      },

      workPlans: {
        title: 'תוכניות עבודה',
        lede: 'קובצי PDF בגרסאות. גרסה חדשה אינה מוחקת את הקודמת — ההיסטוריה נשמרת.',
        none: 'אין עדיין תוכנית עבודה למשימה הזו.',
        add: 'הוספת תוכנית',
        newVersion: 'גרסה חדשה',
        history: 'היסטוריית גרסאות',
        current: 'הגרסה הפעילה',
        makeCurrent: 'הפיכה לגרסה הפעילה',
        versionLabel: 'גרסה {n}',
        by: 'הועלה על ידי {name}',
        private: 'חליפין פרטי',
        limits: 'קובץ PDF בלבד, עד 30MB.',
        visibility: {
          legend: 'מי יראה את התוכנית',
          shared: 'כל מי שרואה את המשימה',
          private: 'חליפין פרטי בלבד',
        },
        loadFailed: 'טעינת תוכניות העבודה נכשלה.',
        actionFailed: 'הפעולה נכשלה.',
      },
    },

    errors: {
      notFound: 'העבודה לא נמצאה, או שאין גישה אליה.',
      notPerformer: 'רק מי שמבצע בפועל את העבודה יכול לדווח עליה.',
      already: 'מצב העבודה כבר עודכן. הרשימה רועננה.',
      orphaned: 'אין כרגע אחראי לעבודה הזו, ולכן לא ניתן לדווח עליה.',
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      unknown: 'לא הצלחנו להשלים את הפעולה כרגע.',
    },

    create: {
      entry: 'פתיחת עבודה',
      title: 'פתיחת עבודה',
      lede: 'פתיחת משימה בתוך פרויקט, או עבודה עצמאית שאינה שייכת לפרויקט.',
      loading: 'טעינת האפשרויות…',
      loadingProject: 'טעינת פרטי הפרויקט…',
      back: 'חזרה למשימות',
      submit: 'פתיחת העבודה',
      cancel: 'ביטול',

      kind: {
        label: 'סוג העבודה',
        project: 'משימה בפרויקט',
        standalone: 'עבודה עצמאית',
        standaloneNote: 'עבודה עצמאית נפתחת תמיד על שמי ואינה משויכת לפרויקט.',
      },

      project: { label: 'פרויקט', placeholder: 'בחירת פרויקט' },
      stage: {
        label: 'שלב בפרויקט',
        placeholder: 'בחירת שלב',
        gate: 'שלב חוסם',
        note: 'משימה בפרויקט משתייכת תמיד לשלב. התלויות בפרויקט מוגדרות בין שלבים, לא בין משימות.',
        none: 'עדיין לא הוגדרו שלבים בפרויקט הזה.',
        addTitle: 'הוספת שלב לפרויקט',
        addLabel: 'שם השלב',
        addPlaceholder: 'שלד',
        addGate: 'שלב חוסם — כל מה שאחריו ממתין לסיומו',
        add: 'הוספת שלב',
        cannotAdd: 'הוספת שלב לפרויקט נעשית על ידי מי שמורשה לערוך אותו.',
      },

      assignee: {
        label: 'למי לשייך את העבודה',
        placeholder: 'בחירת משתתף',
        note: 'רק משתתף פעיל בפרויקט. הזמנה שטרם נענתה אינה נכללת.',
        selfOnly: 'ההרשאה הנוכחית מאפשרת לפתוח עבודה על שמי בלבד.',
        me: 'על שמי',
      },

      titleField: { label: 'שם העבודה', placeholder: 'יציקת עמודים בקומה שנייה' },
      description: { label: 'תיאור', placeholder: 'מה בדיוק צריך להתבצע' },
      startDate: { label: 'תאריך התחלה' },
      dueDate: { label: 'תאריך יעד' },
      window: 'העבודה נקבעת בתוך טווח הפרויקט: {start} עד {end}.',

      terms: {
        title: 'תנאי ההתחייבות',
        lede: 'תנאים שנקבעים מול מי שמקבל את העבודה, ומוצגים לו.',
        ownCrewOnly: 'ביצוע בצוות עצמי בלבד',
        ownCrewOnlyHint: 'העבודה לא תהיה ניתנת להעברה לגורם אחר.',
        onSite: 'חובת נוכחות באתר',
        onSiteHint: 'נדרשת נוכחות באתר גם אם הביצוע יועבר לגורם אחר.',
      },

      warning: {
        title: 'שים לב',
        nonWorkingStart: 'תאריך ההתחלה {date} אינו יום עבודה לפי לוח העבודה של הפרויקט.',
        nonWorkingDue: 'תאריך היעד {date} אינו יום עבודה לפי לוח העבודה של הפרויקט.',
        note: 'העבודה נפתחה. חגים ומועדים אינם נבדקים כאן.',
      },

      noProjects: 'אין כרגע פרויקט שאפשר לפתוח בו עבודה. הרשאת פתיחת עבודה ניתנת בנפרד לכל פרויקט.',
      noStandalone: 'החשבון הזה אינו מורשה לפתוח עבודה עצמאית.',
      nothing: 'אין כרגע דרך לפתוח עבודה מהחשבון הזה.',

      errors: {
        required: 'שדה חובה',
        dueBeforeStart: 'תאריך היעד אינו יכול להקדים את תאריך ההתחלה.',
        outsideWindow: 'התאריך חורג מטווח הפרויקט, שמסתיים בתאריך החריגה המרבי.',
        createDenied: 'החשבון הזה אינו מורשה לפתוח עבודה בפרויקט הזה.',
        assignDenied: 'שיוך העבודה לאדם אחר דורש הרשאה נפרדת.',
        standaloneDenied: 'החשבון הזה אינו מורשה לפתוח עבודה עצמאית.',
        assigneeNotMember: 'אפשר לשייך עבודה רק למשתתף פעיל בפרויקט.',
        stageNotFound: 'השלב שנבחר אינו קיים בפרויקט הזה.',
        invalidDate: 'התאריך שהוזן אינו תאריך אמיתי.',
        notFound: 'הפרויקט לא נמצא, או שאין גישה אליו.',
        network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
        unknown: 'לא הצלחנו לפתוח את העבודה כרגע.',
      },
    },
  },

  projectDashboard: {
    title: 'לוח הפרויקט',
    lede: 'סביבת העבודה של הפרויקט הזה.',
    entry: 'לוח הפרויקט',
    loading: 'טעינת הפרויקט…',
    retry: 'ניסיון נוסף',
    backToProjects: 'חזרה לפרויקטים',
    notFound: 'הפרויקט לא נמצא, או שאין גישה אליו.',
    network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',

    summary: {
      title: 'פרטי הפרויקט',
      type: 'סוג',
      size: 'גודל',
      location: 'מיקום',
      noLocation: 'לא הוגדר מיקום',
      status: 'סטטוס',
      start: 'תאריך התחלה',
      target: 'תאריך יעד לסיום',
      original: 'יעד מקורי',
      ceiling: 'תאריך חריגה מרבי',
      overrun: 'חריגה בפועל',
      overrunDays: '{days} ימים',
      noOverrun: 'אין חריגה',
    },

    actions: {
      title: 'ניהול הפרויקט',
      lede: 'הפעולות המוצגות כאן הן אלה שהחשבון הזה מורשה לבצע בפרויקט.',
      edit: 'עריכת הפרויקט',
      members: 'ניהול המשתתפים',
      permissions: 'ניהול ההרשאות',
      calendar: 'לוח ימי העבודה',
      none: 'אין פעולות ניהול זמינות בפרויקט הזה.',
    },

    membersPanel: {
      title: 'משתתפים',
      active: 'משתתפים פעילים: {count}',
      pending: 'הזמנות שממתינות לתשובה: {count}',
      open: 'פתיחת מסך המשתתפים',
    },

    permissionsPanel: {
      title: 'הרשאות בפרויקט',
      lede: 'אותן הרשאות שמוצגות במסך המרכזי, מסוננות לפרויקט הזה בלבד.',
      empty: 'עדיין לא הוגדרו הרשאות בפרויקט הזה.',
      central: 'מסך ההרשאות המרכזי',
    },

    calendarPanel: {
      title: 'לוח ימי העבודה',
      pinned: 'הפרויקט עובד לפי גרסה {version} של לוח החברה.',
      unknown: 'לא נקבעה גרסת לוח לפרויקט הזה.',
      current: 'הגרסה הנוכחית בחברה: {version}',
      upToDate: 'הפרויקט עובד לפי הגרסה העדכנית של החברה.',
      outdated: 'קיימת גרסה חדשה יותר בחברה. היא לא תחול על הפרויקט הזה עד לבחירה מפורשת.',
      overridden: 'הפרויקט מותאם אישית מעל הגרסה שנקבעה לו.',
      adopt: 'החלת הגרסה החדשה',
      keepOverrides: 'שמירת ההתאמות של הפרויקט',
      workingDays: 'ימי עבודה',
      hours: 'שעות עבודה',
      historyTitle: 'היסטוריית החלות',
      historyNone: 'עדיין לא הוחלה גרסה חדשה על הפרויקט הזה.',
      historyRow: 'מגרסה {from} לגרסה {to}, על ידי {name}',
      historyFirst: 'לגרסה {to}, על ידי {name}',
      historyKept: 'ההתאמות נשמרו',
      historyDropped: 'ההתאמות בוטלו',
    },

    tasks: {
      title: 'משימות',
      unavailable: 'עדיין לא נפתחו משימות בפרויקט הזה. לא מוצג כאן אפס במקום נתון שאינו קיים.',
      total: 'סך המשימות: {count}',
      open: 'פתוחות: {count}',
      overdue: 'באיחור: {count}',
      completed: 'הושלמו: {count}',
    },
  },

  members: {
    title: 'משתתפים בפרויקט',
    lede: 'האנשים שמשתתפים בפרויקט הזה, וההזמנות שטרם נענו.',
    entry: 'משתתפים',
    loading: 'טעינת המשתתפים…',
    retry: 'ניסיון נוסף',
    backToProjects: 'חזרה לפרויקטים',

    active: { title: 'משתתפים', none: 'אין עדיין משתתפים בפרויקט הזה.' },
    pending: { title: 'הזמנות שממתינות לתשובה', none: 'אין הזמנות פתוחות.' },

    row: {
      role: 'תפקיד בפרויקט',
      company: 'חברה',
      noCompany: 'ללא שיוך לחברה',
      invitedBy: 'הוזמן על ידי {name}',
      invitedOn: 'ההזמנה נשלחה ב־{date}',
      you: 'זה אני',
      remove: 'הסרה מהפרויקט',
      withdraw: 'ביטול ההזמנה',
      noPermissions: 'לא הוגדרו הרשאות פרטניות.',
      permissionsHidden: 'ההרשאות מוצגות רק למי שמוסמך לנהל אותן.',
    },

    invite: {
      title: 'הזמנת משתתף',
      lede: 'חיפוש לפי שם, בחירת התפקיד בפרויקט וקביעת ההרשאות. ההזמנה הופכת להשתתפות רק לאחר אישור של המוזמן.',
      search: { label: 'חיפוש אדם', placeholder: 'שם או שם חברה' },
      searching: 'מחפש…',
      noResults: 'לא נמצאו תוצאות מתאימות.',
      selected: 'נבחר: {name}',
      clear: 'בחירה מחדש',
      role: { label: 'התפקיד בפרויקט', placeholder: 'בחירת תפקיד' },
      send: 'שליחת ההזמנה',
      sent: 'ההזמנה נשלחה.',
    },

    authority: {
      title: 'ההרשאות שיינתנו',
      lede: 'התפקיד בפרויקט הוא תיאורי בלבד ואינו מעניק דבר. ההרשאות ניתנות כאן, במפורש.',
      none: 'ללא הרשאות ניהול',
      selected: 'בחירת הרשאות פרטניות',
      template: 'לפי תבנית הרשאות',
      copy: 'העתקת הרשאות ממשתתף קיים',
      full: 'סמכות ניהול מלאה בפרויקט',
      templatePlaceholder: 'בחירת תבנית',
      copyPlaceholder: 'בחירת משתתף',
      noTemplates: 'עדיין לא נוצרו תבניות הרשאה.',
      noCopySource: 'אין עדיין ממי להעתיק הרשאות.',
      manage: 'ניהול ההרשאות',
    },

    incoming: {
      title: 'הזמנות שממתינות לתשובה',
      lede: 'הזמנה להשתתף בפרויקט של גורם אחר. הפרטים המלאים ייפתחו לאחר האישור.',
      role: 'התפקיד המוצע: {role}',
      invitedBy: 'הוזמן על ידי {name}',
      dates: 'מ-{start} עד {target}',
      accept: 'אישור ההזמנה',
      decline: 'דחיית ההזמנה',
      none: 'אין הזמנות שממתינות לתשובה.',
    },

    errors: {
      notFound: 'הפרויקט לא נמצא, או שאין גישה אליו.',
      notPermitted: 'אין הרשאה לבצע את הפעולה הזו בפרויקט.',
      alreadyOnProject: 'האדם הזה כבר משתתף בפרויקט או שההזמנה אליו עדיין פתוחה.',
      blocked: 'לא ניתן להזמין את האדם הזה.',
      invitationClosed: 'ההזמנה כבר אינה פתוחה. הרשימה רועננה.',
      ownAuthority: 'לא ניתן להסיר את ההשתתפות של עצמי מהפרויקט.',
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      unknown: 'לא הצלחנו להשלים את הפעולה כרגע.',
    },
  },

  projects: {
    title: 'הפרויקטים שלי',
    lede: 'הפרויקטים של העסק, לפי סדר יצירה.',
    loading: 'טעינת הפרויקטים…',
    loadMore: 'הצגת עוד',
    retry: 'ניסיון נוסף',
    empty: 'עדיין אין פרויקטים. אפשר להתחיל בפרויקט הראשון.',
    create: 'פרויקט חדש',
    edit: 'עריכה',
    backToList: 'חזרה לפרויקטים',

    type: {
      label: 'סוג הפרויקט',
      placeholder: 'בחירת סוג הפרויקט',
      villa: 'וילה',
      private_house: 'בית פרטי',
      building: 'בניין',
      other: 'אחר',
      otherLabel: 'פירוט סוג הפרויקט',
      otherPlaceholder: 'מבנה חקלאי',
    },

    size: {
      label: 'גודל הפרויקט',
      placeholder: 'בניין 12 קומות',
      hint: 'תיאור חופשי של היקף הפרויקט — לדוגמה: בניין 10 קומות, 2 בניינים.',
    },

    calendar: {
      title: 'לוח ימי עבודה',
      inheritedOnCreate: 'הפרויקט יקבל את לוח ימי העבודה של החברה כפי שהוא כרגע. שינוי עתידי בלוח החברה לא ישנה את הפרויקט הזה מעצמו.',
      pinned: 'הפרויקט עובד לפי גרסת לוח העבודה שנקבעה לו.',
      outdated: 'קיימת גרסה חדשה יותר של לוח העבודה בחברה. אפשר להחיל אותה על הפרויקט הזה, ורק לאחר בחירה מפורשת.',
      adopt: 'החלת הגרסה החדשה',
      keepOverrides: 'שמירת ההתאמות של הפרויקט',
      workingDays: 'ימי עבודה',
      hours: 'שעות עבודה',
      overridden: 'הפרויקט מותאם אישית',
      days: {
        sunday: 'ראשון', monday: 'שני', tuesday: 'שלישי', wednesday: 'רביעי',
        thursday: 'חמישי', friday: 'שישי', saturday: 'שבת',
      },
    },

    groups: {
      mine: 'הפרויקטים שלי',
      notManaged: 'פרויקטים שאינם בניהולי',
    },

    status: {
      planned: 'טרם התחיל',
      active: 'בביצוע',
      paused: 'מוקפא',
      completed: 'הושלם',
    },

    card: {
      dates: 'מ-{start} עד {target}',
      originalTarget: 'יעד מקורי: {date}',
      overrun: 'חריגה בפועל: {days} ימים',
      ceiling: 'תאריך חריגה מרבי: {date}',
      noLocation: 'לא הוגדר מיקום',
    },

    form: {
      createTitle: 'פרויקט חדש',
      editTitle: 'עריכת פרויקט',
      createLede: 'הזנת פרטי הפרויקט. אפשר לעדכן אותם בהמשך.',
      editLede: 'עדכון פרטי הפרויקט.',
      name: { label: 'שם הפרויקט', placeholder: 'מגדל הצפון' },
      description: { label: 'תיאור', placeholder: 'תיאור קצר של היקף העבודה' },
      location: { label: 'מיקום הפרויקט', placeholder: 'עיר או כתובת' },
      address: { label: 'כתובת מדויקת', placeholder: 'הרצל 1' },
      startDate: { label: 'תאריך התחלה' },
      targetEndDate: { label: 'תאריך יעד לסיום' },
      overrunAllowance: {
        label: 'זמן חריגה מותר (בימים)',
        hint: 'נקבע פעם אחת בעת יצירת הפרויקט ואינו ניתן לשינוי לאחר מכן.',
        locked: 'זמן החריגה נקבע ביצירת הפרויקט: {days} ימים. תאריך היעד לא יכול לעבור את {date}.',
      },
      save: 'שמירה',
      cancel: 'ביטול',
      deleteProject: 'ביטול הפרויקט',
      deleteConfirm: 'ביטול הפרויקט ימחק אותו לחלוטין ולא יישאר ממנו רישום. הפעולה אפשרית רק לפני תחילת העבודה.',
      deleteConfirmAction: 'ביטול הפרויקט',
      deleteDismiss: 'חזרה',
    },

    errors: {
      required: 'שדה חובה',
      targetBeforeStart: 'תאריך היעד לא יכול להקדים את תאריך ההתחלה',
      overrunCeiling: 'תאריך היעד עובר את זמן החריגה שנקבע',
      allowanceRange: 'יש להזין מספר ימים שלם בין 0 ל-3650',
      notFound: 'הפרויקט לא נמצא.',
      notPermitted: 'אין הרשאה ליצירת פרויקטים בחברה הזו.',
      noCompany: 'החשבון אינו משויך לחברה פעילה.',
      alreadyStarted: 'הפרויקט כבר התחיל ולכן לא ניתן לבטל אותו.',
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      unknown: 'לא הצלחנו להשלים את הפעולה כרגע.',
    },
  },

  network: {
    title: 'הרשת שלי',
    lede: 'הקשרים המקצועיים, הבקשות הפתוחות והחסימות שנוצרו — הכול במקום אחד.',
    loading: 'טעינת הרשת…',
    loadMore: 'הצגת עוד',
    retry: 'ניסיון נוסף',

    tabs: {
      connected: 'מחוברים',
      incoming: 'בקשות שהתקבלו',
      outgoing: 'בקשות שנשלחו',
      blocked: 'חסימות שיצרתי',
    },

    empty: {
      connected: 'אין עדיין קשרים פעילים. אפשר למצוא בעלי מקצוע דרך מסך העיון בקבלנים.',
      incoming: 'אין בקשות חיבור שממתינות למענה.',
      outgoing: 'אין בקשות חיבור פתוחות שנשלחו.',
      blocked: 'לא נוצרו חסימות.',
    },

    since: {
      connected: 'מחוברים מאז {date}',
      incoming: 'הבקשה נשלחה ב-{date}',
      outgoing: 'הבקשה נשלחה ב-{date}',
      blocked: 'נחסם ב-{date}',
    },

    actions: {
      viewProfile: 'צפייה בפרופיל',
      accept: 'אישור',
      decline: 'דחייה',
      withdraw: 'ביטול הבקשה',
      remove: 'הסרת הקשר',
      unblock: 'ביטול החסימה',
    },

    errors: {
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      stale: 'הפעולה כבר בוצעה או שהמצב השתנה. הרשימה עודכנה.',
      unknown: 'לא הצלחנו להשלים את הפעולה כרגע.',
    },
  },

  dashboard: {
    title: 'לוח הבקרה האישי',
    welcome: 'שלום, {name}.',
    loading: 'טעינת לוח הבקרה…',
    retry: 'ניסיון נוסף',
    errors: {
      network: 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב.',
      unknown: 'לא הצלחנו לטעון את לוח הבקרה כרגע.',
    },

    company: {
      title: 'העסק',
      position: 'תפקיד',
      standing: { owner: 'בעלות על העסק', employee: 'עובד בחברה' },
      none: 'אין כרגע שיוך לחברה.',
    },

    network: {
      title: 'הרשת שלי',
      lede: 'מצב הקשרים המקצועיים, נכון לעכשיו.',
      connected: 'קשרים פעילים',
      incoming: 'בקשות שהתקבלו',
      outgoing: 'בקשות שנשלחו',
      blocked: 'חסימות שנוצרו',
      browse: 'עיון בקבלנים',
    },

    team: {
      title: 'הצוות',
      lede: 'מצב ההצטרפות לחברה, נכון לעכשיו.',
      active: 'חברי צוות פעילים',
      pendingApproval: 'ממתינים לאישור',
      openInvitations: 'מקומות שנפתחו',
      manage: 'ניהול עובדים',
    },

    reputation: {
      title: 'מוניטין',
      rating: 'דירוג ממוצע',
      ratingCount: 'מתוך {count} דירוגים',
      notRated: 'אין עדיין דירוג',
      notRatedNote: 'דירוג נוצר רק אחרי עבודה משותפת שהושלמה.',
      completedWork: 'עבודות שהושלמו',
      viewProfile: 'הפרופיל שלי',
    },

    reminder: {
      title: 'השלמת הפרופיל',
      lede: 'הפרטים האלה עדיין חסרים. אפשר להשלים אותם בכל שלב, והמסך פועל גם בלעדיהם.',
      required: 'נדרש',
      suggested: 'מומלץ',
      dismiss: 'הסתרה',
      edit: 'עריכת הפרופיל',
      items: {
        contactRoute: 'דרך יצירת קשר אחת לפחות',
        specialties: 'תחום התמחות',
        region: 'אזור עבודה',
        structuredPlace: 'מיקום מדויק על המפה',
        travelRadius: 'מרחק נסיעה מרבי',
        bio: 'תיאור מקצועי',
        avatar: 'תמונת פרופיל',
        businessPhone: 'טלפון עסקי',
        officePhone: 'טלפון משרד',
        schedulingPrefs: 'העדפות תזמון',
        completedWork: 'עבודות שהושלמו',
      },
    },

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
    lede: 'פתיחת מקומות לעובדים, ואישור הצטרפות של מי שכבר נרשמו וממתינים לאישור החברה.',

    invite: {
      title: 'פתיחת מקום בצוות',
      // Says why so little is asked for, so the two fields do not read as a form cut short.
      lede: 'נדרשים רק שם ותפקיד. כתובת המייל והסיסמה נבחרות בעת ההרשמה.',
      fullName: {
        label: 'שם מלא',
        placeholder: 'ישראל ישראלי',
        hint: 'השם המלא כפי שיוזן בהרשמה.',
      },
      companyPosition: { label: 'תפקיד בחברה', placeholder: 'בחירת תפקיד…' },
      submit: 'פתיחת מקום',
      created: 'המקום נפתח. אפשר להירשם עכשיו עם השם והתפקיד האלה.',
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
      invited: 'הזמנה פתוחה — טרם בוצעה הרשמה',
      pending_company_approval: 'ההרשמה בוצעה — ההצטרפות ממתינה לאישור החברה',
      active: 'הצטרפות פעילה',
      inactive: 'הצטרפות שאינה פעילה',
    },

    actions: {
      approve: 'אישור ההצטרפות',
      cancelInvitation: 'ביטול ההזמנה',
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
      title: 'הוספת עובדים',
      lede: 'אפשר לפתוח עכשיו מקומות לעובדים, ואפשר לדלג ולחזור לזה בהמשך.',
      skip: 'דילוג לעת עתה',
      finish: 'סיום והמשך',
      /** Says the step will not come back, so Skip is not a decision anyone has to weigh. */
      note: 'ניהול העובדים יישאר זמין מלוח הבקרה גם לאחר דילוג.',
    },

    errors: {
      notPermitted: 'אין הרשאה לנהל את העובדים של החברה הזו. יש לפנות לבעלי החברה.',
      noCompany: 'החשבון אינו משויך לחברה פעילה, ולכן אין עובדים לנהל.',
      unauthenticated: 'ההתחברות פגה. יש להתחבר שוב כדי להמשיך.',
      // A stale screen rather than a failed action: somebody else already approved this person.
      nothingToApprove: 'ההצטרפות הזו כבר אושרה או שאינה ממתינה לאישור. יש לרענן את הרשימה.',
      nothingToCancel: 'ההזמנה כבר אינה ממתינה. הרשימה רועננה.',
      mainContractorTaken: 'לחברה כבר יש קבלן ביצוע ראשי, ולכן אי אפשר לפתוח תפקיד נוסף.',
      validation: 'חלק מהפרטים אינם תקינים. יש לבדוק את השדות המסומנים ולנסות שוב.',
      network: 'אין תקשורת עם השרת. יש לבדוק את החיבור ולנסות שוב.',
      generic: 'משהו השתבש. אפשר לנסות שוב.',
    },
  },

  /** Copy approved verbatim. It names no internal state and no internal vocabulary. */
  waitingForApproval: {
    heading: 'ההרשמה הושלמה',
    body: 'החשבון פעיל, וההצטרפות לחברה ממתינה לאישור. לאחר אישור החברה אפשר יהיה להמשיך להשתמש במערכת כרגיל.',
    secondary: 'אין צורך להירשם מחדש.',
    checkStatus: 'בדיקת סטטוס',
    signOut: 'התנתקות',
    stillWaiting: 'ההצטרפות עדיין ממתינה לאישור החברה.',
    errors: {
      network: 'אין תקשורת עם השרת. יש לבדוק את החיבור ולנסות שוב.',
      generic: 'משהו השתבש. אפשר לנסות שוב.',
    },
  },

  profile: {
    title: 'הפרופיל שלי',
    loading: 'טוען את הפרופיל…',
    errors: {
      network: 'אין חיבור לשרת. יש לבדוק את החיבור ולנסות שוב.',
      generic: 'טעינת הפרופיל נכשלה.',
      retry: 'ניסיון חוזר',
    },
    lede: 'כך נראה הפרופיל. הדירוג וציון הגמישות מחושבים לבד — אי אפשר לערוך אותם.',
    edit: 'עריכת הפרופיל',
    summary: 'סיכום הפרופיל',
    rating: {
      label: 'הדירוג',
      foot: 'מבוסס על {count} דירוגים מעבודות שהושלמו',
      empty: 'אין עדיין דירוגים',
    },
    flexibility: {
      label: 'ציון הגמישות',
      foot: 'מבוסס על {count} אירועי תיאום שהסתיימו',
      empty: 'אין עדיין ציון גמישות',
      // Aggregate counts only — לא שמות, לא פרויקטים, לא תאריכים ולא צד שני.
      context: {
        workable: 'ב-{workable} מתוך {events} אירועי תיאום נמצא פתרון שאיפשר להמשיך בעבודה.',
        alternatives: 'ב-{count} מהמקרים הוצע מועד חלופי או פתרון אחר שהתקבל.',
        notice: 'ב-{count} מהמקרים ההודעה המוקדמת איפשרה תיאום מראש.',
        justified: '{count} סירובים מנומקים אינם נכללים בחישוב הציון.',
      },
    },
    explain: {
      question: 'איך מחושב ציון הגמישות?',
      answerOne:
        'הציון נבנה מהאופן שבו נענות בפועל בקשות לשינוי תאריך — אישור, דחייה או הצעה נגדית. הוא אינו מדווח עצמית ואי אפשר לערוך אותו, ולכן הוא אומר משהו אמיתי לקבלן שרואה אותו.',
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
      lede: 'אלה לא כללים נוקשים — הם אומרים לצד השני מה מתאים לפני שהוא מציע תאריך.',
      delay: 'עיכוב שאפשר לספוג',
      notice: 'התראה מראש נדרשת',
      days: 'ימים',
    },
    ratings: {
      title: 'דירוגים שהתקבלו',
      lede: '{count} דירוגים מקבלנים שותפים לעבודה משותפת שהושלמה.',
      empty: 'אין עדיין דירוגים',
    },
  },

  editProfile: {
    title: 'עריכת הפרופיל',
    lede: 'עדכון הפרטים שקבלנים אחרים רואים והעדפות התיאום. הדירוג וציון הגמישות מחושבים לבד — אי אפשר לערוך אותם.',
    identity: {
      title: 'פרטים מזהים',
      lede: 'אלה הפרטים שקבלנים אחרים מוצאים לפיהם בעיון בקבלנים.',
    },
    avatar: {
      upload: 'העלאת תמונה',
      remove: 'הסרה',
      hint: 'JPG, PNG או WebP, עד 5 מ״ב.',
      tooLarge: 'הקובץ גדול מ־5 מ״ב.',
      badType: 'אפשר להעלות JPG, PNG או WebP בלבד.',
      failed: 'העלאת התמונה נכשלה.',
    },
    availabilityLegend: 'זמינות לעבודות חדשות',
    firstName: 'שם פרטי',
    lastName: 'שם משפחה',
    companyName: { label: 'שם חברה', placeholder: 'ישראלי בנייה בע״מ' },
    officePhone: { label: 'טלפון משרד', placeholder: '03-1234567' },
    businessPhone: { label: 'טלפון עסקי', placeholder: '050-1234567' },
    optional: 'אופציונלי',
    phonesHint: 'טלפון המשרד שייך לעסק והטלפון העסקי הוא אישי־מקצועי. כל אחד מהם עומד בפני עצמו, ואפשר למלא אחד, את שניהם או אף אחד.',
    bio: {
      label: 'תיאור קצר',
      placeholder: 'תחום העיסוק, שנות ניסיון וסוגי פרויקטים',
      hint: 'עד 600 תווים.',
    },
    specialties: {
      legend: 'תחומי התמחות',
      hint: 'אפשר לבחור יותר מתחום התמחות אחד.',
      otherLabel: 'פירוט תחום ההתמחות',
      otherPlaceholder: 'למשל: מסגרות בניין',
    },
    equipment: {
      selected: 'הכלים שנבחרו',
      none: 'לא נבחרו כלים.',
      trigger: 'בחירת הכלים',
      title: 'כלי צמ״ה',
      lede: 'סימון הכלים שברשות העסק או שהעסק מפעיל.',
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
      travelHint: 'עד כמה רחוק אפשר להגיע מהעיר.',
      travelNa: 'לא רלוונטי כאשר נבחר כל הארץ.',
      cityRequired: 'יש לבחור מקום.',
      regionRequired: 'יש לבחור אזור.',
    },
    scheduling: {
      title: 'העדפות תיאום',
      lede: 'העדפות התיאום אינן מחייבות. הן מציגות לצד השני את מסגרת הזמנים המתאימה.',
      notice: 'העדפות התיאום מוצגות בפרופיל הציבורי, כדי שקבלנים אחרים יוכלו להציע מועדים מתאימים מראש.',
      delay: 'עיכוב שאפשר לספוג',
      delayHint: 'מספר ימי העיכוב שניתן לספוג ללא פגיעה מהותית בלוח הזמנים המתוכנן.',
      notice2: 'התראה מראש נדרשת',
      notice2Hint: 'ההתראה המוקדמת הנדרשת לצורך היערכות של צוות וציוד.',
      days: 'ימים',
    },
    work: {
      lede: 'תמונות מעבודות שהושלמו, כולל עבודות מלפני ההצטרפות. קישור לעבודה שנוהלה בפלטפורמה הוא רשות.',
      add: 'הוספת עבודה',
      remove: 'הסרת העבודה',
      edit: 'עריכת העבודה',
      confirmAdd: 'הוספה',
      confirmEdit: 'שמירת העבודה',
      editTitle: 'עריכת עבודה שהושלמה',
      titleLabel: 'שם העבודה',
      metaLabel: 'מקום ותאריך',
      metaPlaceholder: 'חיפה · מאי 2026',
      scopeLabel: 'תיאור',
      imageLabel: 'תמונה',
      imageReplaceLabel: 'החלפת התמונה',
      imageCurrent: 'לעבודה הזו כבר יש תמונה. בחירת קובץ חדש תחליף אותה.',
      imageAlt: 'תמונה מהעבודה {title}',
      addFailed: 'הוספת העבודה נכשלה.',
      editFailed: 'עדכון העבודה נכשל.',
      removeFailed: 'הסרת העבודה נכשלה.',
    },
    ratingsLede: '{count} דירוגים מקבלנים שותפים לעבודה משותפת שהושלמה. אי אפשר לערוך אותם.',
    actions: {
      save: 'שמירת שינויים',
      saved: 'השינויים נשמרו.',
      cancel: 'ביטול',
      aside: 'לשינוי כתובת המייל או הסיסמה — במסך ההגדרות.',
      saveFailed: 'השמירה נכשלה.',
      invalid: 'חלק מהערכים אינם תקינים, ולכן לא נשמרו.',
      blocked: 'חסרים שדות חובה. השינויים לא נשלחו.',
      notPermitted: 'אין הרשאה לערוך את פרטי החברה.',
    },
  },

  landing: {
    documentTitle: 'FieldSync — תיאום עבודה באתר / Construction coordination',
    metaDescription:
      'FieldSync — a coordination platform for construction professionals: assign work, link the tasks that depend on each other, and manage dates and changes in one place.',
    skip: 'דילוג',
    navLabel: 'תפריט',
    signIn: 'כניסה',
    createAccount: 'יצירת חשבון',

    hero: {
      title: 'משימות, תאריכים ותלויות — מתואמים במקום אחד, לא בטלפון.',
      lede: 'FieldSync היא פלטפורמת תיאום לאנשי מקצוע בענף הבנייה: הקצאת עבודה, קישור בין משימות שתלויות זו בזו, וניהול תאריכים ושינויים — הכול במקום אחד.',
    },

    example: {
      title: 'כך שינוי תאריך אחד עובר בשרשרת',
      was: 'התכנון המקורי',
      now: 'אחרי השינוי',
      dayLabel: 'יום',
      rows: [
        {
          name: 'קידוח כלונסאות',
          meta: 'נמשך יומיים נוספים',
          detail: 'בתכנון המקורי: ימים 1 עד 4. אחרי השינוי: ימים 1 עד 6.',
        },
        {
          name: 'יציקת יסודות',
          meta: 'תלויה בקידוח · נדחית ביומיים',
          detail: 'בתכנון המקורי: ימים 5 עד 8. אחרי השינוי: ימים 7 עד 10.',
        },
        {
          name: 'שלד קומה 1',
          meta: 'תלוי ביסודות · נדחה ביומיים',
          detail: 'בתכנון המקורי: ימים 9 עד 12. אחרי השינוי: ימים 11 עד 14.',
        },
        {
          name: 'הכנת תשתיות חשמל',
          meta: 'תלויה ביסודות · נדחית ביומיים',
          detail: 'בתכנון המקורי: ימים 9 עד 11. אחרי השינוי: ימים 11 עד 13.',
        },
      ],
      note: 'המחשה של רעיון התלויות בלבד — נתוני דוגמה, ולא צילום מסך מהמוצר. פרויקט לדוגמה אחד; לכל פרויקט שרשרת תלויות משלו. כשמסך לוח הפרויקט ייבנה, צילום מסך אמיתי ממנו יחליף את ההמחשה הזו.',
    },

    values: {
      title: 'מה שונה כאן',
      cards: [
        {
          title: 'כולם משתמשים שווים',
          body: 'אותו קבלן יכול להיות קבלן ראשי בפרויקט אחד וקבלן משנה באחר. התפקיד עוקב אחר העבודה, לא אחרי האדם — והפלטפורמה מתווכת בין הצדדים במקום לשרת צד אחד.',
        },
        {
          title: 'סימני אמון שקשה לשחק בהם',
          body: 'ציון הגמישות נגזר מהתנהגות בפועל כשתאריכים זזים — לא מדיווח עצמי ולא מרמת הפעילות בפלטפורמה.',
        },
      ],
    },

    flow: {
      title: 'איך זה עובד',
      steps: [
        'הקצאת עבודה',
        'קישור התלויות',
        'תאריך משתנה',
        'ההשפעה עוברת בשרשרת התלויות הרלוונטית',
        'הצדדים הרלוונטיים מתאמים ומסכמים בסבב אחד',
      ],
      note: 'הכול נשמר בתוך הפלטפורמה, כך שמה שסוכם על תאריך נשאר מתועד.',
    },

    direct: {
      title: 'זה הזמן להתחיל',
      lede: 'פתיחת חשבון לוקחת דקה.',
      cta: 'יצירת חשבון',
    },

    footerNote: 'FieldSync — אב־טיפוס אקדמי בפיתוח.',
  },

  reports: {
    trigger: 'דיווח',
    dialogTitle: 'דיווח על משתמש',
    dialogLede: 'הדיווח נשלח לבדיקה של צוות הפלטפורמה.',
    reasonLabel: 'סיבת הדיווח',
    reasonPlaceholder: 'בחירת סיבה',
    // Provisional wording: the four codes come from the approved schema, the labels do not.
    reasons: {
      spam: 'ספאם או פרסום לא רצוי',
      harassment: 'הטרדה או התנהגות פוגענית',
      impersonation: 'התחזות',
      other: 'אחר',
    },
    noteLabel: 'פירוט (רשות)',
    noteHint: 'אפשר להוסיף הסבר קצר. הפירוט נקרא רק על ידי צוות הפלטפורמה.',
    submit: 'שליחת דיווח',
    cancel: 'ביטול',
    submittedTitle: 'הדיווח נשלח',
    submitted: 'תודה — הדיווח נשלח לבדיקה.',
    submittedNote: 'תוצאת הבדיקה אינה נמסרת.',
    close: 'סגירה',
    errors: {
      self: 'לא ניתן לדווח על החשבון שלך.',
      duplicate: 'כבר קיים דיווח פתוח שלך על משתמש זה מאותה סיבה.',
      rateLimited: 'נשלחו יותר מדי דיווחים. יש לנסות שוב מאוחר יותר.',
      notFound: 'לא ניתן להגיע למשתמש הזה.',
      network: 'אין חיבור לשרת. יש לנסות שוב.',
      unknown: 'שליחת הדיווח נכשלה. יש לנסות שוב.',
    },
  },

  moderation: {
    navLabel: 'מודרציה',
    documentTitle: 'תור המודרציה / Moderation queue — FieldSync',
    detailDocumentTitle: 'פרטי דיווח / Report detail — FieldSync',
    queueTitle: 'תור המודרציה',
    queueLede: 'דיווחים שהוגשו על ידי משתמשים, החדש ביותר תחילה.',
    filterLabel: 'סינון לפי מצב',
    filterAll: 'הכול',
    empty: 'אין דיווחים להצגה.',
    loading: 'טוען…',
    backToQueue: 'חזרה לתור',
    openDetail: 'פתיחת הדיווח',
    unknownPerson: 'חשבון שאינו זמין',
    columns: {
      reason: 'סיבה',
      subject: 'נושא הדיווח',
      reporter: 'מדווח',
      status: 'מצב',
      created: 'תאריך',
    },
    statuses: {
      open: 'פתוח',
      under_review: 'בבדיקה',
      dismissed: 'נדחה',
      actioned: 'טופל',
    },
    accountStatuses: {
      active: 'פעיל',
      restricted: 'מוגבל',
      deactivated: 'מושבת',
      banned: 'חסום',
      deleted: 'נמחק',
    },
    historyActions: {
      'report.submitted': 'הדיווח נשלח',
      'report.claimed': 'נלקח לבדיקה',
      'report.dismissed': 'הדיווח נדחה',
      'report.actioned': 'הדיווח טופל',
      'account.restricted': 'החשבון הוגבל',
      'account.unrestricted': 'ההגבלה הוסרה',
    },
    detail: {
      title: 'פרטי הדיווח',
      reporterExplanation: 'הפירוט של המדווח',
      noExplanation: 'לא נמסר פירוט.',
      redacted: 'הפירוט הוסר במסגרת מחיקת חשבון המדווח.',
      source: 'מקור הדיווח',
      sourcePublicProfile: 'פרופיל ציבורי',
      subjectTitle: 'החשבון שדווח',
      subjectStatus: 'מצב החשבון',
      subjectEmail: 'דוא״ל',
      reportCount: 'סך הדיווחים על החשבון',
      reportCountNote: 'מספר דיווחים הוא סימן לבדיקה, ולא הוכחה.',
      historyTitle: 'היסטוריית הטיפול',
      internalNote: 'הערה פנימית',
      resolvedBy: 'טופל על ידי',
      resolvedAt: 'מועד הסגירה',
    },
    resolve: {
      title: 'סגירת הדיווח',
      claim: 'לקיחה לבדיקה',
      noteLabel: 'הערה פנימית (רשות)',
      noteHint: 'ההערה נשמרת לצוות בלבד ואינה נמסרת לאיש מהצדדים.',
      dismiss: 'דחיית הדיווח',
      action: 'סימון כטופל',
      resolved: 'הדיווח נסגר. הרשומה וההיסטוריה נשמרות.',
      closurePreviewTitle: 'הנוסח שנמסר למדווח',
      closurePreview: 'הדיווח נבדק ונסגר.',
      closurePreviewNote:
        'אותו נוסח בדיוק בכל מסלול סגירה. מסירת ההודעה עצמה תלויה במערכת ההתראות, שטרם נבנתה.',
    },
    account: {
      title: 'פעולה על החשבון',
      lede: 'הגבלה עוצרת גילוי, קשרים חדשים ופרויקטים חדשים. עבודה שכבר סוכמה ממשיכה עד לסיומה.',
      reasonLabel: 'נימוק (חובה)',
      restrict: 'הגבלת החשבון',
      unrestrict: 'הסרת ההגבלה',
      restricted: 'החשבון הוגבל.',
      unrestricted: 'ההגבלה הוסרה.',
      reasonRequired: 'יש להזין נימוק.',
      notApplicable: 'לא ניתן לבצע את הפעולה במצב הנוכחי של החשבון.',
    },
    errors: {
      alreadyResolved: 'הדיווח כבר נסגר על ידי מודרטור אחר.',
      notFound: 'הדיווח אינו זמין.',
      network: 'אין חיבור לשרת. יש לנסות שוב.',
      unknown: 'הפעולה נכשלה. יש לנסות שוב.',
    },
  },

  notFound: {
    documentTitle: 'הדף אינו זמין / Page unavailable — FieldSync',
    code: '404',
    title: 'הדף הזה אינו זמין',
    lede: 'לא ניתן להציג את הדף המבוקש. אפשר לחזור ולהמשיך משם.',
    reasonsTitle: 'סיבות אפשריות',
    reasons: [
      'הקישור שדרכו נפתח הדף אינו עדכני עוד',
      'הדף אינו זמין כעת, באופן זמני או קבוע',
      'לא ניתן להגיע לתוכן המבוקש כרגע',
    ],
    ctaHome: 'חזרה לדף הבית',
  },
} as const;
