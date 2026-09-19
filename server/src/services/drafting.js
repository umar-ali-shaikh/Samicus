// Document-assembly engine (API & Data Model doc §9). Server-authoritative: the same
// {template, fieldValues, selectedClauseIds, customClauses} always renders identically.

function renderTemplateString(str, vals, fieldSchema) {
  const usedFallback = new Set();
  const rendered = str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vals[key];
    if (value !== undefined && value !== null && value !== "") return value;
    const field = fieldSchema.find((f) => f.key === key);
    usedFallback.add(key);
    return field?.placeholder || `[${key}]`;
  });
  return { rendered, usedFallback: [...usedFallback] };
}

export function checkClauseGuards(selectedClauseIds, clauseLibrary, fieldValues) {
  const errors = [];
  const selectedSet = new Set(selectedClauseIds.map((id) => id.toString()));
  for (const clause of clauseLibrary) {
    if (!selectedSet.has(clause._id.toString())) continue;
    for (const conflictId of clause.conflictsWith || []) {
      if (selectedSet.has(conflictId.toString())) {
        errors.push(`"${clause.title}" conflicts with another selected clause.`);
      }
    }
    for (const requiredField of clause.requiresFields || []) {
      if (!fieldValues[requiredField]) {
        errors.push(`"${clause.title}" requires field "${requiredField}" to be filled first.`);
      }
    }
  }
  return errors;
}

// Returns the ordered, numbered clause list: base sections, then selected library
// clauses (in library order), then custom clauses appended last and unreviewed.
export function assembleDraft({ template, fieldValues, selectedClauses, customClauses }) {
  let n = 0;
  const flaggedFields = new Set();

  const baseBlocks = (template.baseSections || []).map((section) => {
    n += 1;
    const { rendered, usedFallback } = renderTemplateString(section.bodyTemplate, fieldValues, template.fieldSchema);
    usedFallback.forEach((f) => flaggedFields.add(f));
    return { n, heading: section.heading, text: rendered, source: "base", reviewAdvised: false };
  });

  const clauseBlocks = selectedClauses.map((clause) => {
    n += 1;
    const { rendered, usedFallback } = renderTemplateString(clause.bodyTemplate, fieldValues, template.fieldSchema);
    usedFallback.forEach((f) => flaggedFields.add(f));
    return {
      n,
      heading: clause.title,
      text: rendered,
      source: "library",
      favors: clause.favors,
      disposition: clause.disposition,
      rationaleNote: clause.rationaleNote,
      reviewAdvised: clause.disposition === "review_advised",
    };
  });

  const customBlocks = (customClauses || [])
    .filter((c) => c.body && c.body.trim())
    .map((c) => {
      n += 1;
      return { n, heading: c.title || "Additional clause agreed between the parties", text: c.body, source: "custom", reviewAdvised: true };
    });

  return {
    blocks: [...baseBlocks, ...clauseBlocks, ...customBlocks],
    flaggedFields: [...flaggedFields],
  };
}
