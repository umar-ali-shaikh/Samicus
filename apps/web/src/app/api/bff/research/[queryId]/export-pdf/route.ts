import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";
import { env } from "@/server/env";

/**
 * Thin proxy for the research report's PDF export -- a BFF route per
 * docs/MASTER-PROMPT.md's target_structure ("file upload/download are proxied through Next
 * Route Handlers without buffering whole bodies"). Unlike document downloads (a signed storage
 * URL the browser can fetch directly, see documentsActions.ts), this PDF is generated
 * on-the-fly from the database on every request -- there is no storage object to redirect to,
 * so the bytes must be streamed through here.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const upstream = await fetch(`${env.API_INTERNAL_URL}/api/research/queries/${queryId}/export.pdf`, {
    headers: { Authorization: `Bearer ${token}`, "X-Request-Id": crypto.randomUUID() },
  });

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => ({ error: "Export failed" }));
    return NextResponse.json(body, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/pdf",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? `attachment; filename="research-${queryId}.pdf"`,
    },
  });
}
