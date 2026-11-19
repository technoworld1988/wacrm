"use client";

import { useTranslations } from "next-intl";
import { Lock, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BrandLogo, SUPPORT_WHATSAPP, type BrandInfo } from "@/components/brand/brand";
import type { AccessState } from "@/lib/platform/plans";

/**
 * Full-screen notice for a client whose account is paused, expired or
 * still waiting for activation. Their data is kept; only the app is
 * closed until the platform admin renews or activates it.
 */
export function AccountGate({
  state,
  brand,
}: {
  state: Exclude<AccessState, "ok">;
  brand: BrandInfo | null;
}) {
  const t = useTranslations("AccountGate");
  const { signOut } = useAuth();
  const title =
    state === "pending" ? t("pendingTitle") : state === "expired" ? t("expiredTitle") : t("pausedTitle");
  const desc = state === "pending" ? t("pendingDesc") : t("pausedDesc");

  return (
    <div className="brand-aurora-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center text-[#1B1655] shadow-xl sm:p-8">
        <div className="mb-5 flex justify-center">
          <BrandLogo brand={brand} size="lg" />
        </div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FBF1DC]">
          <Lock className="h-5 w-5 text-[#7A5208]" />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-[#55577F]">{desc}</p>
        <div className="mt-6 flex flex-col gap-2">
          {!brand?.whiteLabel && (
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#3E6FD6] px-4 text-sm font-semibold text-white hover:bg-[#2C69A7]"
            >
              <MessageCircle className="h-4 w-4" />
              {t("contact")}
            </a>
          )}
          <Button
            variant="outline"
            onClick={signOut}
            className="h-11 border-[rgba(27,22,85,0.18)] bg-white text-[#1B1655] hover:bg-[#EEF0FA]"
          >
            {t("signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
