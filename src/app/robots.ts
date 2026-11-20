import type { MetadataRoute } from "next";

// A demo with a private workspace per visitor has nothing for a crawler, and
// each crawl would create a workspace.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
