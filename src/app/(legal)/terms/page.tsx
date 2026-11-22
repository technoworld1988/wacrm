import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using TECHNO WORLD WCRM.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="meta">Last updated: 23 November 2026</p>

      <p>
        These terms apply to businesses using <strong>WCRM</strong>, the WhatsApp CRM service provided by TECHNO
        WORLD, Kolkata, India. By using the Service you agree to them.
      </p>

      <h2>1. The Service</h2>
      <p>
        WCRM connects your WhatsApp Business number to a shared inbox with contacts, pipelines, broadcasts,
        automations, chatbot flows and optional AI replies. It uses Meta&apos;s WhatsApp Business Platform; Meta&apos;s
        availability, rules and pricing apply in addition to these terms.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Accounts are created by TECHNO WORLD. Keep your login details safe and tell us about any misuse.</li>
        <li>You are responsible for your team members and what they do in your account.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Message only people who have agreed to hear from your business, and respect opt-outs.</li>
        <li>Follow the WhatsApp Business Messaging Policy, WhatsApp Commerce Policy and applicable law.</li>
        <li>Do not send spam, unlawful, misleading or harmful content, or try to break or overload the Service.</li>
      </ul>
      <p>We may pause an account that breaks these rules or puts the Service or a WhatsApp number at risk.</p>

      <h2>4. Plans, fees and Meta charges</h2>
      <p>
        Your plan, its limits and price are agreed with TECHNO WORLD. Fees are payable in advance and are exclusive
        of GST. Meta charges for some WhatsApp messages separately; these are billed by Meta to the payment method
        on your WhatsApp Business Account. If a plan ends without renewal, the account is paused and your data is
        kept until you renew or ask us to delete it.
      </p>

      <h2>5. Your data</h2>
      <p>
        You own your contacts and messages. We process them only to provide the Service, as described in our{" "}
        <a href="/privacy">Privacy Policy</a>. You are responsible for having a lawful basis to message your
        customers and to store their data.
      </p>

      <h2>6. AI features</h2>
      <p>
        AI replies are generated automatically and can be wrong. Review your bot&apos;s settings and knowledge base,
        and do not rely on AI replies for legal, medical or financial advice to your customers.
      </p>

      <h2>7. Availability and liability</h2>
      <p>
        We work to keep the Service available but do not guarantee it will be uninterrupted, as it depends on third
        parties such as Meta and our hosting providers. To the extent the law allows, our total liability for any
        claim is limited to the fees you paid us in the three months before the claim, and we are not liable for
        indirect losses such as lost profits.
      </p>

      <h2>8. Ending the Service</h2>
      <p>
        You can stop using the Service at any time. You can ask for an export of your contacts before your account
        is closed. We may end the Service with reasonable notice.
      </p>

      <h2>9. Governing law</h2>
      <p>These terms are governed by the laws of India, and courts in Kolkata have jurisdiction.</p>

      <h2>10. Contact</h2>
      <p>
        <a href="mailto:support@technoworld1988.com">support@technoworld1988.com</a> · WhatsApp +91 76030 66711
      </p>
    </>
  );
}
