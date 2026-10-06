// Message threads are 1:1 per matter. Participants are always *user* ids (an advocate
// participates as their user), so a single check — "is my user id a participant?" — gates
// every read and write.
import { getSupabase } from "../config/db.js";

export async function openMatterThread(matter, { advocateUserId, accountId, requesterId }) {
  const supabase = getSupabase();
  const { data: existing, error: existingError } = await supabase.from("message_threads").select("id").eq("matter_id", matter.id).maybeSingle();
  if (existingError) throw existingError;
  let thread = existing;
  if (!thread) {
    ({ data: thread } = await supabase.from("message_threads").insert({ matter_id: matter.id }).select("id").single());
  }

  const { data: members, error: membersError } = await supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId)
    .in("role", ["owner", "admin"])
    .not("accepted_at", "is", null);
  if (membersError) throw membersError;

  const participantIds = new Set([advocateUserId, requesterId, ...members.map((m) => m.user_id)].filter(Boolean));
  const rows = [...participantIds].map((participant_id) => ({ thread_id: thread.id, participant_id }));
  const { error } = await supabase.from("thread_participants").upsert(rows, { onConflict: "thread_id,participant_id", ignoreDuplicates: true });
  if (error) throw error;
  return thread;
}
