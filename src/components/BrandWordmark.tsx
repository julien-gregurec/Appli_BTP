import { BRAND_NAME } from "@/lib/brand";

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center font-semibold uppercase tracking-[0.18em] ${className}`.trim()}>
      {BRAND_NAME}
    </span>
  );
}
