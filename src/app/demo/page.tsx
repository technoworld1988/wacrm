import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEMO_VISITOR_EMAIL } from "@/lib/demo/provision";
import { SUPPORT_WHATSAPP } from "@/components/brand/brand";

// Public landing for the live demo — the page ads link to. One button
// signs the visitor into a read-only sample account (see
// /api/demo/start); nothing they do can reach a real customer.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WCRM live demo",
  description: "Try WCRM, the WhatsApp CRM by TECHNO WORLD, with sample data. No sign-up needed.",
};

const TRY = [
  ["Inbox", "Every WhatsApp chat in one place, shared with your team, with notes and tags."],
  ["Follow-ups", "Today’s list of who to call, and automatic follow-up messages that stop when the customer replies."],
  ["Pipelines", "Every enquiry as a deal card: New → Site visit → Quote → Won."],
  ["Broadcasts", "Send an offer to hundreds of customers and see who read and replied."],
  ["Automations & AI", "Instant replies to new enquiries, after-hours messages and AI answers."],
];

const ERRORS: Record<string, string> = {
  busy: "Too many tries from this network. Please wait a few minutes and try again.",
  failed: "The demo couldn’t open just now. Please try again in a minute.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isVisitor = user?.email === DEMO_VISITOR_EMAIL;
  const signedInElsewhere = Boolean(user) && !isVisitor;
  const whatsapp = `${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Hi, I want to know more about WCRM and the Founding offer.")}`;

  return (
    <div className="min-h-screen bg-[#F1F2FA] text-[#1B1655]">
      <header className="brand-aurora-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <span className="inline-flex rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/technoworld-logo.webp" alt="TECHNO WORLD" className="h-10 w-auto rounded-md" />
          </span>
          <span className="text-sm font-semibold text-[#F0CF86]">WCRM</span>
        </div>
      </header>
      <div className="brand-bar" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Try WCRM — the WhatsApp CRM for your business</h1>
        <p className="mt-3 max-w-2xl text-base text-[#55577F]">
          Open a live demo of <strong>Sharma Interiors</strong>, a sample business with real-looking chats, leads and
          follow-ups. No sign-up, and nothing is sent to anyone.
        </p>

        {error && ERRORS[error] && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{ERRORS[error]}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isVisitor ? (
            <Link
              href="/dashboard"
              className="rounded-xl bg-[#3E6FD6] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#2C69A7]"
            >
              Continue the demo
            </Link>
          ) : (
            <form action="/api/demo/start" method="post">
              <button
                type="submit"
                className="rounded-xl bg-[#3E6FD6] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[#2C69A7]"
              >
                Open live demo
              </button>
            </form>
          )}
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[#1B1655]/15 bg-white px-6 py-3 text-base font-semibold hover:border-[#1B1655]/40"
          >
            Talk to us on WhatsApp
          </a>
        </div>
        {signedInElsewhere && (
          <p className="mt-3 text-sm text-[#55577F]">
            You’re signed in as {user?.email}. Opening the demo signs you out of that account in this browser — use a
            private window to keep both.
          </p>
        )}

        <h2 className="mt-10 text-lg font-semibold">What to try</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {TRY.map(([title, text]) => (
            <li key={title} className="rounded-2xl border border-[#1B1655]/10 bg-white p-4 shadow-sm">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-[#55577F]">{text}</p>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-[#55577F]">
          WCRM by TECHNO WORLD, Kolkata · Official WhatsApp Business Platform ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>
        </p>
      </main>
    </div>
  );
}
