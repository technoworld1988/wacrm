import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { clientBucket } from "@/lib/platform/plans";
import { loadPlans } from "@/lib/platform/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/overview — dashboard data for the platform admin:
 * counters, every client account with its owner, and recent activity.
 */
export async function GET() {
  try {
    const { db, userId } = await requirePlatformAdmin();

    const [accountsRes, profilesRes, waRes, activityRes, plans] = await Promise.all([
      db
        .from("accounts")
        .select(
          "id, name, status, plan, plan_ends_at, business_phone, white_label, brand_name, created_at",
        )
        .order("created_at", { ascending: false }),
      db.from("profiles").select("account_id, user_id, full_name, email, account_role"),
      db.from("whatsapp_config").select("account_id, status"),
      db
        .from("platform_admin_activity")
        .select("id, account_id, action, details, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      loadPlans(db),
    ]);
    const planNames = new Map(plans.map((p) => [p.key, p.name]));
    for (const r of [accountsRes, profilesRes, waRes, activityRes]) {
      if (r.error) throw r.error;
    }

    const profiles = profilesRes.data ?? [];
    const waByAccount = new Map(
      (waRes.data ?? []).map((w) => [w.account_id as string, w.status as string | null]),
    );
    const myAccountId =
      profiles.find((p) => p.user_id === userId)?.account_id ?? null;
    const now = new Date();

    const clients = (accountsRes.data ?? [])
      .map((a) => {
        const members = profiles.filter((p) => p.account_id === a.id);
        const owner = members.find((p) => p.account_role === "owner") ?? members[0];
        return {
          id: a.id as string,
          name: a.name as string,
          status: a.status as string,
          plan: (a.plan as string | null) ?? null,
          planName: a.plan ? (planNames.get(a.plan as string) ?? a.plan) : null,
          planEndsAt: (a.plan_ends_at as string | null) ?? null,
          businessPhone: (a.business_phone as string | null) ?? null,
          whiteLabel: Boolean(a.white_label),
          brandName: (a.brand_name as string | null) ?? null,
          createdAt: a.created_at as string,
          ownerName: owner?.full_name ?? null,
          ownerEmail: owner?.email ?? null,
          memberCount: members.length,
          whatsappConnected: waByAccount.get(a.id as string) === "connected",
          isMine: a.id === myAccountId,
          bucket: clientBucket({ status: a.status, plan_ends_at: a.plan_ends_at }, now),
        };
      })
      // Accounts with no members are leftovers from invited teammates
      // whose personal bootstrap account was abandoned — not clients.
      .filter((c) => c.memberCount > 0);

    const counts = {
      total: clients.length,
      active: clients.filter((c) => c.bucket === "active").length,
      trial: clients.filter((c) => c.bucket === "trial").length,
      expiring: clients.filter((c) => c.bucket === "expiring").length,
      paused: clients.filter((c) => c.bucket === "paused").length,
      pending: clients.filter((c) => c.bucket === "pending").length,
    };

    const names = new Map(clients.map((c) => [c.id, c.name]));
    const activity = (activityRes.data ?? []).map((a) => ({
      id: a.id as string,
      accountId: (a.account_id as string | null) ?? null,
      accountName: a.account_id ? (names.get(a.account_id as string) ?? null) : null,
      action: a.action as string,
      details: (a.details as Record<string, unknown>) ?? {},
      createdAt: a.created_at as string,
    }));

    return NextResponse.json({ counts, clients, activity, myAccountId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
