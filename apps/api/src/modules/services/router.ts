/**
 * Fixed-fee services domain router. Ported from routes/services.js -- zero business logic
 * here, per docs/architecture/01-target-architecture.md section 3. Response DTOs are
 * Zod-parsed (.strict()) before being sent.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { HttpError } from "../../services/access.js";
import {
  createServiceSchema,
  createServiceOrderSchema,
  assignServiceOrderSchema,
  serviceListItemDto,
  serviceRowDto,
  serviceOrderDto,
  serviceOrderRowDto,
  adminServiceOrderDto,
} from "@vidhira/contracts";
import { z } from "zod";
import * as service from "./service.js";

const router = Router();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

router.get("/services", async (_req, res) => {
  res.json(z.array(serviceListItemDto).parse(await service.listServices()));
});

router.post("/admin/services", requireAuth, requireRole("admin"), async (req, res) => {
  const input = parse(createServiceSchema, req.body);
  res.status(201).json(serviceRowDto.parse(await service.createService(input)));
});

router.put("/admin/services/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const input = parse(createServiceSchema, req.body);
  res.json(serviceRowDto.parse(await service.updateService(String(req.params.id), input)));
});

router.delete("/admin/services/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await service.deleteService(String(req.params.id));
  res.status(204).end();
});

router.post("/services/:id/orders", requireAuth, async (req, res) => {
  const input = parse(createServiceOrderSchema, req.body);
  res.status(201).json(serviceOrderRowDto.parse(await service.createOrder(req.user!, String(req.params.id), input)));
});

router.get("/service-orders", requireAuth, async (req, res) => {
  res.json(z.array(serviceOrderDto).parse(await service.listMyOrders(req.user!)));
});

// Admin: paid orders waiting for an advocate, and assignment.
router.get("/admin/service-orders", requireAuth, requireRole("admin"), async (_req, res) => {
  res.json(z.array(adminServiceOrderDto).parse(await service.listOrdersForAdmin()));
});

router.post("/admin/service-orders/:id/assign", requireAuth, requireRole("admin"), async (req, res) => {
  const input = parse(assignServiceOrderSchema, req.body);
  res.json(serviceOrderRowDto.parse(await service.assignOrder(String(req.params.id), input)));
});

export default router;
