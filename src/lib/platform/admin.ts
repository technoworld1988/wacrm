// ============================================================
// Server-side guard + helpers for the platform admin panel.
//
// Admin routes act across every client account, so they run on the
// service-role client after proving the caller is listed in
// `platform_admins`. The membership check itself also goes through
// the service role: a user can only ever read their own row via RLS,
// but going through the admin client keeps the answer independent of
// policy drift.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/account";

export interface PlatformAdminContext {
  userId: string;
  email: string | null;
  /** Service-role client. Bypasses RLS — scope every query yourself. */
  db: SupabaseClient;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();

  const db = supabaseAdmin();
  const { data, error: adminErr } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminErr) {
    console.error("[requirePlatformAdmin] lookup failed:", adminErr.message);
    throw new ForbiddenError();
  }
  if (!data) throw new ForbiddenError("Only the platform admin can do this.");
  return { userId: user.id, email: user.email ?? null, db };
}

export async function logAdminActivity(
  db: SupabaseClient,
  entry: {
    actorUserId: string | null;
    accountId: string | null;
    action: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("platform_admin_activity").insert({
    actor_user_id: entry.actorUserId,
    account_id: entry.accountId,
    action: entry.action,
    details: entry.details ?? {},
  });
  if (error) console.error("[logAdminActivity] insert failed:", error.message);
}

/** Public base URL used to build sign-in links handed to clients. */
export function appBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

/**
 * Turns the hashed token from `auth.admin.generateLink` into a link on
 * our own /auth/callback, which verifies it server-side and lands the
 * user on the set-password page. Avoids depending on Supabase's email
 * sending (the free tier only mails project members) and on its
 * redirect allow-list.
 */
export function signInLink(
  base: string,
  hashedToken: string,
  type: "invite" | "recovery",
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: "/reset-password?welcome=1",
  });
  return `${base}/auth/callback?${params.toString()}`;
}

/** 12-char temporary password without look-alike characters. */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
