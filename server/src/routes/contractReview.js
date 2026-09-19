import { Router } from "express";
import { ContractReview, ClauseLibrary, DocTemplate } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Same clause library backs both drafting and review (API & Data Model doc §7): a clause's
// stated `favors` + `rationaleNote` become the review's baseline comparison for free.
router.post("/contract-reviews", requireAuth, async (req, res) => {
  const { accountId, documentId, contractType, counterpartyName } = req.body;

  const template = await DocTemplate.findOne({ category: contractType });
  const libraryEntries = template ? await ClauseLibrary.find({ templateId: template._id }) : [];

  const findings = libraryEntries.map((clause) => ({
    clauseType: clause.title,
    clauseRef: clause._id.toString(),
    extractedText: clause.bodyTemplate.replace(/\{\{(\w+)\}\}/g, "[$1]"),
    libraryEntryId: clause._id,
    favors: clause.favors,
    deviationNote: clause.disposition === "review_advised" ? "Deviates from the balanced baseline for this clause type." : "Matches the balanced baseline.",
    recommendedAsk: clause.disposition === "review_advised" ? `Request the ${clause.riskSide === "client" ? "counterparty" : "client"}-favouring language be brought back to the standard position.` : "",
    authorityCitation: "",
  }));

  const review = await ContractReview.create({
    accountId,
    documentId,
    contractType,
    counterpartyName,
    clausesIdentified: findings.length,
    findings,
    status: "done",
  });
  res.status(201).json(review);
});

router.get("/contract-reviews/:id", requireAuth, async (req, res) => {
  const review = await ContractReview.findById(req.params.id).populate("findings.libraryEntryId");
  if (!review) return res.status(404).json({ error: "Not found" });
  res.json(review);
});

router.post("/contract-reviews/:id/redline", requireAuth, async (req, res) => {
  const review = await ContractReview.findByIdAndUpdate(req.params.id, { redlineKey: `redline-${req.params.id}.docx` }, { new: true });
  res.json({ redlineKey: review.redlineKey, note: "Comparison against the balanced baseline, not a legal opinion." });
});

export default router;
