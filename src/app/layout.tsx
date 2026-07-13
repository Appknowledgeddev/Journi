import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { BuildMarker } from "@/components/build-marker";
import { JourniYbugProvider } from "@/components/ybug-provider";

export const dynamic = "force-dynamic";

const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html lang="en" className={`${manrope.variable} ${geistMono.variable}`}>
      <body>
        <JourniYbugProvider>
          <BuildMarker />
          {children}
        </JourniYbugProvider>
      </body>
    </html>
  );
}
