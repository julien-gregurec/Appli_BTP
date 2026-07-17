import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";

/**
 * Prévient l'entreprise cliente qu'un ou plusieurs de ses comptes dépassent
 * deux appareils, ce qui entraîne une facturation supplémentaire.
 *
 * La règle est fixée côté plateforme (migration 20260716000085) : dès qu'un
 * compte utilise plus de deux appareils actifs, il est facturé UN poste
 * supplémentaire au tarif mensuel de son poste — forfaitairement, quel que
 * soit le nombre d'appareils au-delà de deux. On reproduit ici EXACTEMENT ce
 * calcul (même filtre `revoque_at is null`, même forfait) pour afficher le
 * montant que le client verra sur sa facture, sans surprise.
 *
 * Composant de lecture seule : aucune écriture, aucune migration. Réservé aux
 * comptes qui gèrent les employés ou les accès (la RLS l'impose déjà).
 */
export async function AlerteDepassementAppareils() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutVoir = permissions === null
    || permissions.includes("gerer_employes")
    || permissions.includes("gerer_utilisateurs");
  if (!peutVoir) return null;

  const supabase = await createClient();

  // Appareils actifs, comme la facturation : on ignore les appareils révoqués.
  const { data: appareils } = await supabase
    .from("appareils_comptes")
    .select("utilisateur_id")
    .eq("entreprise_id", ctx.entrepriseId)
    .is("revoque_at", null);
  if (!appareils?.length) return null;

  const parCompte = new Map<string, number>();
  for (const a of appareils) parCompte.set(a.utilisateur_id, (parCompte.get(a.utilisateur_id) ?? 0) + 1);

  const comptesEnDepassement = [...parCompte.entries()].filter(([, n]) => n > 2);
  if (!comptesEnDepassement.length) return null;

  // Nom et tarif du poste de chaque compte concerné.
  const idsConcernes = comptesEnDepassement.map(([id]) => id);
  const { data: employes } = await supabase
    .from("employes")
    .select("utilisateur_id, prenom, nom, poste_id")
    .eq("entreprise_id", ctx.entrepriseId)
    .in("utilisateur_id", idsConcernes);
  const posteIds = [...new Set((employes ?? []).map((e) => e.poste_id).filter(Boolean))] as string[];
  const { data: postes } = posteIds.length
    ? await supabase.from("postes").select("id, nom, tarif_compte_mensuel").in("id", posteIds)
    : { data: [] };
  const tarifParPoste = new Map((postes ?? []).map((p) => [p.id, { nom: p.nom, tarif: Number(p.tarif_compte_mensuel) }]));
  const employeParCompte = new Map((employes ?? []).map((e) => [e.utilisateur_id, e]));

  const lignes = comptesEnDepassement.map(([utilisateurId, nbAppareils]) => {
    const employe = employeParCompte.get(utilisateurId);
    const poste = employe?.poste_id ? tarifParPoste.get(employe.poste_id) : undefined;
    return {
      nom: employe ? `${employe.prenom} ${employe.nom}`.trim() : "Compte",
      posteNom: poste?.nom ?? "—",
      nbAppareils,
      // Forfait : un poste supplémentaire au tarif du poste, comme la facture.
      supplement: poste?.tarif ?? 0,
    };
  });
  const total = lignes.reduce((s, l) => s + l.supplement, 0);
  const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-none text-amber-700 dark:text-amber-400" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">
            Facturation d&apos;appareils supplémentaires
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/90">
            {comptesEnDepassement.length === 1 ? "Un compte utilise" : `${comptesEnDepassement.length} comptes utilisent`}{" "}
            plus de deux appareils. Chaque compte au-delà de deux appareils est facturé comme un poste
            supplémentaire, au tarif mensuel de son poste — soit <strong>{euros(total)} HT / mois</strong> au total.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {lignes.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white/60 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/20">
                <span><strong>{l.nom}</strong> · {l.posteNom} · {l.nbAppareils} appareils</span>
                <span className="font-mono">{l.supplement > 0 ? `+ ${euros(l.supplement)} / mois` : "poste non tarifé"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300/80">
            Pour éviter ce supplément, retirez les appareils inutilisés d&apos;un compte depuis sa fiche
            (deux appareils actifs restent inclus).
          </p>
        </div>
      </div>
    </section>
  );
}
