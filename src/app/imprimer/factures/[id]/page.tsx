import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { typeFactureLabel } from "@/lib/factures";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { AutoPrint } from "@/components/AutoPrint";

export default async function ImprimerFacturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select("*, client:clients(nom, prenom, societe, adresse_facturation, code_postal, ville, siret)")
    .eq("id", id)
    .single();

  if (!facture) notFound();

  const [{ data: lignes }, { data: entreprise }, { data: signatures }] = await Promise.all([
    supabase.from("lignes_factures").select("*").eq("facture_id", id).order("ordre"),
    supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single(),
    supabase.from("signatures_documents").select("id,employe_id,nom_signataire,fonction_signataire,signed_at,document_sha256").eq("entreprise_id", ctx.entrepriseId).eq("type_document", "facture").eq("document_id", id).order("signed_at"),
  ]);

  const client = Array.isArray(facture.client) ? facture.client[0] : facture.client;
  const typeDoc = facture.type === "simple" ? "Facture" : `Facture — ${typeFactureLabel(facture.type)}`;

  return (
    <>
      <AutoPrint />
      <DocumentImprimable
        typeDoc={typeDoc}
        numero={facture.numero ?? "BROUILLON"}
        dateEmission={facture.date_emission}
        dateSecondaire={facture.date_echeance ? { label: "Échéance le", valeur: facture.date_echeance } : null}
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
        montantHt={facture.montant_ht}
        montantTva={facture.montant_tva}
        montantTtc={facture.montant_ttc}
        notesClient={facture.notes_client}
        estFacture={true}
        signatures={signatures ?? []}
      />
    </>
  );
}
