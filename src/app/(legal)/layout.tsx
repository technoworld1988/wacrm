import Link from "next/link";

// Public legal pages (privacy, terms, data deletion). Linked from the
// Meta app settings for App Review, so they must load without sign-in
// and must not depend on the client-side auth provider.

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/data-deletion", label: "Data deletion" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F1F2FA] text-[#1B1655]">
      <header className="brand-aurora-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="inline-flex rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/technoworld-logo.webp" alt="TECHNO WORLD" className="h-10 w-auto rounded-md" />
          </Link>
          <span className="text-sm font-semibold text-[#F0CF86]">WCRM</span>
        </div>
      </header>
      <div className="brand-bar" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <article className="legal rounded-2xl border border-[rgba(27,22,85,0.12)] bg-white p-5 shadow-sm sm:p-8">
          {children}
        </article>
        <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legal">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[#2C69A7] hover:text-[#1B1655]">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-xs text-[#55577F]">
          TECHNO WORLD · 125b S. N. Banerjee Road, Kolkata 700013, West Bengal, India ·{" "}
          <a href="mailto:support@technoworld1988.com" className="underline">
            support@technoworld1988.com
          </a>
        </p>
      </main>
    </div>
  );
}
