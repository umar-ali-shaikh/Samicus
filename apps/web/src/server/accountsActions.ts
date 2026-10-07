"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type { AuthFormState } from "./authActionState";
import type { AccountMemberDto } from "@vidhira/contracts";

const GSTIN_HELP = "Enter a valid GSTIN or leave it blank.";

export async function createAccountAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const type = String(formData.get("type") || "");
  const displayName = String(formData.get("displayName") || "").trim();
  const gstin = String(formData.get("gstin") || "").trim();
  const billingAddress = String(formData.get("billingAddress") || "").trim();

  if (type !== "business" && type !== "family") return { error: "Choose an account type." };
  if (displayName.length < 2) return { error: "Enter a name for the account." };

  try {
    await apiClient.post("/accounts", {
      type,
      displayName,
      gstin: gstin || undefined,
      billingAddress: billingAddress || undefined,
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: /gstin/i.test(err.message) ? GSTIN_HELP : err.message };
    throw err;
  }
  revalidatePath("/profile");
  return { notice: "Account created." };
}

export async function addMemberAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const accountId = String(formData.get("accountId") || "");
  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "member");

  try {
    await apiClient.post(`/accounts/${accountId}/members`, { email, role });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  revalidatePath("/profile");
  return { notice: "Member added. They get access when they sign in with that email." };
}

export async function removeMemberAction(accountId: string, memberId: string): Promise<void> {
  await apiClient.delete(`/accounts/${accountId}/members/${memberId}`);
  revalidatePath("/profile");
}

export async function getMembersAction(accountId: string): Promise<AccountMemberDto[]> {
  return apiClient.get<AccountMemberDto[]>(`/accounts/${accountId}/members`);
}
