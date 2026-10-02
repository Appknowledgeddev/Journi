import { JourniLoader } from "@/components/journi-loader";
import { Suspense } from "react";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <Suspense fallback={<JourniLoader fullscreen />}>
      <DashboardClient />
    </Suspense>
  );
}
