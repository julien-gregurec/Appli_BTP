import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { statutAvenant, numeroAvenant, variationLabel } from "@/lib/avenants";
import { StatutAvenantSelect } from "@/components/StatutAvenantSelect";
import { permissionsUtilisateur } from "@/lib/permissions";
import { supprimerAvenantAction } from "@/app/actions/avenants";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export default async function AvenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererDevis = permissions === null || permissions.includes("gerer_devis");

  const { data: avenant } = await supabase
    .from("avenants")
    .select(
      "id, ordre, statut, montant_ht, montant_tva, montant_ttc, notes_client, notes_internes, date_creation, date_envoi, date_acceptation, date_refus, chantier:chantiers(id, nom), devis:devis!avenants_devis_origine_id_fkey(id, numero, montant_ht)",
    )
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!avenant) notFound();

  const chantier = Array.isArray(avenant.chantier) ? avenant.chantier[0] : avenant.chantier;
  const devis = Array.isArray(avenant.devis) ? avenant.devis[0] : avenant.devis;

  const { data: lignes } = await supabase
    .from("lignes_avenants")
    .select("id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre")
    .eq("avenant_id", id)
    .order("ordre");

  const { data: avenantsAcceptes } = devis
    ? await supabase.from("avenants").select("montant_ht").eq("devis_origine_id", devis.id).eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte")
    : { data: [] };
  const montantContractuel = (devis ? Number(devis.montant_ht) : 0) + (avenantsAcceptes ?? []).reduce((s, a) => s + Number(a.montant_ht), 0);

  const st = statutAvenant(avenant.statut);
  const peutSupprimer = peutGererDevis && avenant.statut === "brouillon";

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {chantier && <Link href={`/chantiers/${chantier.id}`} className="text-sm text-neutral-500 hover:underline">← {chantier.nom}</Link>}
            <h1 className="mt-1 text-xl font-semibold">{numeroAvenant(devis?.numero ?? null, avenant.ordre)}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Avenant au devis {devis ? <Link href={`/devis/${devis.id}`} className="hover:underline">{devis.numero}</Link> : "—"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {avenant.statut === "brouillon" && peutGererDevis && (
              <Link href={`/avenants/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Modifier</Link>
            )}
            <a href={`/imprimer/avenants/${id}`} target="_blank" rel="noopener" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Télécharger PDF</a>
            {peutGererDevis ? <StatutAvenantSelect avenantId={id} statut={avenant.statut} /> : (
              <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${st.couleur}22`, color: st.couleur }}>{st.libelle}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs text-neutral-500">Variation HT</div>
            <div className={`mt-1 font-mono font-semibold ${avenant.montant_ht < 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{variationLabel(avenant.montant_ht)}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs text-neutral-500">Montant du devis initial</div>
            <div className="mt-1 font-mono font-semibold">{euros(devis?.montant_ht ?? 0)}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs text-neutral-500">Montant contractuel courant</div>
            <div className="mt-1 font-mono font-semibold">{euros(montantContractuel)}</div>
            {avenant.statut !== "accepte" && <p className="mt-1 text-[11px] text-neutral-500">Cet avenant n’est pas encore accepté, il n’est pas inclus.</p>}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                <th className="p-2">Désignation</th>
                <th className="p-2">Qté</th>
                <th className="p-2">Unité</th>
                <th className="p-2">PU HT</th>
                <th className="p-2">TVA</th>
              </tr>
            </thead>
            <tbody>
              {(lignes ?? []).map((l) => (
                <tr key={l.id} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className="p-2">{l.designation}</td>
                  <td className="p-2 font-mono">{l.quantite}</td>
                  <td className="p-2">{l.unite}</td>
                  <td className="p-2 font-mono">{euros(l.prix_unitaire_ht)}</td>
                  <td className="p-2 font-mono">{l.taux_tva}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {avenant.notes_client && <p className="text-sm text-neutral-600 dark:text-neutral-400">Notes client : {avenant.notes_client}</p>}

        {avenant.date_acceptation && (
          <p className="text-xs text-neutral-500">Accepté le {new Date(avenant.date_acceptation).toLocaleDateString("fr-FR")}.</p>
        )}

        {peutSupprimer && chantier && (
          <form action={supprimerAvenantAction.bind(null, id, chantier.id)}>
            <ConfirmSubmitButton message="Supprimer définitivement cet avenant brouillon ?" className="text-sm text-red-600 hover:underline">Supprimer</ConfirmSubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}
