import type { MetadataRoute } from "next";
import { siteUrl } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing under /api is useful to a crawler, and the beacon endpoint should not be hit by one.
        disallow: "/api/",
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
