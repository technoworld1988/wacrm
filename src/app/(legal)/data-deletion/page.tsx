import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data deletion",
  description: "How to ask TECHNO WORLD WCRM to delete your data.",
};

export default function DataDeletionPage() {
  return (
    <>
      <h1>Data deletion instructions</h1>
      <p className="meta">Last updated: 23 November 2026</p>

      <h2>If you are a WCRM client (a business using the CRM)</h2>
      <ol>
        <li>
          Email <a href="mailto:support@technoworld1988.com">support@technoworld1988.com</a> from your account&apos;s
          email address, or message us on WhatsApp at +91 76030 66711, with the subject
          &ldquo;Delete my WCRM data&rdquo; and your business name.
        </li>
        <li>We confirm the request with the account owner.</li>
        <li>
          We delete your account, team logins, contacts, conversations, messages, media, templates and settings
          within <strong>30 days</strong>, and confirm by email. Records we must keep by law (for example invoices)
          are kept only as long as required.
        </li>
      </ol>
      <p>
        To stop the CRM receiving your WhatsApp messages straight away, you can also disconnect your number in
        WhatsApp Manager or Meta Business Settings.
      </p>

      <h2>If you messaged a business that uses WCRM</h2>
      <p>
        That business controls your data. Please ask the business to delete it. You can also write to us at{" "}
        <a href="mailto:support@technoworld1988.com">support@technoworld1988.com</a> with the business name and your
        phone number, and we will forward your request and help the business complete it.
      </p>

      <h2>Data received from Facebook / Meta login</h2>
      <p>
        If you connected WhatsApp to WCRM using Facebook, you can remove the &ldquo;TECHNO WORLD WCRM&rdquo; app at
        any time in Facebook Settings → Business Integrations. Then email us as above and we will delete the data
        we received through it.
      </p>
    </>
  );
}
