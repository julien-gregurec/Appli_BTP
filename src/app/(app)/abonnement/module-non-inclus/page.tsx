import Link from "next/link";
import { BRAND_NAME, resoudreUrlContactCommercial } from "@/lib/brand";
import { abonnementsPublicsOuverts } from "@/lib/commercialisation-abonnements";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionEstSocle } from "@/lib/acces-socle-essai";

export default async function ModuleNonInclusPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;
  const ctx = await getContexteEntreprise();
  const enEssai = ctx.abonnementStatut === "essai";
  const abonnementsOuverts = abonnementsPublicsOuverts();
  const contact = resoudreUrlContactCommercial();
  // Ne devrait plus jamais arriver depuis le correctif P0-1 : une fonction du
  // SOCLE est ouverte dès l'essai. Signalé explicitement si ça se reproduit.
  const socle = module ? permissionEstSocle(module) : false;

  return (
    <main className="mx-auto max-w-2xl space-y-6 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#9b762f]">Abonnement</p>
        <h1 className="mt-2 text-3xl font-bold">Module optionnel non inclus</h1>
      </div>
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <p>
          {enEssai
            ? "Votre poste peut être autorisé à utiliser ce module, mais il s’agit d’un module optionnel qui n’est pas compris dans l’essai."
            : "Votre poste peut être autorisé à utiliser ce module, mais l’offre souscrite par l’entreprise ne l’inclut pas actuellement."}
        </p>
        <p className="mt-3 text-sm">
          Les fonctions de base — clients, devis, factures, chantiers, planning, employés et
          messagerie — restent accessibles.
        </p>
        {module ? <p className="mt-3 text-sm">Droit concerné : <code>{module}</code></p> : null}
        {socle ? (
          <p className="mt-3 text-sm font-semibold">
            Ce droit fait partie des fonctions de base : signalez cette page à {BRAND_NAME}.
          </p>
        ) : null}
      </section>
      <div className="flex flex-wrap gap-3">
        {/* Aucun CTA d'achat tant que la souscription en ligne est fermée. */}
        {abonnementsOuverts ? (
          <Link href="/abonnement" className="rounded-lg bg-[#0d1b2a] px-4 py-2 font-semibold text-white">
            Comparer les offres
          </Link>
        ) : (
          <a href={contact} className="rounded-lg bg-[#0d1b2a] px-4 py-2 font-semibold text-white">
            Contacter {BRAND_NAME}
          </a>
        )}
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 font-semibold">
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
