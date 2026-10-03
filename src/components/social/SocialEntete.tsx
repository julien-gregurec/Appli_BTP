import Link from "next/link";
import { modeSimulation } from "@/lib/social/config";
import { libelleRole, peut, type RoleSocial } from "@/lib/social/roles";

const ONGLETS: Array<{ href: string; libelle: string; droit?: Parameters<typeof peut>[1] }> = [
  { href: "/plateforme/social", libelle: "Publications" },
  { href: "/plateforme/social/publication", libelle: "Nouvelle publication", droit: "rediger" },
  { href: "/plateforme/social/calendrier", libelle: "Calendrier" },
  { href: "/plateforme/social/statistiques", libelle: "Statistiques" },
  { href: "/plateforme/social/commentaires", libelle: "Commentaires" },
  { href: "/plateforme/social/messages", libelle: "Messages" },
  { href: "/plateforme/social/assistant", libelle: "Assistant Social", droit: "rediger" },
  { href: "/plateforme/social/comptes", libelle: "Comptes" },
  { href: "/plateforme/social/equipe", libelle: "Équipe" },
  { href: "/plateforme/social/journal", libelle: "Journal", droit: "voir_journal" },
];

export function SocialEntete({ titre, role, actif, description }: { titre: string; role: RoleSocial; actif: string; description?: string }) {
  const simulation = modeSimulation();
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#c9a24a]">Communication › ELSATIA Social</p>
          <h1 className="text-xl font-semibold">{titre}</h1>
          {description && <p className="text-sm text-neutral-500">{description}</p>}
        </div>
        <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">Rôle : {libelleRole(role)}</span>
      </div>
      {simulation ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Mode simulation (dry-run) actif.</strong> Aucune publication, réponse ni message n’est envoyé aux réseaux. Les lectures (statistiques, commentaires) restent réelles.
        </p>
      ) : (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
          <strong>Publication réelle activée.</strong> Les envois validés partent sur les comptes officiels ELSATIA.
        </p>
      )}
      <nav aria-label="ELSATIA Social" className="flex gap-1 overflow-x-auto border-b border-neutral-200 pb-px dark:border-neutral-800">
        {ONGLETS.filter((o) => !o.droit || peut(role, o.droit)).map((o) => (
          <Link
            key={o.href}
            href={o.href}
            aria-current={actif === o.href ? "page" : undefined}
            className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm ${actif === o.href ? "border-b-2 border-[#c9a24a] font-semibold" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"}`}
          >
            {o.libelle}
          </Link>
        ))}
      </nav>
    </header>
  );
}
