import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorWorkspace } from "@/components/CalculatorWorkspace";
import { activeTools, getToolBySlug } from "@/lib/catalog";

export function generateStaticParams() {
  return activeTools.map((tool) => ({ id: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const tool = getToolBySlug((await params).id);
  if (!tool) return {};
  return { title: tool.seo.title, description: tool.seo.description };
}

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const tool = getToolBySlug((await params).id);
  if (!tool) notFound();
  return <CalculatorWorkspace tool={tool} />;
}
