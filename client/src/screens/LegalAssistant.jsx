import { useRef, useState } from "react";
import { askLegalAssistant } from "../api/legalAssistantClient";
import { Card, Button, Badge, Callout, EmptyState } from "../components/ui";

// Conversational "AI Legal Assistant" — distinct from the Case law search screen
// (which is a faceted research tool for browsing judgments directly). This screen is
// the RAG chat surface: natural-language questions in, a grounded + structured answer
// out, always with citations and a safety disclaimer.

const EXAMPLE_PROMPTS = [
  "Mere landlord ne security deposit return nahi kiya, kya kar sakta hoon?",
  "What are my rights if I am arrested?",
  "Section 138 NI Act ka kya meaning hai?",
  "Can an employer terminate me without notice?",
  "What does the Supreme Court say about anticipatory bail?",
  "Mere against FIR ho gayi hai, ab mujhe kya karna chahiye?",
];

const SECTION_META = [
  {
    key: "statute",
    label: { en: "Law / statute", hi: "कानून / धारा", hinglish: "Kanoon / Dhara", mr: "कायदा / कलम", marathlish: "Kayda / Kalam", ur: "قانون / دفعہ" },
    tone: "info",
  },
  {
    key: "judgments",
    label: { en: "Court judgment(s)", hi: "न्यायालय के निर्णय", hinglish: "Adalat ke faisle", mr: "न्यायालयाचे निर्णय", marathlish: "Nyayalayache nirnay", ur: "عدالتی فیصلے" },
    tone: "neutral",
  },
  {
    key: "interpretation",
    label: { en: "Legal interpretation", hi: "कानूनी व्याख्या", hinglish: "Kanooni vyakhya", mr: "कायदेशीर विश्लेषण", marathlish: "Kaydeshir vishleshan", ur: "قانونی تشریح" },
    tone: "warning",
  },
  {
    key: "generalInformation",
    label: { en: "General information", hi: "सामान्य जानकारी", hinglish: "Samanya jaankari", mr: "सामान्य माहिती", marathlish: "Samanya mahiti", ur: "عمومی معلومات" },
    tone: "neutral",
  },
  {
    key: "practicalNextSteps",
    label: { en: "Practical next steps", hi: "व्यावहारिक अगले कदम", hinglish: "Vyavaharik agle kadam", mr: "व्यावहारिक पुढील पावले", marathlish: "Vyavaharik pudhil paavale", ur: "عملی اگلے اقدامات" },
    tone: "success",
  },
];

