import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";
import { env } from "@/server/env";

/**
 * Thin proxy for a draft's DOCX/PDF download -- a BFF route per docs/MASTER-PROMPT.md's
 * target_structure ("file upload/download are proxied through Next Route Handlers without
 * buffering whole bodies"). The document is rendered on-the-fly from the database on every
 * request -- there is no storage object to redirect to (see documentsActions.ts for that case),
 * so the bytes must be streamed through here, same precedent as the research PDF export route.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const upstream = await fetch(`${env.API_INTERNAL_URL}/api/drafts/${draftId}/download?format=${format}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Request-Id": crypto.randomUUID() },
  });

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => ({ error: "Download failed" }));
    return NextResponse.json(body, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? `attachment; filename="draft.${format}"`,
    },
  });
}
