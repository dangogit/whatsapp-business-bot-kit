# WhatsApp Business Bot Kit

בוט וואטסאפ שעונה ללקוחות שלכם בשם העסק, על ה-API הרשמי של Meta, דרך [HookMyApp](https://hookmyapp.com/?fpr=daniel36), עם Claude.

- **עונה רק מתוך המידע של העסק.** כל מה שהבוט יודע כתוב בקובץ אחד, `business.md`.
- **יודע מתי להעביר אליכם.** תלונה, תשלום, שאלה שאין לה תשובה, או לקוח שמבקש בן אדם: הבוט אומר ללקוח שמישהו יחזור אליו, שולח לכם הודעה, ומפסיק לענות ללקוח הזה.
- **מפנה לכם את הבמה.** אם המספר מחובר במצב coexistence ואתם עונים מאפליקציית WhatsApp Business, הבוט מזהה ושותק.
- **רשמי.** בלי חיבור לא רשמי ל-WhatsApp Web, ובלי סיכון לחסימה של המספר.

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

## המספר של העסק

```bash
hookmyapp channels connect whatsapp           # חיבור דרך Meta בדפדפן
hookmyapp channels list                        # מעתיקים את ה-ch_...
hookmyapp channels env ch_XXXX --write .env
```

**לפני שמחברים:** מספר שרשום בוואטסאפ הרגיל צריך למחוק בו את חשבון הוואטסאפ, וההיסטוריה הולכת. מספר של אפליקציית WhatsApp Business מתחבר במצב coexistence, והאפליקציה ממשיכה לעבוד. אם לא בטוחים, מתחילים ב-sandbox.

## עלייה לענן (Railway)

הבוט צריך לרוץ כל הזמן, גם כשהמחשב כבוי. הערכה עולה ל-Railway, במסלול Hobby (‏$5 לחודש, כולל $5 שימוש, וזה מספיק לבוט בגודל הזה). עושים את זה אחרי שהמספר של העסק מחובר. הכי פשוט: לבקש מ-Claude Code "תעלה את הבוט ל-Railway", והוא ירוץ לפי `AGENTS.md`. ידנית:

```bash
npm install -g @railway/cli                   # ב-Mac אפשר גם: brew install railway
railway login                                 # בדפדפן; מוסיפים כרטיס ובוחרים Hobby
railway up -y --detach --name whatsapp-bot    # יוצר פרויקט ומעלה את התיקייה
```

אחר כך מעתיקים את המשתנים מ-`.env`, כל אחד בנפרד (חוץ מ-`PORT`). ככה מפתח לא נשאר בהיסטוריה של הטרמינל:

```bash
railway variable set ANTHROPIC_API_KEY --stdin --skip-deploys   # מדביקים את הערך, Enter, ואז Ctrl+D (ב-Windows: Ctrl+Z ואז Enter)
```

ואחרי שכל המשתנים בפנים:

```bash
railway domain                                # מחזיר https://<name>.up.railway.app
curl https://<name>.up.railway.app/health     # צריך להחזיר ok (ב-PowerShell: curl.exe)
hookmyapp channels webhook set ch_XXXX --url https://<name>.up.railway.app/webhook/whatsapp --verify-token <VERIFY_TOKEN>
```

שיניתם את `business.md`? מריצים שוב `railway up --detach`. משהו לא עובד? `railway logs`.

## עלויות, שכדאי לדעת מראש

- **Meta:** מ-1 באוקטובר 2026 כל מספר מקבל 1,000 תשובות חינם בחודש. אחרי זה בערך $0.005 לתשובה בישראל. בלי אמצעי תשלום בחשבון של Meta, הבוט מפסיק לענות אחרי ה-1,000.
- **HookMyApp:** לפי מסלול, לפי מספר ההודעות שנשלחות.
- **Railway:** ‏$5 לחודש במסלול Hobby, כולל $5 שימוש.
- **Claude:** לפי שימוש, בחשבון ה-API שלכם. ההגדרה `BOT_EFFORT=low` שומרת על עלות נמוכה.

## כללים של Meta

- הבוט חייב להישאר על העסק. בוט AI כללי אסור בוואטסאפ, בוט שירות לקוחות של עסק מותר.
- חייבת להיות דרך להגיע לבן אדם (בשביל זה יש את ההעברה אליכם).
- תשובה חופשית אפשר לשלוח רק עד 24 שעות אחרי ההודעה האחרונה של הלקוח. אחרי זה צריך template מאושר.

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
