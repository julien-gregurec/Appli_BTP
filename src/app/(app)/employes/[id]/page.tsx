import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ancienneteEmploye, contratEmployeLabel, formatDateFr, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";
import { StatutEmployeSelect } from "@/components/StatutEmployeSelect";
import { changerStatutCompteApplicationAction, reinitialiserMotDePasseStockEmployeAction, importerCarteBtpAction, supprimerCarteBtpAction } from "@/app/actions/employes";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import Image from "next/image";
import { InvitationEmploye } from "@/components/InvitationEmploye";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { IdentificationCodeCard } from "@/components/IdentificationCodeCard";

export default async function EmployeDetailPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{error?:string;success?:string}> }) {
  const { id } = await params;
  const messages=await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: employe } = await supabase
    .from("employes")
    .select("*, profil_acces:postes(nom)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!employe) notFound();

  const { data: codeIdentification } = await supabase.from("codes_identification").select("id,code").eq("entreprise_id", ctx.entrepriseId).eq("type_ressource", "employe").eq("ressource_id", id).eq("actif", true).maybeSingle();

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, reference_interne, nom, statut, ville")
    .eq("responsable_id", id)
    .order("created_at", { ascending: false });

  const statut = statutEmploye(employe.statut);
  const importerCarte=importerCarteBtpAction.bind(null,id),supprimerCarte=supprimerCarteBtpAction.bind(null,id);

  const ligne = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex gap-2 text-sm">
        <span className="w-40 flex-none text-neutral-500">{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/employes" className="text-sm text-neutral-500 hover:underline">← Employés</Link>
            <h1 className="mt-1 text-xl font-semibold">{nomEmploye(employe)}</h1>
            <p className="font-mono text-xs text-neutral-500">
              {employe.identifiant_interne ?? employe.reference_interne} · {contratEmployeLabel(employe.type_contrat)} · {statut.libelle}
            </p>
          </div>
          <Link href={`/employes/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Modifier
          </Link>
        </div>

        {messages.error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messages.error}</p>}{messages.success&&<p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{messages.success}</p>}

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Fiche</h2>
            <StatutEmployeSelect employeId={id} statut={employe.statut} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
            {statut.libelle}
          </div>
          {ligne("Poste", employe.poste)}
          {ligne("Profil d’accès", Array.isArray(employe.profil_acces) ? employe.profil_acces[0]?.nom : employe.profil_acces?.nom)}
          {ligne("Téléphone", employe.telephone)}
          {ligne("Email", employe.email)}
          {ligne("Date d'entrée", formatDateFr(employe.date_entree))}
          {ligne("Ancienneté", ancienneteEmploye(employe.date_entree, employe.statut === "sorti" ? employe.date_sortie : null))}
          {employe.statut === "sorti" && ligne("Date de sortie", employe.date_sortie ? formatDateFr(employe.date_sortie) : null)}
          {ligne("Taux facturé", formatEuro(employe.taux_horaire))}
          {ligne("Coût interne", formatEuro(employe.cout_horaire))}
          {ligne("Notes", employe.notes)}
        </section>

        <section className="space-y-4 rounded-md border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <div>
            <h2 className="font-semibold">Accès personnel à l’application</h2>
            <p className="text-sm text-neutral-500">La fiche, le poste et ses autorisations sont préparés avant que l’employé crée son compte.</p>
          </div>
          {employe.numero_inscription ? <InvitationEmploye employeId={employe.id} numero={employe.numero_inscription} nom={nomEmploye(employe)} email={employe.email} compteActif={Boolean(employe.utilisateur_id)} inscriptionsActives={!isEmailLoginDisabled()} invitationEnvoyeeAt={employe.invitation_envoyee_at} premiereConnexionAt={employe.premiere_connexion_at} derniereConnexionAt={employe.derniere_connexion_at} applicationInstalleeAt={employe.application_installee_at} /> : <p className="text-sm text-red-700">La migration des numéros d’inscription doit être appliquée.</p>}
          {employe.utilisateur_id&&<div className="rounded-md border bg-white p-3"><p className="text-sm"><strong>État du compte :</strong> {employe.compte_application_statut?.replaceAll("_"," ")??"actif"}</p><p className="mt-1 text-xs text-neutral-500">Un compte en pause ne peut plus entrer dans l’entreprise, mais reste facturé pour le mois. La fermeture conserve l’historique.</p><div className="mt-3 flex flex-wrap gap-2">{employe.compte_application_statut!=="actif"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"actif")}><button className="rounded bg-green-700 px-3 py-2 text-sm text-white">Réactiver</button></form>}{employe.compte_application_statut!=="pause"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"pause")}><button className="rounded border px-3 py-2 text-sm">Mettre en pause</button></form>}{employe.compte_application_statut!=="ferme"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"ferme")}><ConfirmSubmitButton message="Fermer l’accès de ce compte ? Le mois entamé restera facturé." className="rounded border border-red-400 px-3 py-2 text-sm text-red-700">Fermer le compte</ConfirmSubmitButton></form>}</div></div>}
        </section>

        <section className="space-y-4 rounded-md border p-4 dark:border-neutral-800">
          <div><h2 className="font-semibold">Identification stock et QR employé</h2><p className="text-sm text-neutral-500">L’employé crée lui-même son mot de passe stock depuis « Mon espace ». L’administrateur peut seulement le réinitialiser ; il n’est jamais affiché ni conservé en clair.</p></div>
          <div className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${employe.code_stock_active ? "bg-green-600" : "bg-neutral-300"}`} /><strong>{employe.code_stock_active ? "Accès personnel actif" : "Mot de passe stock à créer"}</strong></div>
          <p className="rounded bg-neutral-50 p-3 font-mono text-sm dark:bg-neutral-900">Identifiant à saisir au dépôt : {employe.identifiant_interne ?? employe.reference_interne}</p>
          {employe.code_stock_active && <form action={reinitialiserMotDePasseStockEmployeAction.bind(null, id)}><ConfirmSubmitButton message="Réinitialiser l’accès stock ? L’employé devra créer un nouveau mot de passe depuis Mon espace." className="text-sm text-red-700">Réinitialiser le mot de passe stock</ConfirmSubmitButton></form>}
        </section>

        {codeIdentification && <IdentificationCodeCard id={codeIdentification.id} code={codeIdentification.code} label="QR code de la fiche employé" />}

        <section className="space-y-4 rounded-md border border-[#c9a24a]/50 bg-[#c9a24a]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Carte professionnelle BTP</h2><p className="text-sm text-neutral-500">Copie numérique privée à présenter rapidement en cas de contrôle. Le document original reste la référence officielle.</p></div><Link href={`/employes/${id}/carte`} className="rounded-md border border-[#0d1b2a] px-3 py-1.5 text-sm font-medium">Badge & habilitations →</Link></div>
          {employe.carte_btp_storage_path?<div className="grid gap-4 sm:grid-cols-[220px_1fr]"><a href={`/api/employes/${id}/carte-btp`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-white"><div className="flex h-36 items-center justify-center">{employe.carte_btp_mime_type?.startsWith("image/")?<Image src={`/api/employes/${id}/carte-btp`} alt={`Carte BTP de ${nomEmploye(employe)}`} width={220} height={144} unoptimized className="h-36 w-full object-contain"/>:<span className="text-center text-sm font-medium">📄<br/>Ouvrir la carte BTP PDF</span>}</div></a><div className="space-y-2 text-sm"><p><span className="text-neutral-500">Fichier :</span> {employe.carte_btp_nom}</p>{employe.carte_btp_numero&&<p><span className="text-neutral-500">N° de carte :</span> <span className="font-mono">{employe.carte_btp_numero}</span></p>}{employe.carte_btp_expiration&&<p><span className="text-neutral-500">Expiration :</span> {formatDateFr(employe.carte_btp_expiration)}</p>}<div className="flex gap-3"><a href={`/api/employes/${id}/carte-btp`} target="_blank" rel="noreferrer" className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-medium text-white">Présenter la carte</a><a href={`/api/employes/${id}/carte-btp?download=1`} className="rounded-md border px-3 py-2 text-sm">Télécharger</a></div><form action={supprimerCarte}><ConfirmSubmitButton message="Supprimer la copie numérique de cette carte BTP ?" className="text-xs text-red-600">Supprimer la carte</ConfirmSubmitButton></form></div></div>:<p className="rounded border border-dashed p-4 text-sm text-neutral-500">Aucune carte BTP enregistrée.</p>}
          <form action={importerCarte} className="grid gap-3 border-t pt-4 sm:grid-cols-2"><label className="text-xs text-neutral-500 sm:col-span-2">Importer ou remplacer la carte<input name="carte_btp" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" required className="mt-1 block w-full rounded border px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-500">Numéro de carte <span className="font-normal">(facultatif)</span><input name="carte_btp_numero" defaultValue={employe.carte_btp_numero??""} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-500">Date d’expiration <span className="font-normal">(facultatif)</span><input name="carte_btp_expiration" type="date" defaultValue={employe.carte_btp_expiration??""} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2">Enregistrer la carte BTP</button></form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Chantiers suivis</h2>
          {!chantiers || chantiers.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun chantier rattaché comme responsable.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <tbody>
                  {chantiers.map((chantier) => (
                    <tr key={chantier.id} className="border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{chantier.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/chantiers/${chantier.id}`} className="font-medium hover:underline">{chantier.nom}</Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{chantier.ville ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
