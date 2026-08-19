import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { euros } from "@/lib/devis";
import { numeroAvenant } from "@/lib/avenants";
import { DocumentImprimable, type EntrepriseEntete } from "@/components/DocumentImprimable";
import { AutoPrint } from "@/components/AutoPrint";
import { ENTETE_ENTREPRISE_COLONNES } from "@/lib/documents-commerciaux";

export default async function ImprimerAvenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: avenant } = await supabase
    .from("avenants")
    .select(
      "id, ordre, statut, date_creation, montant_ht, montant_tva, montant_ttc, notes_client, chantier:chantiers(nom), devis:devis!avenants_devis_origine_id_fkey(id, numero, montant_ht, client:clients(nom, prenom, societe, adresse_facturation, code_postal, ville, siret))",
    )
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!avenant) notFound();

  const chantier = Array.isArray(avenant.chantier) ? avenant.chantier[0] : avenant.chantier;
  const devis = Array.isArray(avenant.devis) ? avenant.devis[0] : avenant.devis;
  if (!devis) notFound();
  const client = Array.isArray(devis.client) ? devis.client[0] : devis.client;

  const [{ data: lignes }, { data: entreprise }, { data: avenantsAcceptesPrecedents }] = await Promise.all([
    supabase.from("lignes_avenants").select("*").eq("avenant_id", id).order("ordre"),
    supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single(),
    supabase.from("avenants").select("montant_ht").eq("devis_origine_id", devis.id).eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte").neq("id", id),
  ]);

  const cumulPrecedent = (avenantsAcceptesPrecedents ?? []).reduce((s, a) => s + Number(a.montant_ht), 0);
  const montantInitial = Number(devis.montant_ht);
  const nouveauMontantContractuel = montantInitial + cumulPrecedent + (avenant.statut === "accepte" ? Number(avenant.montant_ht) : 0);

  const entrepriseEntete: EntrepriseEntete = {} as EntrepriseEntete;
  for (const colonne of ENTETE_ENTREPRISE_COLONNES) (entrepriseEntete as Record<string, unknown>)[colonne] = (entreprise as Record<string, unknown> | null)?.[colonne] ?? null;

  const notesResume = [
    `Devis d'origine : ${devis.numero ?? "—"} (${euros(montantInitial)})`,
    `Cumul des avenants précédents acceptés : ${euros(cumulPrecedent)}`,
    `Nouveau montant contractuel${avenant.statut === "accepte" ? "" : " (si accepté)"} : ${euros(nouveauMontantContractuel)}`,
    avenant.notes_client ? `\n${avenant.notes_client}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <AutoPrint />
      <DocumentImprimable
        typeDoc={`AVENANT ${numeroAvenant(devis.numero, avenant.ordre)}${chantier ? ` — ${chantier.nom}` : ""}`}
        numero={numeroAvenant(devis.numero, avenant.ordre)}
        dateEmission={avenant.date_creation}
        dateSecondaire={null}
        entreprise={entrepriseEntete}
        client={{
          nom_affiche: client ? nomClient(client) : "—",
          adresse_facturation: client?.adresse_facturation,
          code_postal: client?.code_postal,
          ville: client?.ville,
          siret: client?.siret,
        }}
        lignes={(lignes ?? []).map((l) => ({
          designation: l.designation,
          description: l.description,
          quantite: l.quantite,
          unite: l.unite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          remise_ligne: l.remise_ligne,
          taux_tva: l.taux_tva,
        }))}
        montantHt={avenant.montant_ht}
        montantTva={avenant.montant_tva}
        montantTtc={avenant.montant_ttc}
        notesClient={notesResume}
        estFacture={false}
      />
    </>
  );
}
