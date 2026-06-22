import { redirect } from "next/navigation";

export default async function FinaliseTripRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParams = new URLSearchParams();
  nextParams.set("step", "finalise");

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "step") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        nextParams.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      nextParams.set(key, value);
    }
  }

  redirect(`/trip-organiser?${nextParams.toString()}`);
}
