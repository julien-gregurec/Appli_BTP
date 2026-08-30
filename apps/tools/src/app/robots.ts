import type { MetadataRoute } from "next";
import { getPublicUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${getPublicUrl()}/sitemap.xml` };
}
