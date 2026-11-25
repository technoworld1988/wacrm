import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { amountInWords, inr, lineAmount, stateName, taxByRate, upiLink, type InvoiceItem } from "@/lib/invoices/calc";
import { PrintButton } from "./print-button";

// Public, printable estimate / invoice — the link sent on WhatsApp.
// Found only by its long random token; shows a UPI QR for the balance.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("*").eq("public_token", token).maybeSingle();
  if (!inv || inv.status === "draft") notFound();
  const [{ data: s }, { data: account }] = await Promise.all([
    db.from("invoice_settings").select("*").eq("account_id", inv.account_id).maybeSingle(),
    db.from("accounts").select("name, brand_name, brand_logo_url, white_label").eq("id", inv.account_id).maybeSingle(),
  ]);

  const items = (inv.items ?? []) as InvoiceItem[];
  const isInvoice = inv.kind === "invoice";
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid));
  const seller = (s?.business_name as string | null) || (account?.white_label ? (account?.brand_name as string | null) : null) || (account?.name as string) || "";
  const intra = Number(inv.igst) === 0;
  const pay = isInvoice && s?.upi_id && balance > 0 && inv.status !== "cancelled"
    ? upiLink(s.upi_id as string, seller, balance, inv.number as string)
    : null;
  const qrSvg = pay ? await QRCode.toString(pay, { type: "svg", margin: 1, width: 120 }) : null;
  const statusLabel: Record<string, string> = {
    paid: "PAID", partially_paid: "PART PAID", cancelled: "CANCELLED", accepted: "ACCEPTED", declined: "DECLINED",
  };

  return (
    <div className="min-h-screen bg-[#F1F2FA] px-3 py-6 text-[#1B1655] print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl justify-end gap-2 print:hidden">
        <PrintButton label="Print / Save as PDF" />
      </div>
      <article className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-sm sm:p-8 print:rounded-none print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1B1655]/10 pb-4">
          <div className="min-w-0">
            {account?.white_label && account?.brand_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- client's uploaded logo
              <img src={account.brand_logo_url as string} alt="" className="mb-2 h-10 w-auto" />
            ) : null}
            <p className="text-lg font-bold">{seller}</p>
            {s?.address && <p className="whitespace-pre-line text-sm text-[#55577F]">{s.address as string}</p>}
            {s?.gstin && <p className="text-sm">GSTIN: <span className="font-mono">{s.gstin as string}</span></p>}
            {(s?.phone || s?.email) && <p className="text-sm text-[#55577F]">{[s?.phone, s?.email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">{isInvoice ? (s?.gstin ? "TAX INVOICE" : "INVOICE") : "ESTIMATE"}</p>
            <p className="font-mono text-sm">{inv.number}</p>
            <p className="mt-1 text-sm text-[#55577F]">Date: {fmtDate(inv.issue_date as string)}</p>
            {inv.due_date && <p className="text-sm text-[#55577F]">{isInvoice ? "Due" : "Valid till"}: {fmtDate(inv.due_date as string)}</p>}
            {statusLabel[inv.status as string] && (
              <p className="mt-2 inline-block rounded-full border-2 border-current px-3 py-0.5 text-xs font-bold text-[#2C69A7]">
                {statusLabel[inv.status as string]}
              </p>
            )}
          </div>
        </header>

        <section className="grid gap-4 border-b border-[#1B1655]/10 py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#55577F]">Bill to</p>
            <p className="font-semibold">{inv.customer_name}</p>
            {inv.customer_address && <p className="whitespace-pre-line text-sm text-[#55577F]">{inv.customer_address}</p>}
            {inv.customer_gstin && <p className="text-sm">GSTIN: <span className="font-mono">{inv.customer_gstin}</span></p>}
            {inv.customer_phone && <p className="text-sm text-[#55577F]">{inv.customer_phone}</p>}
          </div>
          {inv.place_of_supply && (
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#55577F]">Place of supply</p>
              <p className="text-sm">{stateName(inv.place_of_supply)} ({inv.place_of_supply})</p>
            </div>
          )}
        </section>

        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[#1B1655]/10 text-left text-xs uppercase tracking-wider text-[#55577F]">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">HSN/SAC</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">GST</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-[#1B1655]/5">
                  <td className="px-2 py-2 text-[#55577F]">{i + 1}</td>
                  <td className="px-2 py-2">{it.description}</td>
                  <td className="px-2 py-2 font-mono text-xs">{it.hsn ?? ""}</td>
                  <td className="px-2 py-2 text-right">{it.qty}</td>
                  <td className="px-2 py-2 text-right">{inr(it.rate)}</td>
                  <td className="px-2 py-2 text-right">{it.gst_rate}%</td>
                  <td className="px-2 py-2 text-right">{inr(lineAmount(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="grid gap-6 py-4 sm:grid-cols-[1fr_16rem]">
          <div className="text-xs text-[#55577F]">
            <table className="text-xs">
              <tbody>
                {taxByRate(items, Number(inv.discount)).filter((r) => r.rate > 0).map((r) => (
                  <tr key={r.rate}>
                    <td className="pr-3">GST {r.rate}% on {inr(r.taxable)}</td>
                    <td>{intra ? `CGST ${inr(r.tax / 2)} + SGST ${inr(r.tax / 2)}` : `IGST ${inr(r.tax)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 font-medium text-[#1B1655]">{amountInWords(Number(inv.total))}</p>
          </div>
          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={inr(Number(inv.subtotal))} />
            {Number(inv.discount) > 0 && <Row label="Discount" value={`− ${inr(Number(inv.discount))}`} />}
            {intra ? (
              <>
                <Row label="CGST" value={inr(Number(inv.cgst))} />
                <Row label="SGST" value={inr(Number(inv.sgst))} />
              </>
            ) : (
              <Row label="IGST" value={inr(Number(inv.igst))} />
            )}
            <div className="flex justify-between border-t border-[#1B1655]/15 pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd>{inr(Number(inv.total))}</dd>
            </div>
            {isInvoice && Number(inv.amount_paid) > 0 && (
              <>
                <Row label="Paid" value={`− ${inr(Number(inv.amount_paid))}`} />
                <div className="flex justify-between font-semibold">
                  <dt>Balance due</dt>
                  <dd>{inr(balance)}</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {(pay || s?.bank_details) && (
          <section className="flex flex-wrap items-center gap-5 rounded-xl bg-[#F1F2FA] p-4 print:bg-white">
            {qrSvg && (
              <a href={pay!} className="block w-32 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="Pay by UPI" />
            )}
            <div className="text-sm">
              {pay && (
                <>
                  <p className="font-semibold">Pay {inr(balance)} by UPI</p>
                  <p className="text-[#55577F]">Scan with any UPI app, or pay to <span className="font-mono">{s!.upi_id as string}</span></p>
                  <a href={pay} className="mt-2 inline-block rounded-lg bg-[#3E6FD6] px-4 py-2 font-semibold text-white print:hidden">Pay now</a>
                </>
              )}
              {s?.bank_details && <p className="mt-2 whitespace-pre-line text-xs text-[#55577F]">{s.bank_details as string}</p>}
            </div>
          </section>
        )}

        {(inv.notes || inv.terms) && (
          <section className="mt-4 space-y-2 text-xs text-[#55577F]">
            {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
            {inv.terms && (
              <div>
                <p className="font-semibold uppercase tracking-wider">Terms</p>
                <p className="whitespace-pre-line">{inv.terms}</p>
              </div>
            )}
          </section>
        )}
        <p className="mt-6 text-center text-[11px] text-[#55577F]">This is a computer-generated document.</p>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[#55577F]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
