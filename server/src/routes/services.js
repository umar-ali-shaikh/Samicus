import { Router } from "express";
import { Service, ServiceOrder } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/services", async (req, res) => {
  res.json(await Service.find().populate("defaultAdvocateId"));
});

router.post("/services/:id/orders", requireAuth, async (req, res) => {
  const { accountId } = req.body;
  const order = await ServiceOrder.create({ serviceId: req.params.id, accountId, status: "started" });
  res.status(201).json(order);
});

export default router;
