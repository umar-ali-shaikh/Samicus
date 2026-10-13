"use server";

import { apiClient } from "./apiClient";
import type { FounderAnalyticsResponseDto, FounderTab } from "@vidhira/contracts";

export async function getAnalyticsTabAction(tab: FounderTab): Promise<FounderAnalyticsResponseDto> {
  return apiClient.get<FounderAnalyticsResponseDto>(`/admin/analytics/${tab}`);
}
