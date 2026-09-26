import { toolsJson, toolsOptions, toolsStripeCatalog } from "@/lib/tools-monetization";

export const OPTIONS = toolsOptions;

export async function GET(request: Request) {
  try { return toolsJson(request, { products: await toolsStripeCatalog() }); }
  catch { return toolsJson(request, { products: [], error: "Catalogue indisponible" }, 503); }
}
