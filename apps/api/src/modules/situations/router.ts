import { Router } from "express";
import { intakeRouteSchema, situationDto, routingResultDto } from "@vidhira/contracts";
import { HttpError } from "../../services/access.js";
import * as service from "./service.js";

const router = Router();

router.get("/situations", async (_req, res) => {
  const situations = await service.listSituations();
  res.json(situations.map((s) => situationDto.parse(s)));
});

router.post("/intake/route", async (req, res) => {
  const parsed = intakeRouteSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || "Invalid input.");
  const result = await service.routeIntake(parsed.data);
  res.json(routingResultDto.parse(result));
});

export default router;
