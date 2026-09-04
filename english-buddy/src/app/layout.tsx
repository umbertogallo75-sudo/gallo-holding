import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SplashScreen } from "@/components/SplashScreen";
import { SourceCapture } from "@/components/SourceCapture";
import { PageView } from "@/components/PageView";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SignupConversion } from "@/components/SignupConversion";
import { configuredAppStoreUrl, configuredPlayStoreUrl } from "@/lib/store-links";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "https://www.execlingo.it"),
  title: "ExecLingo",
  description: "Il coach di inglese con IA che si adatta al tuo lavoro.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ExecLingo" },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

const storeUrls = [configuredAppStoreUrl(), configuredPlayStoreUrl()]
  .filter((url): url is string => Boolean(url));

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.execlingo.it/#organization",
      name: "VASP ITALIA SRL",
      legalName: "VASP ITALIA SRL",
      url: "https://www.execlingo.it/",
      logo: "https://www.execlingo.it/icons/icon-512.png",
      vatID: "IT03463400634",
      email: "ug@vaspitalia.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Via M. Schipa 22",
        postalCode: "80122",
        addressLocality: "Napoli",
        addressCountry: "IT",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://www.execlingo.it/#website",
      url: "https://www.execlingo.it/",
      name: "ExecLingo",
      inLanguage: "it-IT",
      publisher: { "@id": "https://www.execlingo.it/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.execlingo.it/#app",
      name: "ExecLingo",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, iOS, Android",
      url: "https://www.execlingo.it/",
      ...(storeUrls.length ? { downloadUrl: storeUrls, sameAs: storeUrls } : {}),
      description: "Coach di inglese con intelligenza artificiale per il lavoro e i viaggi.",
      inLanguage: "it-IT",
      author: { "@id": "https://www.execlingo.it/#organization" },
      offers: [
        { "@type": "Offer", name: "ExecLingo Annuale", price: "199.00", priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://www.execlingo.it/offerte" },
        { "@type": "Offer", name: "ExecLingo Programma 3 mesi", price: "99.90", priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://www.execlingo.it/offerte" },
        { "@type": "Offer", name: "ExecLingo Mensile", price: "39.90", priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://www.execlingo.it/offerte" },
        { "@type": "Offer", name: "ExecLingo Mantenimento", price: "29.90", priceCurrency: "EUR", availability: "https://schema.org/InStock", url: "https://www.execlingo.it/offerte" },
      ],
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101210" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script below stamps data-theme on this
    // element before React ever sees the page, which is the whole point.
    <html lang="it" suppressHydrationWarning>
      <head>
        {/* Before the first paint, or the page flashes the wrong colours. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ServiceWorkerRegister />
        <SourceCapture />
        <PageView />
        <SignupConversion />
        <SplashScreen />
        <OfflineBanner />
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