// Fixed (non-LLM) UI strings, translated once and reviewed — never machine-translated
// per-request. Mirrors the server's own policy for the disclaimer/emergency text
// (see legalAssistant.js): safety-critical copy must never depend on a model call.
//
// Six distinct language/script keys, none interchangeable: hi/mr are Devanagari
// (Hindi vs Marathi vocabulary), ur is Perso-Arabic, hinglish/marathlish are Hindi
// or Marathi meaning transliterated STRICTLY into Roman/English letters (no
// Devanagari at all) — mixing scripts mid-answer is exactly the bug this split fixes.
const UI_STRINGS = {
  timeSensitive: {
    en: "Time-sensitive",
    hi: "समय-संवेदनशील",
    hinglish: "Samay-sanvedansheel",
    mr: "वेळ-संवेदनशील",
    marathlish: "Vel-samvedansheel",
    ur: "وقت کی نزاکت والا",
  },
  insufficientSources: {
    en: "Insufficient sources",
    hi: "अपर्याप्त स्रोत",
    hinglish: "Paryapt sources nahi mile",
    mr: "अपुरे स्रोत",
    marathlish: "Puresa strot nahi",
    ur: "ناکافی ذرائع",
  },
  unparsedWarning: {
    en: "The assistant's response couldn't be split into structured sections — shown below as general information.",
    hi: "सहायक की प्रतिक्रिया को संरचित अनुभागों में विभाजित नहीं किया जा सका — इसे नीचे सामान्य जानकारी के रूप में दिखाया गया है।",
    hinglish: "Assistant ka jawab structured sections mein nahi baant paya — isliye neeche general information ke roop mein dikhaya gaya hai.",
    mr: "सहाय्यकाचा प्रतिसाद संरचित विभागांमध्ये विभागता आला नाही — म्हणून खाली सामान्य माहिती म्हणून दाखवला आहे.",
    marathlish: "Assistant cha javab structured sections madhe vibhagata aala nahi — mhanun khali samanya mahiti mhanun dakhavla aahe.",
    ur: "معاون کے جواب کو منظم حصوں میں تقسیم نہیں کیا جا سکا — اس لیے اسے نیچے عمومی معلومات کے طور پر دکھایا گیا ہے۔",
  },
  sources: { en: "Sources", hi: "स्रोत", hinglish: "Sources", mr: "स्रोत", marathlish: "Strot", ur: "ذرائع" },
  disclaimer: {
    en: "This is general legal information for education and research purposes, generated only from the Indian Kanoon sources listed below — it is not legal advice from a lawyer, it does not create a lawyer-client relationship, and it cannot guarantee any outcome. For anything serious, urgent, criminal, financial, family, property, or litigation-related, please consult a qualified Indian lawyer.",
    hi: "यह सामान्य कानूनी जानकारी केवल शिक्षा और अनुसंधान के उद्देश्य से दी गई है, और नीचे सूचीबद्ध Indian Kanoon स्रोतों पर आधारित है — यह किसी वकील की कानूनी सलाह नहीं है, इससे वकील-मुवक्किल संबंध स्थापित नहीं होता, और यह किसी परिणाम की गारंटी नहीं देती। किसी भी गंभीर, तत्काल, आपराधिक, वित्तीय, पारिवारिक, संपत्ति संबंधी, या मुकदमेबाज़ी से जुड़े मामले के लिए कृपया किसी योग्य भारतीय वकील से सलाह लें।",
    hinglish: "Yeh sirf general legal jaankari hai, sirf education aur research ke maksad se, aur neeche diye gaye Indian Kanoon sources par based hai — yeh kisi vakil ki legal advice nahi hai, isse vakil-client relationship nahi banta, aur yeh kisi outcome ki guarantee nahi deta. Kisi bhi serious, urgent, criminal, financial, family, property, ya litigation se judi baat ke liye kripya ek qualified Indian vakil se salah lein.",
    mr: "ही केवळ सामान्य कायदेशीर माहिती आहे, शिक्षण आणि संशोधनाच्या उद्देशाने दिली आहे, आणि खाली दिलेल्या Indian Kanoon स्रोतांवर आधारित आहे — ही वकिलाचा कायदेशीर सल्ला नाही, यामुळे वकील-अशील संबंध निर्माण होत नाही, आणि ही कोणत्याही निकालाची हमी देत नाही. कोणत्याही गंभीर, तातडीच्या, फौजदारी, आर्थिक, कौटुंबिक, मालमत्ता किंवा खटल्याशी संबंधित बाबीसाठी कृपया एका पात्र भारतीय वकिलाचा सल्ला घ्या.",
    marathlish: "Hi keval samanya kaydeshir mahiti aahe, shikshan ani sanshodhanachya uddeshane dili aahe, ani khali dilelya Indian Kanoon strotanvar aadharit aahe — hi vakilacha kaydeshir salla nahi, yamule vakil-ashil sambandh nirman hot nahi, ani hi konatyahi nikalachi hami det nahi. Konatyahi gambhir, tatdichya, faujdari, aarthik, kautumbik, malmatta kinva khatlyashi sambandhit babisathi krupaya ek patra Bharatiya vakilacha salla ghya.",
    ur: "یہ صرف عمومی قانونی معلومات ہیں، تعلیمی اور تحقیقی مقاصد کے لیے فراہم کی گئی ہیں، اور نیچے دیے گئے Indian Kanoon ذرائع پر مبنی ہیں — یہ کسی وکیل کا قانونی مشورہ نہیں ہے، اس سے وکیل اور موکل کا تعلق قائم نہیں ہوتا، اور یہ کسی نتیجے کی ضمانت نہیں دیتا۔ کسی بھی سنگین، فوری، فوجداری، مالی، خاندانی، جائیداد، یا مقدمہ بازی سے متعلق معاملے کے لیے براہ کرم کسی مستند بھارتی وکیل سے مشورہ کریں۔",
  },
  emergencyMessage: {
    en: "This looks like it may be a time-sensitive or urgent situation (for example: an arrest, being in custody, an FIR just filed, an immediate threat, or a court deadline in the next day or two). Please contact a qualified lawyer, a legal aid service, or the relevant authority (police / court) immediately — do not rely only on this tool.",
    hi: "यह मामला समय-संवेदनशील या तत्काल स्थिति जैसा लग रहा है (उदाहरण के लिए: गिरफ़्तारी, हिरासत में होना, अभी-अभी दर्ज हुई FIR, तत्काल ख़तरा, या अगले एक-दो दिन में अदालत की समय-सीमा)। कृपया तुरंत किसी योग्य वकील, कानूनी सहायता सेवा, या संबंधित प्राधिकरण (पुलिस/अदालत) से संपर्क करें — केवल इस टूल पर निर्भर न रहें।",
    hinglish: "Yeh mamla samay-sanvedansheel ya turant wali situation jaisa lag raha hai (jaise: giraftari, hiraasat mein hona, abhi-abhi darj hui FIR, turant khatra, ya agle ek-do din mein court ki deadline). Kripya turant kisi qualified vakil, legal aid service, ya sambandhit pradhikaran (police/court) se sampark karein — sirf is tool par bharosa na karein.",
    mr: "हे प्रकरण वेळेच्या दृष्टीने महत्त्वाचे किंवा तातडीचे वाटत आहे (उदाहरणार्थ: अटक, ताब्यात असणे, नुकतीच दाखल झालेली FIR, तात्काळ धोका, किंवा पुढील एक-दोन दिवसांत न्यायालयाची अंतिम मुदत). कृपया त्वरित एका पात्र वकिलाशी, कायदेशीर मदत सेवेशी, किंवा संबंधित प्राधिकरणाशी (पोलीस/न्यायालय) संपर्क साधा — केवळ या साधनावर अवलंबून राहू नका.",
    marathlish: "He prakaran vel-samvedansheel kinva tatdiche vatat aahe (udaharanarth: atak, tabyat asane, nukatich dakhal zaleli FIR, tatkal dhoka, kinva pudhil ek-don diwasat nyayalayachi antim mudat). Krupaya tvarit ek patra vakilashi, kaydeshir madad sevesi, kinva sambandhit pradhikaranashi (police/nyayalay) sampark sadha — keval ya sadhanavar avalambun rahu naka.",
    ur: "یہ معاملہ وقت کی نزاکت والا یا فوری نوعیت کا لگتا ہے (مثال کے طور پر: گرفتاری، حراست میں ہونا، ابھی درج ہونے والی FIR، فوری خطرہ، یا اگلے ایک دو دن میں عدالت کی آخری تاریخ)۔ براہ کرم فوری طور پر کسی مستند وکیل، قانونی امدادی خدمت، یا متعلقہ ادارے (پولیس/عدالت) سے رابطہ کریں — صرف اس ٹول پر بھروسہ نہ کریں۔",
  },
};

