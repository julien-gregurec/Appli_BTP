import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorWorkspace } from "@/components/CalculatorWorkspace";
import { activeTools, getToolBySlug } from "@/lib/catalog";
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return activeTools.map((tool) => ({ id: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const tool = getToolBySlug((await params).id);
  if (!tool) return {};
  return pageMetadata({ title: tool.seo.title, description: tool.seo.description, path: `/outils/${tool.slug}` });
}

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const tool = getToolBySlug((await params).id);
  if (!tool) notFound();
  const breadcrumb = breadcrumbJsonLd([{ name: "Accueil", path: "/" }, { name: tool.name, path: `/outils/${tool.slug}` }]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      <CalculatorWorkspace tool={tool} />
    </>
  );
}
