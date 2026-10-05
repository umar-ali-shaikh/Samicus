import { useUI } from "../state/UIState";
import { ResearchHome } from "./research/ResearchHome";
import { ResearchReport } from "./research/ResearchReport";
import { JudgmentReader } from "./research/JudgmentReader";

export const CLASS_LABEL = {
  provision: "Statutory provision", facts: "Facts", issues: "Issue", petitioner_arguments: "Petitioner's argument", respondent_arguments: "Respondent's argument",
  reasoning: "Court's reasoning", holding: "Court's holding", directions: "Directions", quoted_precedent: "Quoted precedent",
};
export const SOURCE_LABEL = { bare_act: "Bare act", supreme_court: "Supreme Court", high_court: "High Court", rules: "Rules", tribunal: "Tribunal", other: "Other", ccpa: "CCPA", asci: "ASCI", web: "Article" };

// #research          -> ResearchHome (search + My Research list + browse library)
// #research/doc/<id> -> JudgmentReader (in-app full judgment, cited paragraphs highlighted)
// #research/<id>     -> ResearchReport (a saved search's full report)
export function Research() {
  const { param } = useUI();
  if (!param) return <ResearchHome />;
  if (param.startsWith("doc/")) return <JudgmentReader docId={param.slice(4)} />;
  return <ResearchReport searchId={param} />;
}
