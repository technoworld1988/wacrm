"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgePercent, LayoutDashboard, LogOut, Menu, MessageSquare, Package, UserPlus, X } from "lucide-react";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand/brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clients/new", label: "Add client", icon: UserPlus },
  { href: "/admin/plans", label: "Plans", icon: Package },
  { href: "/admin/discounts", label: "Discounts", icon: BadgePercent },
];

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { signOut, profile } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
        <Link href="/admin" onClick={onNavigate}>
          <BrandLogo />
        </Link>
        <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F0CF86]">
          Platform admin
        </p>
      </div>
      <nav className="flex-1 px-3" aria-label="Admin">
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-white/15 text-white" : "text-[#DCE0F6] hover:bg-white/10 hover:text-white",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex flex-col gap-2 p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg border border-[#F0CF86]/45 px-3 py-2.5 text-sm font-medium text-[#F0CF86] hover:bg-white/10"
        >
          <MessageSquare className="h-4 w-4" />
          Open my own CRM
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#DCE0F6] hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">Sign out {profile?.email ? `(${profile.email})` : ""}</span>
        </button>
      </div>
    </div>
  );
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, profileLoading, isPlatformAdmin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    else if (!loading && !profileLoading && user && !isPlatformAdmin) router.replace("/dashboard");
  }, [loading, profileLoading, user, isPlatformAdmin, router]);

  if (loading || profileLoading || !user || !isPlatformAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="brand-aurora-bg hidden w-64 shrink-0 lg:block">
        <Nav />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-[#1B1655]/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "brand-aurora-bg fixed inset-y-0 left-0 z-50 w-72 transition-transform lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Admin menu"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        <Nav onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="brand-aurora-bg flex h-16 shrink-0 items-center justify-between px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/25 text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/admin">
            <BrandLogo size="sm" />
          </Link>
          <Link
            href="/admin/clients/new"
            aria-label="Add client"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E0A93A] text-[#1B1655]"
          >
            <UserPlus className="h-5 w-5" />
          </Link>
        </header>
        <div className="brand-bar shrink-0" />
        <main className="brand-blush flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AuthProvider>
  );
}
