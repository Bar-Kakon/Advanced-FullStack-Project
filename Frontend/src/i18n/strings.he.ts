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
    submitting: 'יוצר חשבון…',
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
  },

  login: {
    brand: {
      beta: 'בטא',
      headline: 'תיאום שזז במהירות של הבנייה.',
      sub: 'משימות, תלויות ותזמונים מחדש — מנוהלים בפנים, לא בטלפון.',
      featuresLabel: 'עיקרי הפלטפורמה',
      features: [
        'תזמון מדורג עם משא ומתן בלחיצה אחת',
        // Replaces `הודעות נפתחות רק לאחר אישור בקשת חיבור`, which stated the connection gate
        // D9 reversed on 2026-08-28. PROPOSED WORDING, AWAITING OWNER APPROVAL: it states the
        // request gate, names no delegation, and repeats neither bullet beside it.
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
    submitting: 'מתחבר…',
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

  dashboard: {
    title: 'לוח הבקרה האישי',
    welcome: 'שלום, {name}.',
    notMigrated: 'לוח הבקרה האישי הוא היעד המאושר אחרי כניסה, והמסך עצמו עדיין לא הועבר ל-React.',
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
    ratingsLede: '{count} דירוגים מקבלנים שעבדתם איתם על עבודה משותפת שהושלמה. אי אפשר לערוך אותם.',
    actions: {
      save: 'שמירת שינויים',
      cancel: 'ביטול',
      aside: 'לשינוי כתובת המייל או הסיסמה, עברו להגדרות.',
      // The same honest note the Register success state uses for a step that is not built.
      noEndpoint: 'שמירת פרופיל עדיין לא נבנתה בשרת, ולכן השינויים לא נשמרו.',
    },
  },

  success: {
    title: 'החשבון נוצר',
    body: 'ברוך הבא, {name}. החשבון של {company} מוכן ואתם כבר מחוברים.',
    next: 'השלב הבא בהרשמה — השלמת הפרופיל — עדיין לא נבנה.',
  },
} as const;
