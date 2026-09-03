import type { MetadataRoute } from "next";

const BASE_URL = "https://www.execlingo.it";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/inglese-lavoro`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/scarica`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/offerte`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/aziende`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/partner`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/cookie`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/termini`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/elimina-account`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
