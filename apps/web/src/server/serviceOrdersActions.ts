"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { CreateServiceOrderInput, ServiceOrderRowDto } from "@vidhira/contracts";

export type CreateServiceOrderResult = { ok: true; order: ServiceOrderRowDto } | { ok: false; error: string };

export async function createServiceOrderAction(serviceId: string, input: CreateServiceOrderInput): Promise<CreateServiceOrderResult> {
  try {
    const order = await apiClient.post<ServiceOrderRowDto>(`/services/${serviceId}/orders`, input);
    revalidatePath("/services");
    return { ok: true, order };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
