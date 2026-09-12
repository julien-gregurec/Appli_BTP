import { Lien as Link } from "@/components/Lien";
import { dernieresActionsAction } from "@/app/actions/recherche";
import { libelleAction } from "@/lib/historique";

/** Bloc « Dernières actions » (GP V1) : les derniers objets touchés par l'utilisateur, un clic pour rouvrir. */
export async function DernieresActions({ limite = 8 }: { limite?: number }) {
  const actions = await dernieresActionsAction(limite);
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby="dernieres-actions" className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 id="dernieres-actions" className="font-semibold">Dernières actions</h2>
      <ul className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
        {actions.map((a) => (
          <li key={`${a.ressource}:${a.id}`}>
            <Link href={a.url} className="flex min-h-11 items-center justify-between gap-3 text-sm hover:underline">
              <span className="truncate">{a.titre}</span>
              <span className="shrink-0 text-xs text-neutral-500">{libelleAction(a.action)} · {new Date(a.creeLe).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
