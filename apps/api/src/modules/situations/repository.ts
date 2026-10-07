import { getSupabase } from "../../config/db.js";

export interface RawSituationRow {
  id: string;
  label_en: string;
  label_hi: string;
  mapped_practice_area_id: string;
  urgency_default: string;
  routing_note: string | null;
  version: number;
  mapped_practice_area: unknown;
}

export async function listSituations(): Promise<RawSituationRow[]> {
  const { data, error } = await getSupabase().from("situations").select("*, mapped_practice_area:practice_areas(*)").order("label_en");
  if (error) throw error;
  return data as unknown as RawSituationRow[];
}

export async function findSituationById(id: string): Promise<RawSituationRow | null> {
  const { data, error } = await getSupabase().from("situations").select("*, mapped_practice_area:practice_areas(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as RawSituationRow | null;
}
