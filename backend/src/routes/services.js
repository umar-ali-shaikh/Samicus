import { Router } from "express";
import { getSupabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/services", async (req, res) => {
  const { data, error } = await getSupabase().from("services").select("*, default_advocate:advocates(*)");
  if (error) throw error;
  res.json(data);
});

router.post("/services/:id/orders", requireAuth, async (req, res) => {
  const { accountId } = req.body;
  const { data: order, error } = await getSupabase()
    .from("service_orders")
    .insert({ service_id: req.params.id, account_id: accountId, status: "started" })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json(order);
});

export default router;
