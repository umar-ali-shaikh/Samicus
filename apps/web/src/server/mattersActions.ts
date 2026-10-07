"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type {
  AccessGrantDto,
  AccessGrantInput,
  FeeProposalDto,
  FeeProposalInput,
  HearingDto,
  HearingInput,
  InvoiceCreateResultDto,
  InvoiceDto,
  InvoiceInput,
  MatterDto,
  MatterPatchInput,
  TaskDto,
  TaskInput,
} from "@vidhira/contracts";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

function refresh(matterId: string) {
  revalidatePath(`/matters/${matterId}`);
  revalidatePath("/matters");
}

export async function patchMatterAction(matterId: string, input: MatterPatchInput): Promise<Result<MatterDto>> {
  const result = await run(() => apiClient.patch<MatterDto>(`/matters/${matterId}`, input));
  refresh(matterId);
  return result;
}

export async function addTaskAction(matterId: string, input: TaskInput): Promise<Result<TaskDto>> {
  const result = await run(() => apiClient.post<TaskDto>(`/matters/${matterId}/tasks`, input));
  refresh(matterId);
  return result;
}

export async function completeTaskAction(matterId: string, taskId: string, completed: boolean): Promise<Result<TaskDto>> {
  const result = await run(() => apiClient.post<TaskDto>(`/matters/${matterId}/tasks/${taskId}/complete`, { completed }));
  refresh(matterId);
  return result;
}

export async function addHearingAction(matterId: string, input: HearingInput): Promise<Result<HearingDto>> {
  const result = await run(() => apiClient.post<HearingDto>(`/matters/${matterId}/hearings`, input));
  refresh(matterId);
  return result;
}

export async function grantAccessAction(matterId: string, input: AccessGrantInput): Promise<Result<AccessGrantDto>> {
  const result = await run(() => apiClient.post<AccessGrantDto>(`/matters/${matterId}/access`, input));
  refresh(matterId);
  return result;
}

export async function revokeAccessAction(matterId: string, grantId: string): Promise<Result<null>> {
  const result = await run(async () => {
    await apiClient.delete(`/matters/${matterId}/access/${grantId}`);
    return null;
  });
  refresh(matterId);
  return result;
}

export async function sendFeeProposalAction(matterId: string, input: FeeProposalInput): Promise<Result<FeeProposalDto>> {
  const result = await run(() => apiClient.post<FeeProposalDto>(`/matters/${matterId}/fee-proposals`, input));
  refresh(matterId);
  return result;
}

export async function acceptFeeProposalAction(matterId: string, proposalId: string): Promise<Result<FeeProposalDto>> {
  const result = await run(() => apiClient.post<FeeProposalDto>(`/matters/${matterId}/fee-proposals/${proposalId}/accept`));
  refresh(matterId);
  return result;
}

export async function raiseInvoiceAction(matterId: string, input: InvoiceInput): Promise<Result<InvoiceCreateResultDto>> {
  const result = await run(() => apiClient.post<InvoiceCreateResultDto>(`/matters/${matterId}/invoices`, input));
  refresh(matterId);
  return result;
}

export async function settleInvoiceOfflineAction(matterId: string, invoiceId: string): Promise<Result<InvoiceDto>> {
  const result = await run(() => apiClient.post<InvoiceDto>(`/matters/${matterId}/invoices/${invoiceId}/settle-offline`));
  refresh(matterId);
  return result;
}
