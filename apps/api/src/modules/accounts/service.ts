/**
 * Business logic for the accounts domain. Ported from routes/accounts.js -- same behaviour,
 * including the exact validation order and error messages, split out from HTTP concerns.
 */
import { HttpError } from "../../services/access.js";
import type { AccountDto, AccountMemberDto, AddMemberInput, CreateAccountInput, PlanDto } from "@vidhira/contracts";
import * as repo from "./repository.js";

function toAccountDto(account: repo.AccountRow, myRole: string): AccountDto {
  return {
    id: account.id,
    type: account.type,
    display_name: account.display_name,
    gstin: account.gstin ?? null,
    cin: account.cin ?? null,
    billing_address: account.billing_address ?? null,
    seat_limit: account.seat_limit,
    myRole: myRole as AccountDto["myRole"],
  };
}

function toMemberDto(member: repo.MemberRow): AccountMemberDto {
  return {
    id: member.id,
    role: member.role as AccountMemberDto["role"],
    invited_at: member.invited_at ?? null,
    accepted_at: member.accepted_at ?? null,
    user: member.user
      ? {
          id: member.user.id,
          full_name: member.user.full_name,
          email: member.user.email ?? null,
          avatar_url: member.user.avatar_url ?? null,
        }
      : null,
  };
}

function toPlanDto(plan: repo.PlanRow): PlanDto {
  return {
    id: plan.id,
    name: plan.name,
    audience: plan.audience,
    price_monthly: plan.price_monthly,
    entitlement_consultations: plan.entitlement_consultations ?? null,
    entitlement_document_reviews: plan.entitlement_document_reviews ?? null,
    entitlement_seats: plan.entitlement_seats ?? null,
  };
}

export async function listMyAccounts(userId: string): Promise<AccountDto[]> {
  const memberships = await repo.listMembershipsWithAccounts(userId);
  return memberships.map((m) => toAccountDto(m.account, m.role));
}

export async function createAccount(userId: string, input: CreateAccountInput): Promise<AccountDto> {
  let account: repo.AccountRow;
  try {
    account = await repo.insertAccount(input);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "An account with that name already exists.");
    throw err;
  }
  await repo.insertOwnerMembership(account.id, userId);
  return toAccountDto(account, "owner");
}

export async function listPlans(): Promise<PlanDto[]> {
  const plans = await repo.listPlans();
  return plans.map(toPlanDto);
}

export async function addMember(accountId: string, input: AddMemberInput): Promise<AccountMemberDto> {
  let user = await repo.findUserByEmail(input.email);
  if (!user) user = await repo.insertPlaceholderUser(input.email, input.fullName);

  const existing = await repo.findMembership(accountId, user.id);
  if (existing) throw new HttpError(409, "Already a member");

  const [seatLimit, seats] = await Promise.all([repo.getAccountSeatLimit(accountId), repo.countMembers(accountId)]);
  if (seats >= seatLimit) throw new HttpError(409, `This account is limited to ${seatLimit} members.`);

  const member = await repo.insertMember({ accountId, userId: user.id, role: input.role || "member" });
  return {
    id: member.id,
    role: member.role as AccountMemberDto["role"],
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
    user: { id: user.id, full_name: user.full_name, email: user.email ?? null, avatar_url: null },
  };
}

export async function listMembers(accountId: string): Promise<AccountMemberDto[]> {
  const members = await repo.listMembers(accountId);
  return members.map(toMemberDto);
}

export async function removeMember(accountId: string, memberId: string): Promise<void> {
  await repo.deleteMember(accountId, memberId);
}
