import { logoutAction } from "@/app/actions/auth";
import { demarrerAbonnementSuspenduAction, ouvrirPortailAbonnementSuspenduAction } from "@/app/actions/abonnement";
import { createClient } from "@/lib/supabase/server";
import { OFFRES_TARIFAIRES } from "@/lib/tarification";

export default async function AbonnementSuspenduPage({ searchParams }: { searchParams: Promise<{ error?: string }> }){
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profil } = user ? await supabase.from("utilisateurs").select("entreprise_active_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data: entreprise } = profil?.entreprise_active_id
    ? await supabase.from("entreprises").select("stripe_subscription_id").eq("id", profil.entreprise_active_id).maybeSingle()
    : { data: null };
  const offres = OFFRES_TARIFAIRES.filter((offre) => ["mini", "pro", "business", "entreprise"].includes(offre.cle));
  return <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6"><div className="w-full max-w-3xl space-y-5 rounded-xl border bg-white p-6 text-center shadow-sm"><div className="text-4xl">⏸</div><h1 className="text-2xl font-semibold">Accès temporairement suspendu</h1><p className="text-sm text-neutral-600">La période d’essai est terminée ou le règlement n’a pas été confirmé. Les données de l’entreprise sont conservées.</p>{error&&<p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{entreprise?.stripe_subscription_id?<><p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">L’administrateur peut mettre à jour la carte, consulter la facture et régulariser depuis le portail Stripe sécurisé.</p><form action={ouvrirPortailAbonnementSuspenduAction}><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Régulariser l’abonnement</button></form></>:<section className="space-y-3"><p className="text-sm text-neutral-600">Choisissez une offre pour réactiver l’accès. Après la fin de l’essai, la facturation démarre immédiatement dans Stripe.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{offres.map((offre)=><form key={offre.cle} action={demarrerAbonnementSuspenduAction} className="rounded-lg border p-4 text-left"><input type="hidden" name="offre" value={offre.cle}/><h2 className="font-semibold">{offre.nom}</h2><p className="mt-1 text-sm text-neutral-500">{offre.prixMensuelCentimes === null ? "Sur devis" : `${offre.prixMensuelCentimes/100} € HT/mois`}</p><select name="periodicite" defaultValue="mensuel" className="mt-3 w-full rounded border px-2 py-1.5 text-sm"><option value="mensuel">Mensuel</option><option value="annuel">Annuel</option></select><button className="mt-3 w-full rounded bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white">Souscrire</button></form>)}</div></section>}<form action={logoutAction}><button className="rounded-md border px-4 py-2 text-sm">Se déconnecter</button></form></div></main>;
}
