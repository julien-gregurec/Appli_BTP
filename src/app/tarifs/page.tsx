import Link from "next/link";
import type { Metadata } from "next";
import { PiedLegal } from "@/components/PiedLegal";
import { DUREE_ESSAI_JOURS } from "@/lib/plateforme";
import { formatMontantCentimes, OFFRES_TARIFAIRES, OPTIONS_TARIFAIRES, SERVICES_MISE_EN_SERVICE } from "@/lib/tarification";
import { stripeBillingEstConfigure } from "@/lib/stripe-abonnement";

export const metadata: Metadata = {
  title: "Tarifs — Liria Gestion Pro",
  description: "Des offres BTP transparentes avec utilisateurs, stockage et opérations IA inclus.",
};

const BENEFICES: Record<string, string[]> = {
  mini: ["Clients, chantiers, devis et factures", "Planning des équipes", "Assistant IA"],
  pro: ["Tout Mini", "Pointage, congés et notes de frais", "Achats, CRM et interventions"],
  business: ["Tout Pro", "Stock, flotte et outillage", "Rentabilité, exports et préparation de paie"],
  entreprise: ["Tout Business", "Connecteurs, banque et paie", "Appels d’offres et sous-traitants"],
  sur_mesure: ["Tout Entreprise", "Volumétrie et intégrations dédiées", "Accompagnement défini sur devis"],
};

