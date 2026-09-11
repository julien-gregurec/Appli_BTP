import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { DevisEditor } from "@/components/DevisEditor";
import { EditeurDevisV2 } from "@/components/devis/EditeurDevisV2";
import { nomClient } from "@/lib/chantier-statuts";
import { iaEstActive } from "@/lib/preview-features";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerDonneesEditeurV2 } from "@/lib/devis/editeur-v2-serveur";

export default async function NouveauDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; chantier?: string }>;
}) {
  const { client: clientPreselect, chantier: chantierPreselect } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  // Éditeur visuel v2 (aperçu A4 réel, catalogue, ouvrages) : seulement une fois le schéma v2 migré
  // et le moteur activé. Sinon, l'éditeur historique ci-dessous, inchangé.
  if (devisV2Actif()) {
    const donnees = await chargerDonneesEditeurV2(supabase, ctx);
    const chantier = chantierPreselect ? donnees.chantiers.find((c) => c.id === chantierPreselect) : undefined;
    return (
      <main className="p-4 lg:p-6">
        <Link href="/devis" className="text-sm text-neutral-500 hover:underline">← Devis</Link>
        <EditeurDevisV2
          devisId={null}
          {...donnees}
          enteteInitiale={{
            client_id: clientPreselect ?? chantier?.clientId ?? "",
            chantier_id: chantier?.id ?? null,
            date_emission: null,
            date_validite: null,
            conditions: null,
            notes_client: null,
            notes_internes: null,
            remise_globale: 0,
            filigrane: null,
          }}
          etatInitial={{ elements: [], origines: {} }}
        />
      </main>
    );
  }

  const peutUtiliserIA = iaEstActive() && aAccesIA(await permissionsUtilisateur(ctx));

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nom, prenom, societe")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, nom, client_id")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const { data: prestations } = await supabase
    .from("prestations_catalogue")
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("actif", true)
    .order("designation");

  const optionsClients = (clients ?? []).map((c) => ({ id: c.id, label: nomClient(c) }));
  const optionsChantiers = (chantiers ?? []).map((c) => ({ id: c.id, label: c.nom, client_id: c.client_id }));

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/devis" className="text-sm text-neutral-500 hover:underline">← Devis</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouveau devis</h1>
        </div>

        <DevisEditor
          clients={optionsClients}
          chantiers={optionsChantiers}
          prestations={prestations ?? []}
          clientPreselect={clientPreselect}
          chantierPreselect={chantierPreselect}
          peutUtiliserIA={peutUtiliserIA}
        />
      </div>
    </main>
  );
}
