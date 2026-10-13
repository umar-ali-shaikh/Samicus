"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { AdminServiceOrderDto, AssignServiceOrderInput, CreateServiceInput, ServiceRowDto, ServiceOrderRowDto } from "@vidhira/contracts";

export type SaveServiceResult = { ok: true; service: ServiceRowDto } | { ok: false; error: string };

export async function createServiceAction(input: CreateServiceInput): Promise<SaveServiceResult> {
  try {
    const service = await apiClient.post<ServiceRowDto>("/admin/services", input);
    revalidatePath("/admin/catalogue");
    revalidatePath("/services");
    return { ok: true, service };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function updateServiceAction(id: string, input: CreateServiceInput): Promise<SaveServiceResult> {
  try {
    const service = await apiClient.put<ServiceRowDto>(`/admin/services/${id}`, input);
    revalidatePath("/admin/catalogue");
    revalidatePath("/services");
    return { ok: true, service };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function deleteServiceAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiClient.delete(`/admin/services/${id}`);
    revalidatePath("/admin/catalogue");
    revalidatePath("/services");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getAdminServiceOrdersAction(): Promise<AdminServiceOrderDto[]> {
  return apiClient.get<AdminServiceOrderDto[]>("/admin/service-orders");
}

export type AssignOrderResult = { ok: true; order: ServiceOrderRowDto } | { ok: false; error: string };

export async function assignServiceOrderAction(orderId: string, input: AssignServiceOrderInput): Promise<AssignOrderResult> {
  try {
    const order = await apiClient.post<ServiceOrderRowDto>(`/admin/service-orders/${orderId}/assign`, input);
    revalidatePath("/admin/orders");
    return { ok: true, order };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
