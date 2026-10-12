import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";
import { env } from "@/server/env";

/**
 * Thin proxy for the contract-review negotiation note's DOCX export -- generated on-the-fly
 * on every request, so the bytes are streamed through here rather than redirected to a signed
 * storage URL, same precedent as the research PDF export and drafts download BFF routes.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const upstream = await fetch(`${env.API_INTERNAL_URL}/api/contract-reviews/${reviewId}/export`, {
    headers: { Authorization: `Bearer ${token}`, "X-Request-Id": crypto.randomUUID() },
  });

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => ({ error: "Export failed" }));
    return NextResponse.json(body, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? 'attachment; filename="contract-review-note.docx"',
    },
  });
}
