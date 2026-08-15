import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SplashScreen } from "@/components/SplashScreen";
import { SourceCapture } from "@/components/SourceCapture";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || "https://execlingo.it"),
  title: "ExecLingo",
  description: "Your adaptive AI English coach.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ExecLingo" },
  icons: {
    apple: "/apple-touch-icon.png",
  },
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
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <SourceCapture />
        <SplashScreen />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
