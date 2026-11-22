import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How TECHNO WORLD WCRM collects, uses and protects data.",
};

const UPDATED = "23 November 2026";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="meta">Last updated: {UPDATED}</p>

      <p>
        This policy explains how TECHNO WORLD (&ldquo;we&rdquo;, &ldquo;us&rdquo;), a business registered in Kolkata,
        India, handles information in <strong>WCRM</strong>, our WhatsApp customer relationship management service
        (the &ldquo;Service&rdquo;), available at this website and through the Meta app &ldquo;TECHNO WORLD WCRM&rdquo;.
      </p>

      <h2>1. Who this applies to</h2>
      <ul>
        <li>
          <strong>Our clients</strong>: businesses that sign up for WCRM, and the team members they invite.
        </li>
        <li>
          <strong>Their customers</strong>: people who message a client&apos;s WhatsApp Business number. For this
          data the client business is the data controller and we process it on their behalf, only to provide the
          Service.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong>: name, email address, business name, phone number and login
          details of client users.
        </li>
        <li>
          <strong>WhatsApp Business data</strong>, received from Meta&apos;s WhatsApp Business Platform after a
          client connects their number: WhatsApp Business Account and phone number IDs, access tokens, message
          templates, and the messages, media and delivery statuses exchanged with the client&apos;s customers.
          When a client connects a number that also uses the WhatsApp Business app, contacts and up to six
          months of one-to-one chat history may be synchronised, as permitted by Meta.
        </li>
        <li>
          <strong>Contact records</strong> that clients create or import: names, phone numbers, tags, notes and
          custom fields.
        </li>
        <li>
          <strong>Usage and technical data</strong>: log records, device and browser information needed to keep
          the Service secure, and push-notification subscriptions if a user turns notifications on.
        </li>
      </ul>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide the Service: show conversations in a shared inbox, send and receive WhatsApp messages,
          run broadcasts, automations, chatbot flows and AI-assisted replies that the client configures.</li>
        <li>To manage client accounts, plans, billing records and support.</li>
        <li>To keep the Service secure, prevent abuse and meet legal obligations.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell personal data, use client or customer messages for advertising, or use
        them to train AI models. Data received through Meta&apos;s platforms is used only as permitted by
        Meta&apos;s Platform Terms and Developer Policies.
      </p>

      <h2>4. AI features</h2>
      <p>
        If a client turns on AI replies or drafts, the relevant conversation text and the client&apos;s knowledge
        base are sent to the AI provider the client has configured (for example OpenAI or Anthropic) to generate
        a reply. Those providers process the data under their own API terms and do not use it to train their
        models by default.
      </p>

      <h2>5. Sharing and service providers</h2>
      <p>We share data only with providers that help us run the Service, under contracts that protect it:</p>
      <ul>
        <li>Meta Platforms (WhatsApp Business Platform), to send and receive messages;</li>
        <li>Supabase (database and file storage) and Vercel (hosting);</li>
        <li>the AI provider a client chooses, when AI features are on;</li>
        <li>authorities, when required by law.</li>
      </ul>

      <h2>6. Storage, security and retention</h2>
      <p>
        Data is stored with our hosting providers, which may be outside India. Access tokens are encrypted, access
        is limited to authorised users of each client account, and connections use HTTPS. We keep data while the
        client&apos;s account is active. If an account is paused, data is kept so the client can resume. When a
        client asks us to delete their account, we delete their data within 30 days, except where the law
        requires us to keep it.
      </p>

      <h2>7. Your choices and rights</h2>
      <p>
        Client users can update their profile in the app and ask us for a copy or deletion of their data. If you
        messaged a business that uses WCRM, please contact that business first, as it controls your data; you can
        also write to us and we will pass your request on and help. See{" "}
        <a href="/data-deletion">Data deletion</a> for how to request deletion.
      </p>

      <h2>8. Children</h2>
      <p>The Service is for businesses and is not directed to children under 18.</p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy. We will change the date above and, for important changes, tell clients in the
        app or by email.
      </p>

      <h2>10. Contact</h2>
      <p>
        TECHNO WORLD, 125b S. N. Banerjee Road, Kolkata 700013, West Bengal, India.
        <br />
        Email: <a href="mailto:support@technoworld1988.com">support@technoworld1988.com</a> · WhatsApp: +91 76030
        66711
      </p>
    </>
  );
}