export default function TarifsPage() {
  const paiementConfigure = stripeBillingEstConfigure();
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#c9a24a]">Liria Gestion Pro</p>
          <h1 className="mt-2 text-4xl font-bold text-[#0d1b2a] dark:text-white">Une tarification lisible, sans surprise</h1>
          <p className="mx-auto mt-4 max-w-3xl text-neutral-600 dark:text-neutral-300">
            Chaque offre indique le nombre de comptes, le stockage et le quota IA inclus. Essai de {DUREE_ESSAI_JOURS} jours ;
            la date et le montant du premier prélèvement sont affichés avant validation.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-5">
          {OFFRES_TARIFAIRES.map((offre) => (
            <article key={offre.cle} className={`flex flex-col rounded-2xl border bg-white p-5 dark:bg-neutral-900 ${offre.populaire ? "border-[#c9a24a] shadow-lg ring-1 ring-[#c9a24a]" : "border-neutral-200 dark:border-neutral-800"}`}>
              {offre.populaire ? <span className="mb-3 self-start rounded-full bg-[#c9a24a] px-3 py-1 text-xs font-semibold text-[#0d1b2a]">Le plus choisi</span> : null}
              <h2 className="text-xl font-bold text-[#0d1b2a] dark:text-white">{offre.nom}</h2>
              <p className="mt-2 min-h-20 text-sm text-neutral-500">{offre.resume}</p>
              <p className="mt-4 text-3xl font-bold text-[#0d1b2a] dark:text-white">
                {offre.devisObligatoire ? "Dès " : ""}{formatMontantCentimes(offre.prixMensuelCentimes)}
              </p>
              <p className="text-xs text-neutral-500">HT / mois</p>
              {offre.cle === "entreprise" ? <p className="mt-1 text-xs font-medium text-green-700">539 € HT/mois en annuel (6 468 € HT/an)</p> : <p className="mt-1 text-xs text-neutral-500">{formatMontantCentimes(offre.prixAnnuelCentimes)} HT/an</p>}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li>✓ {offre.cle === "entreprise" ? "40 salariés + 10 administrateurs" : `${offre.comptesInclus} comptes inclus`}</li>
                <li>✓ {offre.operationsIAIncluses.toLocaleString("fr-FR")} opérations IA / mois</li>
                <li>✓ {offre.stockageGoInclus} Go de stockage</li>
                {BENEFICES[offre.cle].map((point) => <li key={point}>✓ {point}</li>)}
              </ul>
              <Link href={offre.devisObligatoire || !paiementConfigure ? "mailto:contact@liria-gestion-pro.fr?subject=Demande%20Liria%20Gestion%20Pro" : `/signup?offre=${offre.cle}`} className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${offre.populaire ? "bg-[#0d1b2a] text-white" : "border border-[#0d1b2a] text-[#0d1b2a] dark:border-white dark:text-white"}`}>
                {offre.devisObligatoire ? "Demander un devis" : paiementConfigure ? "Démarrer l’essai" : "Demander une démonstration"}
              </Link>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-xl font-bold">Options activables</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OPTIONS_TARIFAIRES.map((option) => (
              <div key={option.cle} className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950">
                <p className="font-semibold">{option.nom}</p>
                <p className="mt-1 text-sm text-neutral-500">{option.prixMensuelCentimes === 0 ? "Gratuit" : `À partir de ${formatMontantCentimes(option.prixMensuelCentimes)} HT/mois`}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-500">Un crédit IA correspond à une opération assistée (analyse, génération ou extraction). Les opérations comprises dans l’offre sont remises à zéro chaque mois ; un pack additionnel n’est activé qu’après accord explicite.</p>
          <p className="mt-2 text-xs text-neutral-500">Toute option payante et tout dépassement sont présentés avant activation. Aucun numéro de carte n’est stocké par Liria Gestion Pro.</p>
        </section>

        <section className="mt-10 overflow-hidden rounded-2xl border bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="p-6"><h2 className="text-xl font-bold">Comparer les offres</h2><p className="mt-1 text-sm text-neutral-500">Un droit individuel reste toujours contrôlé par le rôle défini par l’administrateur de l’entreprise.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-center text-sm"><thead className="bg-neutral-50 dark:bg-neutral-950"><tr><th className="px-4 py-3 text-left">Capacité</th>{OFFRES_TARIFAIRES.map(offre=><th key={offre.cle} className="px-4 py-3">{offre.nom}</th>)}</tr></thead><tbody>{[
            ["Comptes inclus",...(OFFRES_TARIFAIRES.map(o=>String(o.comptesInclus)))],
            ["Administrateurs inclus",...(OFFRES_TARIFAIRES.map(o=>o.administrateursInclus===null?"Sur devis":String(o.administrateursInclus)))],
            ["Opérations IA / mois",...(OFFRES_TARIFAIRES.map(o=>o.operationsIAIncluses.toLocaleString("fr-FR")))],
            ["Stockage inclus",...(OFFRES_TARIFAIRES.map(o=>`${o.stockageGoInclus} Go`))],
          ].map((ligne)=><tr key={ligne[0]} className="border-t"><th className="px-4 py-3 text-left font-medium">{ligne[0]}</th>{ligne.slice(1).map((valeur,index)=><td key={`${ligne[0]}-${OFFRES_TARIFAIRES[index].cle}`} className="px-4 py-3">{valeur}</td>)}</tr>)}</tbody></table></div>
        </section>

        <section className="mt-10 rounded-2xl border bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-xl font-bold">Mise en service accompagnée</h2><p className="mt-1 text-sm text-neutral-500">Ces prestations ponctuelles sont proposées après validation d’un devis adapté au volume réel.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{SERVICES_MISE_EN_SERVICE.map(service=><div key={service.cle} className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-950"><p className="font-semibold">{service.nom}</p><p className="mt-1 text-sm text-neutral-500">{service.prixMinCentimes === service.prixMaxCentimes ? formatMontantCentimes(service.prixMinCentimes) : `De ${formatMontantCentimes(service.prixMinCentimes)} à ${formatMontantCentimes(service.prixMaxCentimes)}`} HT{"horsFraisDeplacement" in service && service.horsFraisDeplacement ? " + déplacement" : ""}</p></div>)}</div>
        </section>

        <section className="mx-auto mt-10 max-w-4xl space-y-4 rounded-2xl border bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-xl font-bold">Questions fréquentes</h2>
          <details><summary className="cursor-pointer font-semibold">Quand serai-je prélevé ?</summary><p className="mt-2 text-sm text-neutral-600">Après la période d’essai, à la date indiquée dans le récapitulatif Stripe. Le portail abonnement affiche ensuite chaque échéance et facture.</p></details>
          <details><summary className="cursor-pointer font-semibold">Une hausse de tarif modifie-t-elle mon contrat actuel ?</summary><p className="mt-2 text-sm text-neutral-600">Non. Le prix contractuel est figé. Une nouvelle grille ne s’applique qu’après information et acceptation explicite.</p></details>
          <details><summary className="cursor-pointer font-semibold">Que se passe-t-il quand le quota IA est atteint ?</summary><p className="mt-2 text-sm text-neutral-600">Des alertes apparaissent à 70 % et 90 %. À 100 %, les nouvelles opérations IA sont bloquées jusqu’au renouvellement ou à l’achat volontaire d’un pack.</p></details>
        </section>

        <p className="mt-8 text-center text-sm text-neutral-500">Déjà client ? <Link href="/login" className="font-medium underline">Se connecter</Link></p>
        <PiedLegal />
      </div>
    </main>
  );
}
