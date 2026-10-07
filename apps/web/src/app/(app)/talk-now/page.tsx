import type { Metadata } from "next";
import { apiClient } from "@/server/apiClient";
import type { SituationDto } from "@vidhira/contracts";
import { TalkNowClient } from "./TalkNowClient";

export const metadata: Metadata = {
  title: "Talk now — Vidhira",
  robots: { index: false, follow: false },
};

export default async function TalkNowPage() {
  const situations = await apiClient.get<SituationDto[]>("/situations");
  return <TalkNowClient situations={situations} />;
}
