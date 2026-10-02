import { Suspense } from "react";
import { BillingModeIndicator } from "@/components/billing-mode-indicator";
import { getBillingEnvironment } from "@/lib/stripe/environment";
import type { Metadata } from "next";
import "react-loading-skeleton/dist/skeleton.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { ThemeControl } from "@/components/theme-control";
import { BuildMarker } from "@/components/build-marker";
import { JourniYbugProvider } from "@/components/ybug-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journi Group Planning Hub",
  description:
    "Private group trip planning with shared options, voting, organiser dashboards, and trip-level monetisation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t='system';try{t=localStorage.getItem('journi-theme')||'system'}catch(e){}document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <JourniYbugProvider>
          <BuildMarker />
          <ThemeControl />
          {children}
          <Suspense><BillingModeIndicator {...getBillingEnvironment()} /></Suspense>
        </JourniYbugProvider>
      </body>
    </html>
  );
}
