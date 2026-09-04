import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { ouvrirPortailAbonnementSuspenduAction } from "@/app/actions/abonnement";

// ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1 : cette page sert deux situations
// distinctes, jamais confondues dans le message affiché — l'entreprise n'a
// jamais eu à choisir/payer une offre (essai de 30 jours simplement terminé,
// motif=essai_expire, pas de portail Stripe à proposer puisqu'aucun abonnement
// n'existe) et l'entreprise a un abonnement réel en impayé (motif absent,
// comportement historique inchangé, portail Stripe proposé).
export default async function AbonnementSuspenduPage({ searchParams }: { searchParams: Promise<{ error?: string; motif?: string }> }){
  const { error, motif } = await searchParams;

  if (motif === "essai_expire") {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6"><div className="w-full max-w-lg space-y-5 rounded-xl border bg-white p-6 text-center shadow-sm"><div className="text-4xl">⏳</div><h1 className="text-2xl font-semibold">Votre essai gratuit est terminé</h1><p className="text-sm text-neutral-600">Les 30 jours d’essai de Gestion Pro sont écoulés et aucune offre n’a encore été choisie. Les fonctionnalités métier sont bloquées, mais vos données restent intégralement conservées et seront immédiatement disponibles après souscription.</p>{error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex flex-wrap justify-center gap-2"><Link href="/abonnement" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Choisir une offre</Link><form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form></div></div></main>;
  }

  return <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6"><div className="w-full max-w-lg space-y-5 rounded-xl border bg-white p-6 text-center shadow-sm"><div className="text-4xl">⏸</div><h1 className="text-2xl font-semibold">Accès temporairement suspendu</h1><p className="text-sm text-neutral-600">Le règlement de l’abonnement n’a pas été confirmé. Les données de l’entreprise sont conservées, mais les modules restent suspendus jusqu’à régularisation.</p>{error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">L’administrateur peut mettre à jour la carte, consulter la facture et régulariser depuis le portail Stripe sécurisé.</p><div className="flex flex-wrap justify-center gap-2"><form action={ouvrirPortailAbonnementSuspenduAction}><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Régulariser l’abonnement</button></form><form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form></div></div></main>;
}
