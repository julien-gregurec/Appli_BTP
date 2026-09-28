import Link from "next/link";
import { legalSlugs, legalTitles } from "../lib/legal";
export default function LegalLinks() {
  return (
    <nav aria-label="Informations légales" className="legal-links">
      {legalSlugs.map((slug) => (
        <Link key={slug} href={`/legal/${slug}`}>
          {legalTitles[slug]}
        </Link>
      ))}
    </nav>
  );
}
