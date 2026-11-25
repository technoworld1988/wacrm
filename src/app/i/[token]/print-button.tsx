"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-[#1B1655]/20 bg-white px-4 py-2 text-sm font-semibold text-[#1B1655] hover:border-[#1B1655]/50"
    >
      {label}
    </button>
  );
}
