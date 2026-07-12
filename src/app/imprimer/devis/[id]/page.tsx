import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { AutoPrint } from "@/components/AutoPrint";

export default async function ImprimerDevisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: devis } = await supabase
    .from("devis")
    .select("*, client:clients(nom, prenom, societe, adresse_facturation, code_postal, ville, siret)")
    .eq("id", id)
    .single();

  if (!devis) notFound();

  const { data: lignes } = await supabase
    .from("lignes_devis").select("*").eq("devis_id", id).order("ordre");

  const { data: entreprise } = await supabase
    .from("entreprises").select("*").eq("id", ctx.entrepriseId).single();

  const client = Array.isArray(devis.client) ? devis.client[0] : devis.client;

  return (
    <>
      <AutoPrint />
      <DocumentImprimable
        typeDoc="Devis"
        numero={devis.numero ?? "BROUILLON"}
        dateEmission={devis.date_emission}
        dateSecondaire={devis.date_validite ? { label: "Valable jusqu'au", valeur: devis.date_validite } : null}
        entreprise={entreprise ?? { nom: ctx.entrepriseNom }}
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
        montantHt={devis.montant_ht}
        montantTva={devis.montant_tva}
        montantTtc={devis.montant_ttc}
        notesClient={devis.notes_client}
        estFacture={false}
      />
    </>
  );
}
