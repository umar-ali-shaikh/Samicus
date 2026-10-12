// Shared between the research report and judgment-reader pages -- ported from
// frontend/src/screens/Research.jsx's exported CLASS_LABEL/SOURCE_LABEL.
export const CLASS_LABEL: Record<string, string> = {
  provision: "Statutory provision",
  facts: "Facts",
  issues: "Issue",
  petitioner_arguments: "Petitioner's argument",
  respondent_arguments: "Respondent's argument",
  reasoning: "Court's reasoning",
  holding: "Court's holding",
  directions: "Directions",
  quoted_precedent: "Quoted precedent",
};

export const SOURCE_LABEL: Record<string, string> = {
  bare_act: "Bare act",
  supreme_court: "Supreme Court",
  high_court: "High Court",
  rules: "Rules",
  tribunal: "Tribunal",
  other: "Other",
  ccpa: "CCPA",
  asci: "ASCI",
  web: "Article",
};
