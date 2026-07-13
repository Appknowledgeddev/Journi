import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="en">
      <head>
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
          {children}
        </JourniYbugProvider>
      </body>
    </html>
  );
}
