/**
 * Accounts-domain authorization. Ported from middleware/auth.js's requireAccountAccess, which
 * was only ever used by routes/accounts.js -- moved here per the per-domain policy.ts layering
 * (docs/architecture/01-target-architecture.md section 3), out of the shared cross-cutting
 * middleware/auth.ts.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSupabase } from "../../config/db.js";

interface AccountMembership {
  id: string;
  role: string;
}

async function loadAccountMembership(userId: string, accountId: string): Promise<AccountMembership | null> {
  const { data, error } = await getSupabase()
    .from("account_members")
    .select("*")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data as AccountMembership | null;
}

/** Express middleware: confirms req.user is a member of :accountId (route param) with one of
 * the given roles (any accepted role if none given). Attaches the membership as req.membership. */
export function requireAccountAccess(...roles: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.id || req.params.accountId || (req.body as { accountId?: string } | undefined)?.accountId;
      const membership = await loadAccountMembership(req.user!.id, accountId as string);
      if (!membership || (roles.length && !roles.includes(membership.role))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}
