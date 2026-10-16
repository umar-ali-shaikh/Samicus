"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { AdminAccessGrantListItemDto, AdminMatterAccessInput, AdminMatterReviewDto } from "@vidhira/contracts";

export async function listMatterAccessLogAction(): Promise<AdminAccessGrantListItemDto[]> {
  return apiClient.get<AdminAccessGrantListItemDto[]>("/admin/matter-access");
}

export type MatterAccessResult = { ok: true; review: AdminMatterReviewDto } | { ok: false; error: string };

// Every call is a new, logged access -- the API records a grant (or a denial) per request, so
// the review is held only in the client component's state, never cached or re-fetched.
export async function accessMatterAction(input: AdminMatterAccessInput): Promise<MatterAccessResult> {
  try {
    const review = await apiClient.post<AdminMatterReviewDto>("/admin/matter-access", input);
    revalidatePath("/admin/matter-access");
    return { ok: true, review };
  } catch (err) {
    if (err instanceof ApiError) {
      revalidatePath("/admin/matter-access"); // a denied attempt is logged too
      return { ok: false, error: err.message };
    }
    throw err;
  }
}
