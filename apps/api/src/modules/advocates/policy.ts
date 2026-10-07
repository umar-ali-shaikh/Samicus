/**
 * Advocates-domain authorization/loading. Ported from routes/advocates.js's selfAdvocate
 * middleware -- loads the caller's own advocate row (with practice area ids flattened) and
 * 404s if they don't have one, before any self-service route logic runs.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { loadSelfAdvocate, type SelfAdvocate } from "./service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      advocate?: SelfAdvocate;
    }
  }
}

export const selfAdvocate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const advocate = await loadSelfAdvocate(req.user!.id);
    if (!advocate) return res.status(404).json({ error: "No advocate profile for this user" });
    req.advocate = advocate;
    next();
  } catch (err) {
    next(err);
  }
};
