"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { ContractReviewDetailDto, CreateContractReviewInput } from "@vidhira/contracts";

export type CreateContractReviewResult = { ok: true; review: ContractReviewDetailDto } | { ok: false; error: string };

export async function createContractReviewAction(input: CreateContractReviewInput): Promise<CreateContractReviewResult> {
  try {
    const review = await apiClient.post<ContractReviewDetailDto>("/contract-reviews", input);
    revalidatePath("/contract-review");
    return { ok: true, review };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getContractReviewAction(id: string): Promise<ContractReviewDetailDto> {
  return apiClient.get<ContractReviewDetailDto>(`/contract-reviews/${id}`);
}
