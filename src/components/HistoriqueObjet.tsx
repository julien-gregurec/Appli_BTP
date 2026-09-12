import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { resumeEntree } from "@/lib/historique";

/** Historique d'un objet (GP V1) : lu sous la RLS (module de l'objet, coûts réservés à voir_couts_devis). */
export async function HistoriqueObjet({ ressource, id, limite = 30 }: { ressource: string; id: string; limite?: number }) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("historique_objets")
    .select("id, action, champ, avant, apres, sensible, cree_le, utilisateur_id")
    .eq("entreprise_id", ctx.entrepriseId).eq("ressource", ressource).eq("ressource_id", id)
    .order("cree_le", { ascending: false }).order("id", { ascending: false }).limit(limite);
  const lignes = (data ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set(lignes.map((l) => l.utilisateur_id).filter((v): v is string => typeof v === "string"))];
  const { data: auteurs } = ids.length ? await supabase.from("utilisateurs").select("id, prenom, nom").in("id", ids) : { data: [] };
  const nom = new Map(((auteurs ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), [u.prenom, u.nom].filter(Boolean).join(" ") || "Utilisateur"]));
  return (
    <section id="historique" aria-labelledby="historique-titre" className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 id="historique-titre" className="font-semibold">Historique</h2>
      {lignes.length === 0 ? <p className="mt-1 text-sm text-neutral-500">Aucun évènement enregistré.</p> : (
        <ol className="mt-2 space-y-1 text-sm">
          {lignes.map((e) => (
            <li key={String(e.id)} className="flex flex-wrap gap-x-3">
              <time dateTime={String(e.cree_le)} className="w-32 shrink-0 tabular-nums text-neutral-500">{new Date(String(e.cree_le)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</time>
              <span className="flex-1">{resumeEntree({ action: String(e.action), champ: (e.champ as string | null) ?? null, avant: e.avant, apres: e.apres })}</span>
              <span className="text-neutral-500">{typeof e.utilisateur_id === "string" ? nom.get(e.utilisateur_id) ?? "Utilisateur" : "Système"}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
