import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { normalizeDomain } from "@/lib/platform/plans";

export const dynamic = "force-dynamic";

/**
 * GET /api/branding — public, used by the login page before anyone is
 * signed in. When the request arrives on a white-label client's own web
 * address, returns that client's name / logo / colours; otherwise null
 * (the page falls back to TECHNO WORLD). Exposes only what the login
 * screen shows anyway.
 */
export async function GET(request: Request) {
  const host = normalizeDomain(request.headers.get("host")?.split(":")[0] ?? "");
  if (!host) return NextResponse.json({ brand: null });
  const { data } = await supabaseAdmin()
    .from("accounts")
    .select("brand_name, brand_logo_url, brand_primary, brand_accent")
    .eq("brand_domain", host)
    .eq("white_label", true)
    .maybeSingle();
  if (!data) return NextResponse.json({ brand: null });
  return NextResponse.json(
    {
      brand: {
        name: data.brand_name,
        logoUrl: data.brand_logo_url,
        primary: data.brand_primary,
        accent: data.brand_accent,
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
