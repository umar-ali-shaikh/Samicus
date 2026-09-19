import { Router } from "express";
import { DocTemplate, ClauseLibrary, DocumentDraft, DraftReview, StampOrder, Advocate } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { assembleDraft, checkClauseGuards } from "../services/drafting.js";

const router = Router();

router.get("/doc-templates", async (req, res) => {
  res.json(await DocTemplate.find({ retiredAt: null }));
});

router.get("/doc-templates/:id", async (req, res) => {
  const template = await DocTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ error: "Not found" });
  const clauses = await ClauseLibrary.find({ templateId: template._id });
  res.json({ template, clauses });
});

router.post("/drafts", requireAuth, async (req, res) => {
  const { accountId, templateId } = req.body;
  const template = await DocTemplate.findById(templateId);
  if (!template) return res.status(404).json({ error: "Template not found" });

  const draft = await DocumentDraft.create({
    accountId,
    templateId,
    templateVersion: template.version,
    createdBy: req.user._id,
  });
  res.status(201).json(draft);
});

router.patch("/drafts/:id", requireAuth, async (req, res) => {
  const { fieldValues, selectedClauseIds, customClauses } = req.body;
  const draft = await DocumentDraft.findById(req.params.id);
  if (!draft) return res.status(404).json({ error: "Not found" });

  if (selectedClauseIds) {
    const clauses = await ClauseLibrary.find({ _id: { $in: selectedClauseIds } });
    const errors = checkClauseGuards(selectedClauseIds, clauses, { ...draft.fieldValues, ...fieldValues });
    if (errors.length) return res.status(422).json({ errors });
    draft.selectedClauseIds = selectedClauseIds;
  }
  if (fieldValues) draft.fieldValues = { ...draft.fieldValues, ...fieldValues };
  if (customClauses) draft.customClauses = customClauses;
  await draft.save();
  res.json(draft);
});

// Server-authoritative rendering: same inputs always assemble identically (pinned template version).
router.post("/drafts/:id/preview", requireAuth, async (req, res) => {
  const draft = await DocumentDraft.findById(req.params.id).populate("templateId");
  if (!draft) return res.status(404).json({ error: "Not found" });

  const selectedClauses = await ClauseLibrary.find({ _id: { $in: draft.selectedClauseIds } });
  const assembled = assembleDraft({
    template: draft.templateId,
    fieldValues: draft.fieldValues,
    selectedClauses,
    customClauses: draft.customClauses,
  });
  res.json(assembled);
});

router.post("/drafts/:id/render", requireAuth, async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "docx";
  const draft = await DocumentDraft.findById(req.params.id);
  if (!draft) return res.status(404).json({ error: "Not found" });
  draft.renderKeys[format] = `draft-${draft._id}.${format}`;
  draft.status = "rendered";
  await draft.save();
  res.json({ renderKey: draft.renderKeys[format], format });
});

router.post("/drafts/:id/reviews", requireAuth, async (req, res) => {
  const { advocateId } = req.body;
  const advocate = await Advocate.findById(advocateId);
  if (!advocate) return res.status(404).json({ error: "Advocate not found" });

  const review = await DraftReview.create({ draftId: req.params.id, advocateId, fee: 1499 });
  await DocumentDraft.findByIdAndUpdate(req.params.id, { status: "sent_for_review", reviewId: review._id });
  res.status(201).json(review);
});

router.get("/drafts/:id/reviews/:rid", requireAuth, async (req, res) => {
  const review = await DraftReview.findOne({ _id: req.params.rid, draftId: req.params.id });
  if (!review) return res.status(404).json({ error: "Not found" });
  res.json(review);
});

router.post("/drafts/:id/stamp-orders", requireAuth, async (req, res) => {
  const draft = await DocumentDraft.findById(req.params.id).populate("templateId");
  const order = await StampOrder.create({
    draftId: req.params.id,
    state: req.body.state,
    instrumentType: draft.templateId.category,
    dutyAmount: req.body.dutyAmount ?? 500,
    status: "quoted",
  });
  res.status(201).json(order);
});

export default router;
