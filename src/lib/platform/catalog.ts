// Server-side reads of the operator's plan + discount catalogue
// (migration 063). Service-role client only — both tables are closed
// to client roles.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DISCOUNT_COLUMNS,
  PLAN_COLUMNS,
  rowToDiscount,
  rowToPlan,
  type PlatformDiscount,
  type PlatformPlan,
} from "./plans";

export async function loadPlans(db: SupabaseClient): Promise<PlatformPlan[]> {
  const { data, error } = await db
    .from("platform_plans")
    .select(PLAN_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToPlan(r as Record<string, unknown>));
}

export async function loadPlan(db: SupabaseClient, key: string): Promise<PlatformPlan | null> {
  if (typeof key !== "string" || !key) return null;
  const { data, error } = await db.from("platform_plans").select(PLAN_COLUMNS).eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? rowToPlan(data as Record<string, unknown>) : null;
}

export async function loadDiscounts(db: SupabaseClient): Promise<PlatformDiscount[]> {
  const { data, error } = await db
    .from("platform_discounts")
    .select(DISCOUNT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDiscount(r as Record<string, unknown>));
}

export async function loadDiscount(db: SupabaseClient, id: string): Promise<PlatformDiscount | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db.from("platform_discounts").select(DISCOUNT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToDiscount(data as Record<string, unknown>) : null;
}
