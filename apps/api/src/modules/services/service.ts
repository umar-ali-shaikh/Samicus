/**
 * Business logic for the fixed-fee services domain. Ported from routes/services.js -- same
 * behaviour, including the "a service with orders cannot be deleted" guard.
 */
import { computeFees } from "../../services/matching.js";
import { HttpError, assertAccountMember, defaultAccountId, memberAccountIds } from "../../services/access.js";
import type {
  AdminServiceOrderDto,
  AssignServiceOrderInput,
  CreateServiceInput,
  CreateServiceOrderInput,
  ServiceListItemDto,
  ServiceOrderDto,
  ServiceOrderRowDto,
  ServiceRowDto,
} from "@vidhira/contracts";
import * as repo from "./repository.js";
import type { ServiceRowInsert } from "./repository.js";

function toServiceListItem(row: repo.ServiceRow): ServiceListItemDto {
  const fees = computeFees(Number(row.professional_fee)) as { professionalFee: number; platformFee: number; gst: number; total: number };
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    professional_fee: row.professional_fee,
    government_fee: row.government_fee,
    timeline_days: row.timeline_days,
    includes: row.includes,
    required_documents: row.required_documents,
    deliverables: row.deliverables,
    fees,
    gov: Number(row.government_fee),
  };
}

function toRow(input: CreateServiceInput): ServiceRowInsert {
  return {
    category: input.category,
    name: input.name,
    description: input.description ?? null,
    professional_fee: input.professionalFee,
    government_fee: input.governmentFee,
    timeline_days: input.timelineDays ?? null,
    includes: input.includes,
    required_documents: input.requiredDocuments,
    deliverables: input.deliverables,
  };
}

export async function listServices(): Promise<ServiceListItemDto[]> {
  return (await repo.listServices()).map(toServiceListItem);
}

function toServiceRowDto(row: repo.ServiceRow): ServiceRowDto {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    professional_fee: row.professional_fee,
    government_fee: row.government_fee,
    timeline_days: row.timeline_days,
    includes: row.includes,
    required_documents: row.required_documents,
    deliverables: row.deliverables,
  };
}

export async function createService(input: CreateServiceInput): Promise<ServiceRowDto> {
  return toServiceRowDto(await repo.insertService(toRow(input)));
}

export async function updateService(id: string, input: CreateServiceInput): Promise<ServiceRowDto> {
  const updated = await repo.updateService(id, toRow(input));
  if (!updated) throw new HttpError(404, "Service not found.");
  return toServiceRowDto(updated);
}

export async function deleteService(id: string): Promise<void> {
  const orderCount = await repo.countOrdersForService(id);
  if (orderCount > 0) throw new HttpError(409, "This service has orders and cannot be deleted.");
  await repo.deleteService(id);
}

function toOrderRowDto(row: repo.OrderRow): ServiceOrderRowDto {
  return { id: row.id, service_id: row.service_id, account_id: row.account_id, status: row.status, matter_id: row.matter_id, paid_at: row.paid_at, advocate_id: row.advocate_id, notes: row.notes, created_at: row.created_at };
}

export async function createOrder(user: { id: string }, serviceId: string, input: CreateServiceOrderInput): Promise<ServiceOrderRowDto> {
  const accountId = input.accountId || (await defaultAccountId(user.id));
  await assertAccountMember(user.id, accountId);
  const service = await repo.getServiceById(serviceId);
  if (!service) throw new HttpError(404, "Service not found.");
  return toOrderRowDto(await repo.insertOrder({ serviceId: service.id, accountId: accountId as string, notes: input.notes ?? null }));
}

export async function listMyOrders(user: { id: string }): Promise<ServiceOrderDto[]> {
  const accountIds = await memberAccountIds(user.id);
  const rows = await repo.listOrdersForAccounts(accountIds);
  return rows.map((r) => ({
    id: r.id,
    service_id: r.service_id,
    account_id: r.account_id,
    status: r.status,
    matter_id: r.matter_id,
    paid_at: r.paid_at,
    advocate_id: r.advocate_id,
    notes: r.notes,
    created_at: r.created_at,
    service: r.service,
  }));
}

export async function listOrdersForAdmin(): Promise<AdminServiceOrderDto[]> {
  const rows = await repo.listAllOrdersForAdmin();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    paid_at: r.paid_at,
    notes: r.notes,
    created_at: r.created_at,
    service: r.service ? { name: r.service.name, category: r.service.category } : null,
    account: r.account ? { display_name: r.account.display_name } : null,
    advocate: r.advocate ? { id: r.advocate.id, user: r.advocate.user ? { full_name: r.advocate.user.full_name } : null } : null,
  }));
}

export async function assignOrder(orderId: string, input: AssignServiceOrderInput): Promise<ServiceOrderRowDto> {
  const advocate = await repo.getVerifiedAdvocate(input.advocateId);
  if (!advocate) throw new HttpError(404, "Verified advocate not found.");
  const order = await repo.assignOrder(orderId, advocate.id);
  if (!order) throw new HttpError(404, "Order not found.");
  return toOrderRowDto(order);
}