// Six-way script selector — must match legalAssistant.js's SYSTEM_PROMPT contract
// exactly: "hindi"/"marathi" -> Devanagari, "urdu" -> Perso-Arabic, "hinglish"/
// "marathlish" -> Roman letters, else -> English.
function pickScript(result) {
  const lang = (result?.understanding?.language || "").toLowerCase();
  if (lang === "hindi") return "hi";
  if (lang === "marathi") return "mr";
  if (lang === "urdu") return "ur";
  if (lang === "hinglish") return "hinglish";
  if (lang === "marathlish") return "marathlish";
  return "en";
}

function t(strings, script) {
  return strings[script] || strings.en;
}

function AnswerCard({ turn }) {
  const { result } = turn;
  if (!result) return null;

  const script = pickScript(result);
  const dir = script === "ur" ? "rtl" : "ltr";
  const emergencyMessage = result.emergency?.flag ? t(UI_STRINGS.emergencyMessage, script) : null;
  const disclaimer = t(UI_STRINGS.disclaimer, script);

  if (result.outcome === "no_evidence") {
    return (
      <Card dir={dir}>
        {result.emergency?.flag && (
          <Callout tone="danger" title={t(UI_STRINGS.timeSensitive, script)} style={{ marginBottom: 12 }}>
            {emergencyMessage}
          </Callout>
        )}
        <EmptyState title={t(UI_STRINGS.insufficientSources, script)} body={result.sections.insufficiencyNote} />
        <Callout tone="neutral" style={{ marginTop: 12 }}>{disclaimer}</Callout>
      </Card>
    );
  }

  const sections = SECTION_META.filter((s) => result.sections[s.key]);

  return (
    <Card dir={dir}>
      {result.emergency?.flag && (
        <Callout tone="danger" title={t(UI_STRINGS.timeSensitive, script)} style={{ marginBottom: 12 }}>
          {emergencyMessage}
        </Callout>
      )}

      {result.outcome === "unparsed" && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>
          {t(UI_STRINGS.unparsedWarning, script)}
        </Callout>
      )}

      {!result.sections.hasSufficientEvidence && result.sections.insufficiencyNote && (
        <Callout tone="warning" style={{ marginBottom: 12 }}>{result.sections.insufficiencyNote}</Callout>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sections.map((s) => (
          <div key={s.key}>
            <Badge tone={s.tone}>{t(s.label, script)}</Badge>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 6, whiteSpace: "pre-wrap" }}>{result.sections[s.key]}</div>
          </div>
        ))}
      </div>

      {result.sources?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{t(UI_STRINGS.sources, script)}</div>
          <ol style={{ fontSize: 12, color: "var(--color-text-muted)", paddingLeft: 18 }}>
            {result.sources.map((s, i) => (
              <li key={s.tid} style={{ marginBottom: 3 }}>
                [{i + 1}]{" "}
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                  {s.title}
                </a>{" "}
                <span style={{ opacity: 0.7 }}>({s.docsource})</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Callout tone="neutral" style={{ marginTop: 14 }}>{disclaimer}</Callout>
    </Card>
  );
}

export function LegalAssistant() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nextTurnId = useRef(0);

  async function ask(question) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setError("");
    nextTurnId.current += 1;
    const turnId = nextTurnId.current;
    setTurns((t) => [...t, { id: turnId, question: q, result: null }]);
    setLoading(true);
    try {
      const result = await askLegalAssistant(q);
      setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, result } : turn)));
    } catch (err) {
      setError(err.message);
      setTurns((t) => t.filter((turn) => turn.id !== turnId));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>AI Legal Assistant</div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          Ask a question about Indian law in your own words — English, Hindi, Marathi, Urdu, or a mix (Roman-script Hinglish/Marathlish
          works too). Answers are grounded in real Indian Kanoon sources with citations.
        </div>
      </div>

      <Callout tone="warning" title="Not a substitute for a lawyer">
        This assistant gives general legal information, not legal advice — it never guarantees outcomes and can't replace a
        qualified Indian lawyer. For arrests, violence, or urgent deadlines, contact a lawyer or the relevant authority
        immediately.
      </Callout>

      {turns.length === 0 && (
        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Try asking</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => ask(p)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-border)",
                  background: "#fff",
                  fontSize: 12.5,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {turns.map((turn) => (
          <div key={turn.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "85%",
                background: "var(--color-navy)",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: "14px 14px 2px 14px",
                fontSize: 13.5,
              }}
            >
              {turn.question}
            </div>
            {turn.result ? (
              <AnswerCard turn={turn} />
            ) : (
              <Card style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Researching Indian Kanoon…</Card>
            )}
          </div>
        ))}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, position: "sticky", bottom: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Mujhe FIR ke baare mein jaanna hai…"
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid var(--color-border)" }}
        />
        <Button type="submit" disabled={loading || !input.trim()}>{loading ? "Asking…" : "Ask"}</Button>
      </form>
    </div>
  );
}
