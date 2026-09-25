import { SectionPage } from "@/components/section-page";

const details = [
  {
    title: "Fast API primitives",
    description:
      "Work with predictable endpoints, typed payloads, and practical response structures that fit cleanly into Next.js apps.",
  },
  {
    title: "Event-driven architecture",
    description:
      "Listen to webhook events, trigger background workflows, and keep your product logic in sync with billing activity.",
  },
  {
    title: "Operational tooling",
    description:
      "Give support and finance teams dashboards that help them answer customer questions without pulling engineering into every issue.",
  },
];

export default function DevelopersPage() {
  return (
    <SectionPage
      eyebrow="Developers"
      title="A developer surface that stays clear even as the system underneath gets more complex."
      intro="This is the best place to connect the frontend to real data. We can replace this placeholder content with live Supabase reads, auth, and dashboard components."
      details={details}
      ctaTitle="Open the local admin surface."
      ctaText="Use the backoffice to inspect users, trips, notifications, testing logs, and operational data while developing."
      ctaHref="/backoffice"
      ctaLabel="Open backoffice"
    />
  );
}
