import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { DevisEditor } from "@/components/DevisEditor";
import { nomClient } from "@/lib/chantier-statuts";
import { iaEstActive } from "@/lib/preview-features";
import { lireOptionsChantiers, lireOptionsClients } from "@/lib/fiches-agregats";

export default async function NouveauDevisPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; chantier?: string }>;
}) {
  const { client: clientPreselect, chantier: chantierPreselect } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const peutUtiliserIA = iaEstActive() && aAccesIA(await permissionsUtilisateur(ctx));

  // Listes de choix complètes (gp_options_*) : tronquées à 1 000 par PostgREST.
  const clients = await lireOptionsClients(supabase, ctx.entrepriseId);

  const chantiers = await lireOptionsChantiers(supabase, ctx.entrepriseId, { statutsExclus: [], tri: "recent" });

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
