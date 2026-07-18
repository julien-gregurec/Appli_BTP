import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { StatutCommandeSelect } from "@/components/StatutCommandeSelect";
import { enregistrerReceptionCommandeAction, supprimerCommandeAction } from "@/app/actions/commandes";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { EmailDocumentButton } from "@/components/EmailDocumentButton";
import { SignatureDocumentMetier } from "@/components/SignatureDocumentMetier";
import { contenuEmailCommande } from "@/lib/email";
import { ReceptionCommandeForm } from "@/components/ReceptionCommandeForm";

export default async function CommandeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reception?: string }>;
}) {
  const { id } = await params;
  const { error, reception } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: commande } = await supabase
    .from("commandes_fournisseurs")
    .select("*, fournisseur:fournisseurs(id, nom, email, telephone, contact_nom), chantier:chantiers(id, nom)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!commande) notFound();

  const { data: lignes } = await supabase
    .from("lignes_commande").select("*").eq("commande_id", id).order("ordre");

  const [{ data: auteurEmploye }, { data: auteurCompte }] = await Promise.all([
    commande.cree_par_employe_id
      ? supabase.from("employes").select("prenom, nom").eq("id", commande.cree_par_employe_id).eq("entreprise_id", ctx.entrepriseId).maybeSingle()
      : Promise.resolve({ data: null }),
    commande.cree_par_utilisateur_id
      ? supabase.from("utilisateurs").select("prenom, nom").eq("id", commande.cree_par_utilisateur_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const auteur = auteurEmploye ?? auteurCompte;

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const fournisseur = un(commande.fournisseur as { id: string; nom: string; email: string | null; telephone: string | null; contact_nom: string | null } | null);
  const chantier = un(commande.chantier as { id: string; nom: string } | null);
  const peutSupprimer = ["brouillon", "annulee"].includes(commande.statut);
  const supprimer = supprimerCommandeAction.bind(null, id);
  const enregistrerReception = enregistrerReceptionCommandeAction.bind(null, id);
  const email = fournisseur ? contenuEmailCommande({ numero: commande.numero, fournisseurNom: fournisseur.nom, fournisseurEmail: fournisseur.email, montantTtc: Number(commande.montant_ttc), entrepriseNom: ctx.entrepriseNom, dateLivraison: commande.date_livraison_prevue }) : null;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/commandes" className="text-sm text-neutral-500 hover:underline">← Commandes</Link>
            <h1 className="mt-1 text-xl font-semibold">{commande.numero}</h1>
            <p className="text-sm text-neutral-500">
              {fournisseur?.nom ?? "—"}
              {chantier && <> · chantier <Link href={`/chantiers/${chantier.id}`} className="hover:underline">{chantier.nom}</Link></>}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2"><a href={`/imprimer/commandes/${id}`} target="_blank" rel="noopener" className="rounded-md bg-[#0d1b2a] px-3 py-1.5 text-sm font-medium text-white">Télécharger PDF</a>{email ? <EmailDocumentButton type="commande" id={id} statut={commande.statut} to={email.to} sujet={email.sujet} corps={email.corps} pdfUrl={`/imprimer/commandes/${id}`} /> : <span className="text-xs text-amber-700">Ajoutez l’email du fournisseur pour envoyer</span>}<StatutCommandeSelect commandeId={id} statut={commande.statut} /></div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {reception && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Réception enregistrée. Les quantités reçues et manquantes sont à jour.</p>}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Fournisseur</div>
            <div className="mt-1 font-medium">{fournisseur?.nom}</div>
            {fournisseur?.contact_nom && <div className="text-neutral-500">{fournisseur.contact_nom}</div>}
            {fournisseur?.email && <div className="text-neutral-500">{fournisseur.email}</div>}
            {fournisseur?.telephone && <div className="text-neutral-500">{fournisseur.telephone}</div>}
          </div>
          <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Dates</div>
            <div className="mt-1">Commande : {commande.date_commande}</div>
            <div>Livraison prévue : {commande.date_livraison_prevue ?? "—"}</div>
            <div>Créée par : {auteur ? `${auteur.prenom ?? ""} ${auteur.nom ?? ""}`.trim() || "Compte utilisateur" : "Ancienne commande / prototype"}</div>
          </div>
        </div>

        {["envoyee", "confirmee", "recue_partiel"].includes(commande.statut) && <ReceptionCommandeForm action={enregistrerReception} lignes={(lignes ?? []).map((ligne) => ({ id: ligne.id, designation: ligne.designation, quantite: Number(ligne.quantite), quantite_recue: Number(ligne.quantite_recue), unite: ligne.unite }))} />}

        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Désignation</th>
                <th className="px-3 py-2 text-right font-medium">Qté</th>
                <th className="px-3 py-2 text-right font-medium">Reçue</th>
                <th className="px-3 py-2 text-right font-medium">Manquante</th>
                <th className="px-3 py-2 text-right font-medium">PU HT</th>
                <th className="px-3 py-2 text-right font-medium">TVA</th>
                <th className="px-3 py-2 text-right font-medium">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {(lignes ?? []).map((l) => (
                <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-3 py-2">
                    {l.designation}
                    {l.description && <div className="text-xs text-neutral-500">{l.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{l.quantite} {l.unite}</td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-500">{l.quantite_recue} {l.unite}</td>
                  <td className={`px-3 py-2 text-right font-mono ${Number(l.quantite) > Number(l.quantite_recue) ? "font-semibold text-red-700" : "text-neutral-400"}`}>{Math.max(0, Number(l.quantite) - Number(l.quantite_recue))} {l.unite}</td>
                  <td className="px-3 py-2 text-right font-mono">{euros(l.prix_unitaire_ht)}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.taux_tva} %</td>
                  <td className="px-3 py-2 text-right font-mono">{euros(l.quantite * l.prix_unitaire_ht)}</td>
                </tr>
              ))}
              {(!lignes || lignes.length === 0) && (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-neutral-500">Aucune ligne.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">Total HT</span><span className="font-mono">{euros(commande.montant_ht)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">TVA</span><span className="font-mono">{euros(commande.montant_tva)}</span></div>
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-800">
              <span>Total TTC</span><span className="font-mono">{euros(commande.montant_ttc)}</span>
            </div>
          </div>
        </div>

        {commande.notes && (
          <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="text-xs uppercase text-neutral-500">Notes internes</div>
            <p className="mt-1 whitespace-pre-wrap">{commande.notes}</p>
          </div>
        )}

        <SignatureDocumentMetier type="commande" documentId={id} />

        {peutSupprimer && (
          <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <form action={supprimer}>
              <ConfirmSubmitButton message="Supprimer définitivement cette commande ?" className="text-sm text-red-600 hover:underline">Supprimer</ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
