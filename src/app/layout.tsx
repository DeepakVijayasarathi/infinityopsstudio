import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: ["AI marketing", "marketing operations", "AI content generation", "marketing automation", "campaign management", "AI marketing workers"],
  openGraph: { type: "website", siteName: siteConfig.name, title: `${siteConfig.name} — ${siteConfig.tagline}`, description: siteConfig.description, url: siteConfig.url, images: [{ url: "/og", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: siteConfig.name, description: siteConfig.description, images: ["/og"] },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e14" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
