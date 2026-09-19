// Neutral, server-side, auditable matching. No bids/boosts/ratings — see API & Data Model doc §5.
// Weights are versioned config, returned with every result set for reproducibility.

export const MATCHING_WEIGHTS_VERSION = "2026.1";

const SOFT_WEIGHTS = {
  subSpecialisation: 0.3,
  relevantExperience: 0.25,
  forumFamiliarity: 0.2,
  availability: 0.15,
  feeBand: 0.1,
};

function idStr(refOrDoc) {
  return (refOrDoc?._id || refOrDoc)?.toString();
}

function passesHardFilters(advocate, intake) {
  if (advocate.verificationStatus !== "verified") return false;
  const wantedAreaId = intake.routedPracticeAreaId?.toString();
  if (!advocate.practiceAreas.some((pa) => idStr(pa) === wantedAreaId)) return false;
  if (intake.state && !advocate.jurisdictions.some((j) => j.state === intake.state)) return false;
  if (intake.language && !advocate.languages.includes(intake.language)) return false;
  if (!advocate.consultationModes.includes(intake.mode)) return false;
  return true;
}

function scoreSubSpecialisation(advocate, intake) {
  if (!intake.subSpecialisation) return 0.6; // neutral default when not specified
  return advocate.subSpecialisations.includes(intake.subSpecialisation) ? 1 : 0.3;
}

function scoreRelevantExperience(advocate) {
  const count = advocate.relevantExperience?.length || 0;
  return Math.min(1, count / 3);
}

function scoreForumFamiliarity(advocate, intake) {
  if (!intake.forum) return 0.5;
  return advocate.jurisdictions.some((j) => j.forum === intake.forum) ? 1 : 0.4;
}

function scoreAvailability(advocate, intake) {
  if (advocate.availabilityState !== "available") return 0.2;
  if (intake.urgency === "today" && !advocate.acceptsUrgent) return 0.4;
  return 1;
}

function scoreFeeBand(advocate, intake) {
  const fee = intake.kind === "instant" ? advocate.instantFee : advocate.scheduledFee;
  if (!intake.feeMax) return 0.7;
  return fee <= intake.feeMax ? 1 : 0.2;
}

const SIGNAL_LABELS = {
  subSpecialisation: (a) => `handles ${a.subSpecialisations?.[0] || "this sub-area"} specifically`,
  relevantExperience: () => "has documented relevant matter experience",
  forumFamiliarity: (a) => `regularly appears before this forum`,
  availability: () => "is available within your requested timeframe",
  feeBand: () => "fee fits within your stated band",
};

export function scoreAdvocate(advocate, intake) {
  if (!passesHardFilters(advocate, intake)) return null;

  const breakdown = {
    practiceArea: 1,
    subSpecialisation: scoreSubSpecialisation(advocate, intake),
    jurisdiction: 1,
    forum: scoreForumFamiliarity(advocate, intake),
    language: 1,
    mode: 1,
    availability: scoreAvailability(advocate, intake),
    relevantExperience: scoreRelevantExperience(advocate),
  };

  const weightedSignals = [
    { key: "subSpecialisation", value: breakdown.subSpecialisation, weight: SOFT_WEIGHTS.subSpecialisation },
    { key: "relevantExperience", value: breakdown.relevantExperience, weight: SOFT_WEIGHTS.relevantExperience },
    { key: "forumFamiliarity", value: breakdown.forum, weight: SOFT_WEIGHTS.forumFamiliarity },
    { key: "availability", value: breakdown.availability, weight: SOFT_WEIGHTS.availability },
    { key: "feeBand", value: scoreFeeBand(advocate, intake), weight: SOFT_WEIGHTS.feeBand },
  ];

  const totalScore = weightedSignals.reduce((sum, s) => sum + s.value * s.weight, 0) * 100;

  const topSignals = [...weightedSignals]
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 3)
    .map((s) => SIGNAL_LABELS[s.key](advocate));

  const whyMatched = `Matched because this advocate ${topSignals.join("; ")}.`;

  const estimatedResponseSeconds = advocate.availabilityState === "available" ? 300 : 1800;
  const quotedFee = intake.kind === "instant" ? advocate.instantFee : advocate.scheduledFee;

  return { advocate, scoreBreakdown: breakdown, totalScore, whyMatched, estimatedResponseSeconds, quotedFee };
}

export function rankAdvocates(advocates, intake) {
  return advocates
    .map((a) => scoreAdvocate(a, intake))
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

// Booking-wizard fee math (Samicus §3): gst = round((fee + platformFee) * 0.18)
export const PLATFORM_FEE = 99;
export const GST_RATE = 0.18;

export function computeFees(professionalFee) {
  const platformFee = PLATFORM_FEE;
  const gst = Math.round((professionalFee + platformFee) * GST_RATE);
  const total = professionalFee + platformFee + gst;
  return { professionalFee, platformFee, gst, total };
}
