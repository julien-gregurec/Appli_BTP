import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros, LIGNE_TYPES } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";
import { StatutDevisSelect } from "@/components/StatutDevisSelect";
import { dupliquerDevisAction, supprimerDevisAction } from "@/app/actions/devis";
import { creerFactureDepuisDevisAction } from "@/app/actions/factures";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { contenuEmailDocument } from "@/lib/email";
import { EmailDocumentButton } from "@/components/EmailDocumentButton";

export default async function DevisDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error: erreurAction } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase
    .from("devis")
    .select("*, client:clients(id, nom, prenom, societe, email), chantier:chantiers(id, nom)")
    .eq("id", id)
    .single();

  if (!devis) notFound();

  const { data: lignes } = await supabase
    .from("lignes_devis")
    .select("*")
    .eq("devis_id", id)
    .order("ordre");

  const client = Array.isArray(devis.client) ? devis.client[0] : devis.client;
  const chantier = Array.isArray(devis.chantier) ? devis.chantier[0] : devis.chantier;
  const typeLabel = (t: string) => LIGNE_TYPES.find((x) => x.cle === t)?.libelle ?? t;
  const supprimer = supprimerDevisAction.bind(null, id);
  const creerFacture = creerFactureDepuisDevisAction.bind(null, id, "simple");
  const dupliquer = dupliquerDevisAction.bind(null, id);
  const peutSupprimer = ["brouillon", "refuse", "annule"].includes(devis.statut);
  const email = contenuEmailDocument({
    typeDoc: "devis",
    numero: devis.numero,
    client,
    montantTtc: Number(devis.montant_ttc),
    entrepriseNom: ctx.entrepriseNom,
    prenomEmetteur: ctx.prenom,
  });

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {erreurAction && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreurAction}</p>}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/devis" className="text-sm text-neutral-500 hover:underline">← Devis</Link>
            <h1 className="mt-1 text-xl font-semibold">{devis.numero ?? "Devis (brouillon)"}</h1>
            <p className="text-sm text-neutral-500">
              {client ? nomClient(client) : "—"}
              {chantier && <> · chantier <Link href={`/chantiers/${chantier.id}`} className="hover:underline">{chantier.nom}</Link></>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <form action={dupliquer}>
              <ConfirmSubmitButton message="Créer une copie complète de ce devis ?" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
                Dupliquer
              </ConfirmSubmitButton>
            </form>
            {devis.statut === "brouillon" && (
              <Link href={`/devis/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
                Modifier
              </Link>
            )}
            <a
              href={`/imprimer/devis/${id}`}
              target="_blank"
              rel="noopener"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Télécharger PDF
            </a>
            {email ? (
              <EmailDocumentButton type="devis" id={id} statut={devis.statut} to={email.to} sujet={email.sujet} corps={email.corps} pdfUrl={`/imprimer/devis/${id}`} />
            ) : (
              <span className="cursor-default rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 dark:border-neutral-800" title="Aucun email renseigné pour ce client">
                Envoyer par email
              </span>
            )}
            <StatutDevisSelect devisId={id} statut={devis.statut} />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Désignation</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Qté</th>
                <th className="px-3 py-2 text-right font-medium">PU HT</th>
                <th className="px-3 py-2 text-right font-medium">TVA</th>
                <th className="px-3 py-2 text-right font-medium">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {(lignes ?? []).map((l) => {
                const ht = l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100);
                return (
                  <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-3 py-2">
                      {l.designation}
                      {l.description && <div className="text-xs text-neutral-500">{l.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{typeLabel(l.type)}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.quantite} {l.unite}</td>
                    <td className="px-3 py-2 text-right font-mono">{euros(l.prix_unitaire_ht)}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.taux_tva} %</td>
                    <td className="px-3 py-2 text-right font-mono">{euros(ht)}</td>
                  </tr>
                );
              })}
              {(!lignes || lignes.length === 0) && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-neutral-500">Aucune ligne.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            {devis.remise_globale > 0 && (
              <div className="flex justify-between text-neutral-500">
                <span>Remise globale</span><span className="font-mono">{devis.remise_globale} %</span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-neutral-500">Total HT</span><span className="font-mono">{euros(devis.montant_ht)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">TVA</span><span className="font-mono">{euros(devis.montant_tva)}</span></div>
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-800">
              <span>Total TTC</span><span className="font-mono">{euros(devis.montant_ttc)}</span>
            </div>
          </div>
        </div>

        {devis.notes_client && (
          <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Notes client</div>
            <p className="mt-1 whitespace-pre-wrap">{devis.notes_client}</p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
          {devis.statut === "accepte" ? (
            <form action={creerFacture}>
              <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
                Créer une facture depuis ce devis
              </button>
            </form>
          ) : (
            <p className="text-sm text-neutral-500">
              Passe le devis au statut « Accepté » pour pouvoir le transformer en facture.
            </p>
          )}
          {peutSupprimer && (
            <form action={supprimer}>
              <ConfirmSubmitButton message="Supprimer définitivement ce devis ? Cette action est irréversible." className="text-sm text-red-600 hover:underline">Supprimer</ConfirmSubmitButton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
