import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros, LIGNE_TYPES } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";
import { typeFactureLabel, MODES_PAIEMENT } from "@/lib/factures";
import { StatutFactureSelect } from "@/components/StatutFactureSelect";
import { enregistrerPaiementAction, modifierEcheanceFactureAction, supprimerPaiementAction } from "@/app/actions/factures";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { contenuEmailDocument } from "@/lib/email";
import { EmailDocumentButton } from "@/components/EmailDocumentButton";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function FactureDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select("*, client:clients(id, nom, prenom, societe, email), chantier:chantiers(id, nom), devis:devis(id, numero)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!facture) notFound();

  const { data: lignes } = await supabase
    .from("lignes_factures").select("*").eq("facture_id", id).order("ordre");
  const { data: paiements } = await supabase
    .from("paiements").select("*").eq("facture_id", id).order("date");

  const client = Array.isArray(facture.client) ? facture.client[0] : facture.client;
  const chantier = Array.isArray(facture.chantier) ? facture.chantier[0] : facture.chantier;
  const devis = Array.isArray(facture.devis) ? facture.devis[0] : facture.devis;
  const typeLigne = (t: string) => LIGNE_TYPES.find((x) => x.cle === t)?.libelle ?? t;
  const modeLabel = (m: string) => MODES_PAIEMENT.find((x) => x.cle === m)?.libelle ?? m;
  const resteAPayer = Number(facture.montant_ttc) - Number(facture.montant_paye);
  const enregistrer = enregistrerPaiementAction.bind(null, id);
  const modifierEcheance = modifierEcheanceFactureAction.bind(null, id);
  const email = contenuEmailDocument({
    typeDoc: "facture",
    numero: facture.numero,
    client,
    montantTtc: Number(facture.montant_ttc),
    entrepriseNom: ctx.entrepriseNom,
    prenomEmetteur: ctx.prenom,
  });

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/factures" className="text-sm text-neutral-500 hover:underline">← Factures</Link>
            <h1 className="mt-1 text-xl font-semibold">
              {facture.numero ?? "Facture (brouillon)"}
              <span className="ml-2 text-sm font-normal text-neutral-500">· {typeFactureLabel(facture.type)}</span>
            </h1>
            <p className="text-sm text-neutral-500">
              {client ? nomClient(client) : "—"}
              {chantier && <> · chantier <Link href={`/chantiers/${chantier.id}`} className="hover:underline">{chantier.nom}</Link></>}
              {devis && <> · devis <Link href={`/devis/${devis.id}`} className="hover:underline">{devis.numero}</Link></>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {facture.statut === "brouillon" && <Link href={`/factures/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Modifier</Link>}
            <a
              href={`/imprimer/factures/${id}`}
              target="_blank"
              rel="noopener"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Télécharger PDF
            </a>
            {email ? (
              <EmailDocumentButton type="facture" id={id} statut={facture.statut} to={email.to} sujet={email.sujet} corps={email.corps} pdfUrl={`/imprimer/factures/${id}`} />
            ) : (
              <span className="cursor-default rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 dark:border-neutral-800" title="Aucun email renseigné pour ce client">
                Envoyer par email
              </span>
            )}
            <StatutFactureSelect factureId={id} statut={facture.statut} />
          </div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={modifierEcheance} className="flex items-end gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="space-y-1"><label className="text-xs text-neutral-500">Date d’échéance</label><input name="date_echeance" type="date" defaultValue={facture.date_echeance ?? ""} className={input} /></div>
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Enregistrer l’échéance</button>
          {facture.date_echeance && facture.date_echeance < new Date().toISOString().slice(0, 10) && resteAPayer > 0 && <span className="ml-auto text-sm font-medium text-red-600">Échéance dépassée</span>}
        </form>

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
                    <td className="px-3 py-2">{l.designation}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{typeLigne(l.type)}</td>
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
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">Total HT</span><span className="font-mono">{euros(facture.montant_ht)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">TVA</span><span className="font-mono">{euros(facture.montant_tva)}</span></div>
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-800">
              <span>Total TTC</span><span className="font-mono">{euros(facture.montant_ttc)}</span>
            </div>
            <div className="flex justify-between text-neutral-500"><span>Payé</span><span className="font-mono">{euros(facture.montant_paye)}</span></div>
            <div className="flex justify-between font-medium" style={{ color: resteAPayer > 0 ? "#a64b45" : "#2f6b47" }}>
              <span>Reste à payer</span><span className="font-mono">{euros(resteAPayer)}</span>
            </div>
          </div>
        </div>

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Paiements</h2>
          {paiements && paiements.length > 0 ? (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {paiements.map((p) => {
                const supprimer = supprimerPaiementAction.bind(null, p.id, id);
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-mono">{euros(p.montant)}</span>
                    <span className="text-neutral-500">{modeLabel(p.mode)}</span>
                    <span className="text-neutral-400">{p.date}</span>
                    {p.reference && <span className="text-xs text-neutral-400">réf. {p.reference}</span>}
                    <form action={supprimer} className="ml-auto">
                      <ConfirmSubmitButton message={`Retirer le paiement de ${euros(p.montant)} ?`} className="text-xs text-neutral-400 hover:text-red-600">Supprimer</ConfirmSubmitButton>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Aucun paiement enregistré.</p>
          )}

          {!['brouillon', 'annulee', 'avoir_emis'].includes(facture.statut) && resteAPayer > 0 ? <form action={enregistrer} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Montant (€)</label>
              <input name="montant" type="number" step="0.01" required defaultValue={resteAPayer > 0 ? resteAPayer.toFixed(2) : ""} className={input + " w-28"} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Date</label>
              <input name="date" type="date" className={input} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Mode</label>
              <select name="mode" className={input}>
                {MODES_PAIEMENT.filter((m) => m.cle !== "carte_en_ligne").map((m) => (
                  <option key={m.cle} value={m.cle}>{m.libelle}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Référence</label>
              <input name="reference" placeholder="n° chèque…" className={input + " w-32"} />
            </div>
            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              Enregistrer
            </button>
          </form> : <p className="border-t border-neutral-100 pt-3 text-sm text-neutral-500 dark:border-neutral-800">{resteAPayer <= 0 ? "Cette facture est entièrement réglée." : "Les paiements ne sont pas disponibles pour ce statut."}</p>}
        </section>
      </div>
    </main>
  );
}
