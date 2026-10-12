"use server";

import { revalidatePath } from "next/cache";
import { apiClient, ApiError } from "./apiClient";
import type {
  ResearchQueryListItemDto,
  ResearchReportDto,
  ResearchRetrieveResultDto,
  ResearchChatTurnDto,
  ResearchQueryRowDto,
  CorpusDocumentListItemDto,
  CorpusDocumentDetailDto,
  CorpusChunkBriefDto,
  CorpusChunkDetailDto,
  CorpusStatusDto,
} from "@vidhira/contracts";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function getCorpusStatusAction(): Promise<CorpusStatusDto> {
  return apiClient.get<CorpusStatusDto>("/corpus/status");
}

export async function listResearchQueriesAction(params: { q?: string; tag?: string; pinned?: boolean } = {}): Promise<ResearchQueryListItemDto[]> {
  return apiClient.get<ResearchQueryListItemDto[]>("/research/queries", { q: params.q, tag: params.tag, pinned: params.pinned });
}

export async function runResearchAction(text: string, sourcesEnabled: string[]): Promise<ActionResult<{ queryId: string }>> {
  return wrap(async () => {
    const { retrievalId } = await apiClient.post<ResearchRetrieveResultDto>("/research/retrieve", { text, sourcesEnabled });
    await apiClient.post<ResearchReportDto>("/research/answer", { retrievalId });
    return { queryId: retrievalId };
  });
}

export async function getResearchReportAction(queryId: string): Promise<ResearchReportDto> {
  return apiClient.get<ResearchReportDto>(`/research/queries/${queryId}/report`);
}

export async function pinResearchQueryAction(queryId: string, pinned: boolean): Promise<ActionResult<ResearchQueryRowDto>> {
  return wrap(async () => {
    const result = await apiClient.patch<ResearchQueryRowDto>(`/research/queries/${queryId}`, { pinned });
    revalidatePath("/research");
    return result;
  });
}

export async function deleteResearchQueryAction(queryId: string): Promise<ActionResult<{ deleted: true }>> {
  return wrap(async () => {
    const result = await apiClient.delete<{ deleted: true }>(`/research/queries/${queryId}`);
    revalidatePath("/research");
    return result;
  });
}

export async function refreshResearchQueryAction(queryId: string): Promise<ActionResult<{ searchId: string }>> {
  return wrap(() => apiClient.post<{ searchId: string }>(`/research/queries/${queryId}/refresh`));
}

export async function getResearchChatAction(queryId: string): Promise<ResearchChatTurnDto[]> {
  return apiClient.get<ResearchChatTurnDto[]>(`/research/queries/${queryId}/chat`);
}

export async function askResearchFollowUpAction(queryId: string, question: string): Promise<ActionResult<ResearchChatTurnDto>> {
  return wrap(() => apiClient.post<ResearchChatTurnDto>(`/research/queries/${queryId}/ask`, { question }));
}

export async function listCorpusDocumentsAction(): Promise<CorpusDocumentListItemDto[]> {
  return apiClient.get<CorpusDocumentListItemDto[]>("/corpus/documents");
}

export async function getCorpusDocumentAction(id: string): Promise<CorpusDocumentDetailDto> {
  return apiClient.get<CorpusDocumentDetailDto>(`/corpus/documents/${id}`);
}

export async function getCorpusDocumentChunksAction(id: string): Promise<CorpusChunkBriefDto[]> {
  return apiClient.get<CorpusChunkBriefDto[]>(`/corpus/documents/${id}/chunks`);
}

export async function getCorpusChunkAction(id: string): Promise<CorpusChunkDetailDto> {
  return apiClient.get<CorpusChunkDetailDto>(`/corpus/chunks/${id}`);
}
