import Link from "next/link";

const LIENS = [
  { href: "/mentions-legales", libelle: "Mentions légales" },
  { href: "/cgv", libelle: "CGV" },
  { href: "/cgu", libelle: "CGU" },
  { href: "/confidentialite", libelle: "Confidentialité" },
  { href: "/cookies", libelle: "Cookies" },
];

export function PiedLegal() {
  return (
    <footer className="mt-10 border-t border-neutral-200 pt-6 text-center dark:border-neutral-800">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        {LIENS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-[#0d1b2a] hover:underline dark:hover:text-white">{l.libelle}</Link>
        ))}
      </nav>
      <p className="mt-3 text-xs text-neutral-400">© {new Date().getFullYear()} Liria Gestion Pro</p>
    </footer>
  );
}
