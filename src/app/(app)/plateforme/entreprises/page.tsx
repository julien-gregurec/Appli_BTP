import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AnnuaireEntreprises } from "@/components/plateforme/AnnuaireEntreprises";
import { chargerHabilitationsAnnuaire } from "@/lib/plateforme-annuaire-habilitations";
import { chargerAnnuaire } from "@/lib/plateforme-annuaire-serveur";
import {
  COOKIE_VUE_ANNUAIRE,
  analyserRequeteAnnuaire,
  serialiserRequeteAnnuaire,
} from "@/lib/plateforme-annuaire";

export const dynamic = "force-dynamic";

/**
 * Annuaire des entreprises clientes.
 *
 * Cette page ne fait que trois choses : vérifier l'habilitation, analyser la
 * requête portée par l'URL, charger le résultat. Tout le rendu vit dans
 * `AnnuaireEntreprises`, qui ne lit rien.
 */
export default async function AnnuaireEntreprisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const habilitations = await chargerHabilitationsAnnuaire();
  // L'annuaire est réservé aux rôles plateforme. `notFound` plutôt qu'un 403 :
  // l'existence même de cet espace n'a pas à être révélée.
  if (!habilitations.peutConsulter) notFound();

  const params = await searchParams;
  const magasin = await cookies();
  const vueEnregistree = magasin.get(COOKIE_VUE_ANNUAIRE)?.value ?? "";

  // Une arrivée sans paramètre rejoue la vue enregistrée par l'opérateur.
  const parametresEffectifs =
    Object.keys(params).length === 0 && vueEnregistree
      ? Object.fromEntries(new URLSearchParams(vueEnregistree))
      : params;

  const requete = analyserRequeteAnnuaire(parametresEffectifs);
  const maintenant = new Date();
  const resultat = await chargerAnnuaire(requete, maintenant);

  return (
    <AnnuaireEntreprises
      requete={requete}
      resultat={resultat}
      habilitations={habilitations}
      chaineVue={serialiserRequeteAnnuaire(requete).toString()}
      vueEnregistree={vueEnregistree}
      maintenant={maintenant}
    />
  );
}
