import { SectionPage } from "@/components/section-page";

const details = [
  {
    title: "Payments",
    description:
      "Accept cards, wallets, bank transfers, and region-specific payment methods in a single streamlined flow.",
  },
  {
    title: "Billing",
    description:
      "Manage subscriptions, one-off invoices, metered usage, and customer plans from a unified recurring revenue layer.",
  },
  {
    title: "Payouts",
    description:
      "Move funds to sellers, creators, and vendors with programmable controls and clear operational visibility.",
  },
];

export default function ProductsPage() {
  return (
    <SectionPage
      eyebrow="Products"
      title="Modular financial products built to work together from the start."
      intro="Choose a single capability or compose the full platform. Each product is designed for teams that want a clean developer experience and room to grow."
      details={details}
      ctaTitle="Build the core journey first."
      ctaText="We can turn one of these products into a real Next.js and Supabase feature next."
      ctaHref="/developers"
      ctaLabel="See developer page"
    />
  );
}
