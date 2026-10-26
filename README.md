# WhatsApp Business Bot Kit

בוט וואטסאפ שעונה ללקוחות שלכם בשם העסק, על ה-API הרשמי של Meta, דרך [HookMyApp](https://hookmyapp.com/?fpr=daniel36), עם Claude.

- **עונה רק מתוך המידע של העסק.** כל מה שהבוט יודע כתוב בקובץ אחד, `business.md`.
- **יודע מתי להעביר אליכם.** תלונה, תשלום, שאלה שאין לה תשובה, או לקוח שמבקש בן אדם: הבוט משיב ללקוח ומפסיק לענות לו לזמן שהוגדר. אם הגדרתם `OWNER_PHONE`, הוא גם מנסה לשלוח לכם התראה. בלי מספר לקבלת התראות, ההעברה נרשמת בלוג בלבד.
- **מפנה לכם את הבמה.** אם המספר מחובר במצב coexistence ואתם עונים מאפליקציית WhatsApp Business, הבוט מזהה ושותק.
- **רשמי.** החיבור הוא דרך ה-API הרשמי של Meta, וכפוף לכללי השליחה, האיכות והמכסות שלה.

## מה צריך

- [Claude Code](https://claude.com/claude-code)
- Node.js 20.12 ומעלה (ב-Windows: `winget install OpenJS.NodeJS.LTS`)
- חשבון ב-[HookMyApp](https://hookmyapp.com/?fpr=daniel36) (דרך הלינק הזה יש 20% הנחה; יש בו sandbox לבדיקות)
- מפתח API של Claude מ-[platform.claude.com](https://platform.claude.com)
- טלפון עם וואטסאפ לבדיקה

## הדרך הקלה: לתת ל-Claude Code לעשות את זה

```bash
git clone https://github.com/dangogit/whatsapp-business-bot-kit.git
cd whatsapp-business-bot-kit
claude
```

ואז לכתוב לו:

> תרים לי את הבוט ב-sandbox של HookMyApp, ואז תראיין אותי על העסק ותמלא את business.md

ב-`AGENTS.md` יש ל-Claude Code את כל ההוראות: התקנה, חיבור, ראיון, בדיקות ועלייה לענן.

## Windows, Mac ו-Linux

הקוד עצמו הוא Node נקי, בלי סקריפטים של shell, ונבדק אוטומטית על Windows, Mac ו-Linux. הפקודות כאן עובדות ב-Terminal של Mac ו-Linux, וב-Windows ב-PowerShell או ב-Git Bash. כשעובדים עם Claude Code הוא מתאים את הפקודות למחשב לבד.

## ידנית, ב-sandbox

```bash
npm install
npm install -g @gethookmyapp/cli@latest
hookmyapp login
hookmyapp sandbox start whatsapp      # שולחים מהטלפון את הקוד שמופיע
hookmyapp sandbox env --write .env
# פותחים את .env בעורך ומוסיפים שורה: ANTHROPIC_API_KEY=sk-ant-...
npm start
```

ובטרמינל שני:

```bash
hookmyapp sandbox listen --port 3000 --path /webhook/whatsapp
```

עכשיו שולחים הודעה למספר ה-sandbox, והבוט עונה.

חשוב ללחוץ על **שליחה** ב-WhatsApp אחרי פתיחת הקישור. אחר כך `hookmyapp sandbox status` צריך להציג סשן פעיל. עד שזה קורה, הקוד הוא בקשת חיבור בלבד.

לדמו אפשר לבקש מ-Claude להמציא עסק דמיוני ולסמן זאת ב-`business.md`. כשבודקים העברה לנציג, הבוט מפסיק לענות כברירת מחדל ל-12 שעות; לדמו חוזר אפשר להגדיר מקומית `HANDOFF_PAUSE_HOURS=0.0166667`, בערך דקה. זו הדגמת העברה, ולא פנייה לאדם אמיתי אם לא הוגדר `OWNER_PHONE`.

## המספר של העסק

```bash
hookmyapp channels connect whatsapp           # חיבור דרך Meta בדפדפן
hookmyapp channels list                        # מעתיקים את ה-ch_...
hookmyapp channels env ch_XXXX --write .env
```

**לפני שמחברים:** מספר שרשום בוואטסאפ הרגיל צריך למחוק בו את חשבון הוואטסאפ, וההיסטוריה הולכת. מספר של אפליקציית WhatsApp Business מתחבר במצב coexistence, והאפליקציה ממשיכה לעבוד. אם לא בטוחים, מתחילים ב-sandbox.

חיבור המספר ל-Meta הוא רק השלב הראשון. הפעלת הבוט על המספר האמיתי תנתב אליו הודעות מלקוחות ותפעיל תשובות אוטומטיות. מאשרים קודם את המספר ואת תוכן העסק, ואז בודקים מחשבון WhatsApp אחר שהגיעה תשובה. כשממשיכים להשתמש גם ב-sandbox, משתמשים בקבצים נפרדים כמו `.env.sandbox` ו-`.env.business`, או שומרים אותם מחוץ לתיקייה שמעלים. מוודאים שקובץ בתוך הפרויקט מוחרג מ-Git לפני העלאה.

## עלייה לענן (Railway)

הבוט צריך לרוץ כל הזמן, גם כשהמחשב כבוי. אפשר לבקש מ-Claude Code "תעלה את הבוט ל-Railway לפי AGENTS.md". [מדריך ההפעלה](docs/operations.md) מכסה את ההעלאה, העברת המשתנים והחלפת הכתובת ב-HookMyApp.

במסלול Hobby יש מינימום של $5 לחודש, הכולל $5 שימוש במשאבים. שימוש מעבר לכך עולה בנפרד. [התמחור של Railway](https://railway.com/pricing). בעל החשבון משלים התחברות ובחירת מסלול בעצמו; התחברות לאתר אינה מבטיחה שגם ה-CLI מחובר.

השלבים העיקריים:

```bash
npm install -g @railway/cli                   # ב-Mac אפשר גם: brew install railway
railway login
railway whoami                               # צריך לזהות את החשבון הנכון
```

יוצרים פרויקט ושירות, ומעבירים את המשתנים מקובץ ההגדרות של **המספר האמיתי**, בלי להציג את הערכים. לא מעתיקים `PORT`, ואת `BUSINESS_FILE` מגדירים כ-`business.md`, במקום נתיב של קובץ במחשב. כל ערך עובר ב-stdin, כך שאינו מופיע בשורת הפקודה או בהיסטוריה:

```bash
railway variable set ANTHROPIC_API_KEY --stdin --skip-deploys   # מדביקים את הערך, Enter, ואז Ctrl+D (ב-Windows: Ctrl+Z ואז Enter)
```

לאחר שהמשתנים הוגדרו מעלים את הקוד. מחכים שהפריסה תצליח, בודקים בלוג באיזה פורט השרת מאזין, ורק אז מייצרים כתובת לאותו פורט. `PORT` של Railway יכול להיות שונה מ-`EXPOSE 3000` ב-Dockerfile.

```bash
railway up --detach
railway domain --port <actual-port>
curl https://<name>.up.railway.app/health       # צריך להחזיר ok (ב-PowerShell: curl.exe)
```

משאירים מופע אחד פועל וכיבוי אוטומטי (Serverless) כבוי. אחרי בדיקות הבריאות והחתימה, מאשרים את הכתובת החדשה ומחברים אותה:

```bash
hookmyapp channels webhook set ch_XXXX --url https://<name>.up.railway.app/webhook/whatsapp
```

כשכבר קיים `VERIFY_TOKEN` בתצורת הערוץ, הפקודה שומרת אותו ואין צורך להעביר אותו בשורת הפקודה. מוודאים קודם שהשרת החדש משתמש באותו ערך, ובודקים אחרי השמירה שהערך לא השתנה. החלפת הכתובת מפסיקה את מנהרת המחשב המקומי. שולחים שאלת בדיקה מחשבון WhatsApp אחר, מאשרים שהתקבלה תשובה מהענן ורק אז עוצרים את השרת המקומי הישן.

שיניתם את `business.md`? מריצים `npm test`, ואז `railway up --detach`. ההיסטוריה וההשהיות שבזיכרון מתאפסות בכל הפעלה מחדש. להנחיות מלאות ולפתרון תקלות, ראו [מדריך ההפעלה](docs/operations.md).

## סיום דמו או הפסקת הבוט

מבקשים מ-Claude לעצור את הבוט לפי [מדריך ההפעלה](docs/operations.md#end-a-demo-or-stop-automatic-replies): לכבות העברת הודעות ב-HookMyApp, להסיר את כתובת הבוט ולעצור את הפריסה ואת תהליכי הדמו. אפליקציית WhatsApp Business בטלפון ממשיכה לעבוד. עצירת השרת אינה מבטלת את המנויים ל-Railway או ל-HookMyApp.

## עלויות, שכדאי לדעת מראש

- **Meta:** לפי המחירון בתוקף מ-1 באוקטובר 2026, כל מספר מקבל 1,000 הודעות Service דרך ה-API בחינם בחודש. אחר כך התעריף לנמען ישראלי הוא $0.0053 להודעה שנמסרה. זו מכסת הודעות, לא מכסת לקוחות, והיא אינה חלה על תבניות Utility או Marketing. נדרש אמצעי תשלום מתאים להודעות בתשלום. [המחירון העדכני של Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
- **HookMyApp:** לפי מסלול, לפי מספר ההודעות שנשלחות.
- **Railway:** מינימום של $5 לחודש במסלול Hobby, כולל $5 שימוש; שימוש נוסף מחויב בנפרד.
- **Claude:** לפי שימוש, בחשבון ה-API שלכם. ההגדרה `BOT_EFFORT=low` שומרת על עלות נמוכה.

## כללים של Meta

- הבוט חייב להישאר על העסק. בוט AI כללי אסור בוואטסאפ, בוט שירות לקוחות של עסק מותר.
- חייבת להיות דרך להגיע לבן אדם (בשביל זה יש את ההעברה אליכם).
- תשובה חופשית אפשר לשלוח רק עד 24 שעות אחרי ההודעה האחרונה של הלקוח. אחרי זה צריך template מאושר.

הרשמה בטופס באתר אינה פותחת חלון של 24 שעות ב-WhatsApp. אישור הרשמה לוובינר וקישור כניסה עשויים להתאים לתבנית Utility אם הם מתייחסים להרשמה קיימת ואינם כוללים תוכן שיווקי; הסיווג הסופי הוא של Meta. שליחה יזומה של אישורים ותזכורות אינה מובנית בערכה הזו. [כללי הסיווג](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization).

ב-Coexistence, הודעת 1:1 ידנית מאפליקציית WhatsApp Business אינה הודעת API ואינה מחויבת בתעריף ה-API. היא גם אינה פותחת או מאריכה את חלון השירות של הבוט. [הסבר Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).

## הגדרות

כל ההגדרות ב-`.env`. הרשימה המלאה ב-[`.env.example`](.env.example). השימושיות:

| משתנה | מה הוא עושה |
|---|---|
| `OWNER_PHONE` | המספר שלכם (למשל `0501234567`), לקבלת התראה כשלקוח צריך בן אדם. ההתראה מגיעה רק אם שלחתם מהטלפון הזה הודעה למספר העסקי ב-24 השעות האחרונות |
| `HANDOFF_PAUSE_HOURS` | כמה שעות הבוט שותק אחרי העברה (ברירת מחדל 12) |
| `BOT_MODEL` | ברירת מחדל `claude-opus-5-5` |
| `MAX_REPLIES_PER_HOUR` | כמה תשובות לכל לקוח בשעה, הגנה על החשבון ב-Anthropic (ברירת מחדל 30) |
| `BOT_EFFORT` | `low` / `medium` / `high` (ברירת מחדל `low`) |

## בדיקות

```bash
npm test
```

## רישיון

MIT
