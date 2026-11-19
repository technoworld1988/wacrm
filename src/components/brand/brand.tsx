"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** TECHNO WORLD default mark, served from /public. */
export const DEFAULT_LOGO = "/brand/technoworld-logo.webp";
export const DEFAULT_BRAND_NAME = "TECHNO WORLD";
/** Where "Contact us" buttons point when an account is paused. */
export const SUPPORT_WHATSAPP = "https://wa.me/917603066711";

export interface BrandInfo {
  whiteLabel: boolean;
  name: string | null;
  logoUrl: string | null;
  primary: string | null;
  accent: string | null;
}

/**
 * The logo on a small white card — the TECHNO WORLD mark has a white
 * background, so the card keeps it clean on the navy aurora panels.
 * White-label clients without a logo get their brand name as text.
 */
export function BrandLogo({
  brand,
  className,
  size = "md",
}: {
  brand?: BrandInfo | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const wl = brand?.whiteLabel ?? false;
  const src = wl ? brand?.logoUrl : DEFAULT_LOGO;
  const name = (wl ? brand?.name : null) || DEFAULT_BRAND_NAME;
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-16" : "h-11";

  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-lg bg-white px-3 font-semibold tracking-tight text-[#1B1655]",
          size === "lg" ? "py-3 text-xl" : "py-1.5 text-sm",
          className,
        )}
      >
        {name}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex rounded-lg bg-white p-1", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote white-label logos come from Supabase storage */}
      <img src={src} alt={name} className={cn("w-auto rounded-md object-contain", h)} />
    </span>
  );
}

/** Small "Powered by" credit, hidden for white-label clients. */
export function PoweredBy({ brand, label }: { brand?: BrandInfo | null; label: string }) {
  if (brand?.whiteLabel) return null;
  return (
    <a
      href="https://www.technoworld1988.com"
      target="_blank"
      rel="noreferrer"
      className="block px-3 pt-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {label}
    </a>
  );
}

/**
 * Applies a white-label client's colours by overriding the accent
 * tokens on <html>. Removes them again on unmount / when branding is
 * switched off, so the operator's own session never inherits a
 * client's colours.
 */
export function BrandColors({ brand }: { brand?: BrandInfo | null }) {
  const primary = brand?.whiteLabel ? brand.primary : null;
  const accent = brand?.whiteLabel ? brand.accent : null;
  useEffect(() => {
    const el = document.documentElement;
    const props: Array<[string, string | null]> = [
      ["--primary", primary],
      ["--ring", primary],
      ["--chart-1", primary],
      ["--sidebar-primary", primary],
      ["--primary-hover", primary],
      ["--primary-soft", primary ? `${primary}1F` : null],
      ["--primary-soft-2", primary ? `${primary}33` : null],
      ["--chart-2", accent],
    ];
    for (const [k, v] of props) {
      if (v) el.style.setProperty(k, v);
      else el.style.removeProperty(k);
    }
    return () => {
      for (const [k] of props) el.style.removeProperty(k);
    };
  }, [primary, accent]);
  return null;
}
