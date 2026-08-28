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

  success: {
    title: 'החשבון נוצר',
    body: 'ברוך הבא, {name}. החשבון של {company} מוכן ואתם כבר מחוברים.',
    next: 'השלב הבא בהרשמה — השלמת הפרופיל — עדיין לא נבנה.',
  },
} as const;
