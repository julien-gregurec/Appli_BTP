import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PAGES = [
  { href: "/mentions-legales", libelle: "Mentions légales" },
  { href: "/cgv", libelle: "CGV" },
  { href: "/cgu", libelle: "CGU" },
  { href: "/confidentialite", libelle: "Confidentialité" },
  { href: "/cookies", libelle: "Cookies" },
];

// Rendu stylé sans plugin typography : on mappe chaque élément markdown.
const composants = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="mt-2 text-2xl font-bold text-[#0d1b2a] dark:text-white" {...p} />,
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="mt-8 text-lg font-semibold text-[#0d1b2a] dark:text-white" {...p} />,
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="mt-6 text-base font-semibold text-[#0d1b2a] dark:text-white" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300" {...p} />,
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...p} />,
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-[#0d1b2a] underline dark:text-white" {...p} />,
  strong: (p: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-[#0d1b2a] dark:text-white" {...p} />,
  hr: () => <hr className="my-6 border-neutral-200 dark:border-neutral-800" />,
  table: (p: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="mt-4 overflow-x-auto"><table className="w-full border-collapse text-sm" {...p} /></div>
  ),
  th: (p: React.HTMLAttributes<HTMLTableCellElement>) => <th className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-semibold dark:border-neutral-800 dark:bg-neutral-900" {...p} />,
  td: (p: React.HTMLAttributes<HTMLTableCellElement>) => <td className="border border-neutral-200 px-3 py-2 align-top dark:border-neutral-800" {...p} />,
  em: (p: React.HTMLAttributes<HTMLElement>) => <em className="text-neutral-500" {...p} />,
};

export function DocumentLegal({ fichier }: { fichier: string }) {
  const chemin = path.join(process.cwd(), "docs/juridique", fichier);
  let contenu = fs.readFileSync(chemin, "utf8");
  // Champ contact laissé vide pour le moment (à renseigner à l'immatriculation).
  contenu = contenu.replace(/\[contact@liria[^\]]*\]/g, "—");

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-6 sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
        <Markdown remarkPlugins={[remarkGfm]} components={composants}>{contenu}</Markdown>
      </article>
      <nav className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="hover:text-[#0d1b2a] hover:underline dark:hover:text-white">{p.libelle}</Link>
        ))}
      </nav>
    </main>
  );
}
