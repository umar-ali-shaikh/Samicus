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
  { key: "statute", label: { en: "Law / statute", hi: "कानून / धारा", hinglish: "Kanoon / Dhara" }, tone: "info" },
  { key: "judgments", label: { en: "Court judgment(s)", hi: "न्यायालय के निर्णय", hinglish: "Adalat ke faisle" }, tone: "neutral" },
  { key: "interpretation", label: { en: "Legal interpretation", hi: "कानूनी व्याख्या", hinglish: "Kanooni vyakhya" }, tone: "warning" },
  { key: "generalInformation", label: { en: "General information", hi: "सामान्य जानकारी", hinglish: "Samanya jaankari" }, tone: "neutral" },
  { key: "practicalNextSteps", label: { en: "Practical next steps", hi: "व्यावहारिक अगले कदम", hinglish: "Vyavaharik agle kadam" }, tone: "success" },
];

// Fixed (non-LLM) UI strings, translated once and reviewed — never machine-translated
// per-request. Mirrors the server's own policy for the disclaimer/emergency text
// (see legalAssistant.js): safety-critical copy must never depend on a model call.
//
// "hindi" and "hinglish" are two DIFFERENT scripts, not interchangeable: hindi is
// Devanagari (हिंदी), hinglish is Hindi meaning transliterated strictly into Roman/
// English letters (no Devanagari characters at all). A Hinglish-speaking user reads
// Roman letters, not Devanagari — mixing the two mid-answer (e.g. Devanagari headings
// over Romanized body text) is exactly the bug this three-way split fixes.
const UI_STRINGS = {
  timeSensitive: { en: "Time-sensitive", hi: "समय-संवेदनशील", hinglish: "Samay-sanvedansheel" },
  insufficientSources: { en: "Insufficient sources", hi: "अपर्याप्त स्रोत", hinglish: "Paryapt sources nahi mile" },
  unparsedWarning: {
    en: "The assistant's response couldn't be split into structured sections — shown below as general information.",
    hi: "सहायक की प्रतिक्रिया को संरचित अनुभागों में विभाजित नहीं किया जा सका — इसे नीचे सामान्य जानकारी के रूप में दिखाया गया है।",
    hinglish: "Assistant ka jawab structured sections mein nahi baant paya — isliye neeche general information ke roop mein dikhaya gaya hai.",
  },
  sources: { en: "Sources", hi: "स्रोत", hinglish: "Sources" },
  disclaimer: {
    en: "This is general legal information for education and research purposes, generated only from the Indian Kanoon sources listed below — it is not legal advice from a lawyer, it does not create a lawyer-client relationship, and it cannot guarantee any outcome. For anything serious, urgent, criminal, financial, family, property, or litigation-related, please consult a qualified Indian lawyer.",
    hi: "यह सामान्य कानूनी जानकारी केवल शिक्षा और अनुसंधान के उद्देश्य से दी गई है, और नीचे सूचीबद्ध Indian Kanoon स्रोतों पर आधारित है — यह किसी वकील की कानूनी सलाह नहीं है, इससे वकील-मुवक्किल संबंध स्थापित नहीं होता, और यह किसी परिणाम की गारंटी नहीं देती। किसी भी गंभीर, तत्काल, आपराधिक, वित्तीय, पारिवारिक, संपत्ति संबंधी, या मुकदमेबाज़ी से जुड़े मामले के लिए कृपया किसी योग्य भारतीय वकील से सलाह लें।",
    hinglish: "Yeh sirf general legal jaankari hai, sirf education aur research ke maksad se, aur neeche diye gaye Indian Kanoon sources par based hai — yeh kisi vakil ki legal advice nahi hai, isse vakil-client relationship nahi banta, aur yeh kisi outcome ki guarantee nahi deta. Kisi bhi serious, urgent, criminal, financial, family, property, ya litigation se judi baat ke liye kripya ek qualified Indian vakil se salah lein.",
  },
  emergencyMessage: {
    en: "This looks like it may be a time-sensitive or urgent situation (for example: an arrest, being in custody, an FIR just filed, an immediate threat, or a court deadline in the next day or two). Please contact a qualified lawyer, a legal aid service, or the relevant authority (police / court) immediately — do not rely only on this tool.",
    hi: "यह मामला समय-संवेदनशील या तत्काल स्थिति जैसा लग रहा है (उदाहरण के लिए: गिरफ़्तारी, हिरासत में होना, अभी-अभी दर्ज हुई FIR, तत्काल ख़तरा, या अगले एक-दो दिन में अदालत की समय-सीमा)। कृपया तुरंत किसी योग्य वकील, कानूनी सहायता सेवा, या संबंधित प्राधिकरण (पुलिस/अदालत) से संपर्क करें — केवल इस टूल पर निर्भर न रहें।",
    hinglish: "Yeh mamla samay-sanvedansheel ya turant wali situation jaisa lag raha hai (jaise: giraftari, hiraasat mein hona, abhi-abhi darj hui FIR, turant khatra, ya agle ek-do din mein court ki deadline). Kripya turant kisi qualified vakil, legal aid service, ya sambandhit pradhikaran (police/court) se sampark karein — sirf is tool par bharosa na karein.",
  },
};

// Three-way script selector — must match legalAssistant.js's SYSTEM_PROMPT contract
// exactly: "hindi" -> Devanagari, "hinglish" -> Roman letters, else -> English.
function pickScript(result) {
  const lang = (result?.understanding?.language || "").toLowerCase();
  if (lang === "hindi") return "hi";
  if (lang === "hinglish") return "hinglish";
  return "en";
}

function t(strings, script) {
  return strings[script] || strings.en;
}

function AnswerCard({ turn }) {
  const { result } = turn;
  if (!result) return null;

  const script = pickScript(result);
  const emergencyMessage = result.emergency?.flag ? t(UI_STRINGS.emergencyMessage, script) : null;
  const disclaimer = t(UI_STRINGS.disclaimer, script);

  if (result.outcome === "no_evidence") {
    return (
      <Card>
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
    <Card>
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
          Ask a question about Indian law in your own words — English, Hindi, or a mix. Answers are grounded in real Indian Kanoon
          sources with citations.
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
