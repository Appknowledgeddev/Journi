import { SectionPage } from "@/components/section-page";

const details = [
  {
    title: "Starter",
    description:
      "A clean starting point for early teams that need polished checkout, a hosted customer experience, and room to iterate.",
  },
  {
    title: "Growth",
    description:
      "More controls for revenue operations, subscription management, and multi-team collaboration as volume increases.",
  },
  {
    title: "Enterprise",
    description:
      "Custom agreements, architecture support, and operational controls for companies with complex scale or compliance needs.",
  },
];

export default function PricingPage() {
  return (
    <SectionPage
      eyebrow="Pricing"
      title="Pricing that scales from early traction to serious transaction volume."
      intro="This page sets up the structure for plan cards and product packaging. We can make it interactive later with billing toggles, feature comparisons, or real subscription flows."
      details={details}
      ctaTitle="Keep building from here."
      ctaText="If you want the tutorial path, the next strong move is connecting Supabase and replacing placeholder sections with live product data."
      ctaHref="/developers"
      ctaLabel="Build with Supabase"
    />
  );
}
