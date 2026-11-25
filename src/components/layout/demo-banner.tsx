"use client";

// Strip shown above every page while someone is exploring the public
// demo account: says it's sample data and offers the way to buy.

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SUPPORT_WHATSAPP } from "@/components/brand/brand";

export function DemoBanner() {
  const t = useTranslations("DashboardShell");
  const { signOut } = useAuth();
  const href = `${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t("demoWhatsappText"))}`;
  return (
    <div className="brand-aurora-bg flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-2 text-center text-xs text-white sm:text-sm">
      <Sparkles className="hidden h-4 w-4 shrink-0 text-[#F0CF86] sm:block" />
      <span>{t("demoBanner")}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-[#F0CF86] px-3 py-0.5 font-semibold text-[#1B1655] hover:bg-white"
      >
        {t("demoGet")}
      </a>
      <button type="button" onClick={() => signOut()} className="underline underline-offset-2 opacity-80 hover:opacity-100">
        {t("demoExit")}
      </button>
    </div>
  );
}
