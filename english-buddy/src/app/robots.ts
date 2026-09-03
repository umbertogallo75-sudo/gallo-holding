import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/home",
          "/onboarding",
          "/buddy",
          "/progress",
          "/profile",
          "/rescue",
          "/voice",
          "/phrasebook",
          "/riunione",
          "/prepara",
          "/piano",
          "/allenamenti",
          "/abbonamento",
          "/partner/dashboard",
        ],
      },
    ],
    sitemap: "https://www.execlingo.it/sitemap.xml",
    host: "https://www.execlingo.it",
  };
}
