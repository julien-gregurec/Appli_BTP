import Link from "next/link";
import { ConfigurateurAbonnement } from "@/components/commercial/ConfigurateurAbonnement";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { resoudreUrlContactCommercial } from "@/lib/brand";
import { estForfaitVendable, VERSION_CATALOGUE_COMMERCIAL, VERSION_GRILLE_PUBLIQUE } from "@/lib/commercial/catalogue";

export const metadata = { title: "Configurer mon abonnement" };

export default async function ConfigurateurPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("abonnement_offre")
    .eq("id", ctx.entrepriseId)
    .maybeSingle();
  const offreActuelle = entreprise?.abonnement_offre;
  const forfaitInitial = estForfaitVendable(offreActuelle) ? offreActuelle : "mini";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <Link href="/abonnement" className="text-sm text-neutral-500 hover:underline">← Retour à mon abonnement</Link>
        <h1 className="mt-2 text-2xl font-bold">Configurer mon abonnement</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Partez d&apos;un forfait, ajoutez ce dont vous avez besoin, et voyez le prix final avant toute confirmation.
          Aucune modification n&apos;est appliquée depuis cet écran.
        </p>
      </header>
      <ConfigurateurAbonnement forfaitInitial={forfaitInitial} urlContact={resoudreUrlContactCommercial()} />
      <footer className="text-xs text-neutral-400">
        Grille publique {VERSION_GRILLE_PUBLIQUE} · catalogue commercial {VERSION_CATALOGUE_COMMERCIAL}. Les tarifs
        signalés « provisoire » ou « divergent » ne sont pas encore arbitrés et ne valent pas engagement.
      </footer>
    </div>
  );
}
