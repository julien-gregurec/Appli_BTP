import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ancienneteEmploye, contratEmployeLabel, formatDateFr, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";
import { StatutEmployeSelect } from "@/components/StatutEmployeSelect";
import { changerStatutCompteApplicationAction, reinitialiserMotDePasseStockEmployeAction, importerCarteBtpAction, supprimerCarteBtpAction, importerPhotoEmployeAction, supprimerPhotoEmployeAction, revoquerAppareilEmployeAction } from "@/app/actions/employes";
import { anonymiserEmployeAction } from "@/app/actions/rgpd";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import Image from "next/image";
import { InvitationEmploye } from "@/components/InvitationEmploye";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { IdentificationCodeCard } from "@/components/IdentificationCodeCard";
import { permissionsUtilisateur } from "@/lib/permissions";
import { roleChantier } from "@/lib/chantier-statuts";
import { CoordonneesBancairesForm } from "@/components/CoordonneesBancairesForm";
import { statutNoteFrais } from "@/lib/notes-frais";
import { euros } from "@/lib/devis";
import { SignatureEmploye } from "@/components/SignatureEmploye";
import { lienMaps } from "@/lib/maps";

const LIBELLES_TYPE_ACTIVITE: Record<string, string> = { chantier: "Chantier", bureau: "Bureau", depot: "Dépôt", visite_medicale: "Visite médicale", formation: "Formation", conge: "Congé / absence", autre: "Autre activité" };

export default async function EmployeDetailPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{error?:string;success?:string}> }) {
  const { id } = await params;
  const messages=await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_employes");
  const peutVoirTauxFacture = permissions === null || permissions.includes("voir_taux_facture_employe");
  const peutVoirCoutInterne = permissions === null || permissions.includes("voir_cout_interne_employe");
  const peutGererRib = !ctx.accesSupportPlateforme && (permissions === null || permissions.includes("gerer_coordonnees_bancaires"));

  const { data: employe } = await supabase
    .from("employes")
    .select("*, profil_acces:postes(nom)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!employe) notFound();
  const peutVoirHistoriqueFrais = employe.utilisateur_id === ctx.userId || permissions === null || permissions.includes("gerer_notes_frais") || permissions.includes("verifier_notes_frais") || permissions.includes("comptabiliser_notes_frais");

  const { data: rib } = peutGererRib ? await supabase.from("coordonnees_bancaires")
    .select("titulaire,iban_quatre_derniers,verification_statut,verification_message")
    .eq("entreprise_id", ctx.entrepriseId).eq("employe_id", id).eq("actif", true).maybeSingle() : { data: null };

  const { data: codeIdentification } = await supabase.from("codes_identification").select("id,code").eq("entreprise_id", ctx.entrepriseId).eq("type_ressource", "employe").eq("ressource_id", id).eq("actif", true).maybeSingle();
  const { data: notesFrais } = peutVoirHistoriqueFrais ? await supabase.from("notes_frais").select("id,reference,date_frais,fournisseur,montant_ttc,statut,chantier:chantiers!notes_frais_chantier_entreprise_fkey(nom)").eq("entreprise_id",ctx.entrepriseId).eq("employe_id",id).order("date_frais",{ascending:false}).limit(100) : {data:[]};
  const { data: appareils } = employe.utilisateur_id ? await supabase.from("appareils_comptes").select("id,nom_appareil,type_appareil,application_installee,premiere_activite_at,derniere_activite_at,revoque_at").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",employe.utilisateur_id).order("derniere_activite_at",{ascending:false}) : {data:[]};

  const { data: equipesChantiers } = await supabase
    .from("equipes_chantiers")
    .select("role_chantier,date_debut,date_fin,chantier:chantiers(id,reference_interne,nom,statut,ville)")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("employe_id", id)
    .is("date_fin", null)
    .order("date_debut", { ascending: false });

  // Planning jour par jour (distinct des equipes_chantiers ci-dessus, qui est une affectation
  // d'equipe longue duree) : toute affectation saisie manuellement ou via l'assistant IA
  // apparait ici automatiquement, puisque les deux ecritures visent la meme table.
  const { data: planningAVenir } = await supabase
    .from("affectations")
    .select("id,date,heures,tache,type_activite,lieu_activite,chantier:chantiers(id,nom)")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("employe_id", id)
    .gte("date", new Date().toISOString().slice(0, 10))
    .order("date")
    .limit(15);

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
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-neutral-100 text-xl font-semibold text-neutral-500">{employe.photo_storage_path||employe.photo_url?<Image src={employe.photo_storage_path?`/api/employes/${id}/photo`:employe.photo_url} alt={`Photo de ${nomEmploye(employe)}`} width={80} height={80} unoptimized className="h-full w-full object-cover"/>:<span>{employe.prenom?.[0]}{employe.nom?.[0]}</span>}</div>
            <div className="min-w-0">
            <Link href="/employes" className="text-sm text-neutral-500 hover:underline">← Employés</Link>
            <h1 className="mt-1 text-xl font-semibold">{nomEmploye(employe)}</h1>
            <p className="font-mono text-xs text-neutral-500">
              {employe.identifiant_interne ?? employe.reference_interne} · {contratEmployeLabel(employe.type_contrat)} · {statut.libelle}
            </p>
            </div>
          </div>
          {peutGerer&&<Link href={`/employes/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Modifier
          </Link>}
        </div>

        {messages.error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messages.error}</p>}{messages.success&&<p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{messages.success}</p>}

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Fiche</h2>
            {peutGerer&&<StatutEmployeSelect employeId={id} statut={employe.statut} />}
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
          {peutVoirTauxFacture&&ligne("Taux facturé", formatEuro(employe.taux_horaire))}
          {peutVoirCoutInterne&&ligne("Coût interne", formatEuro(employe.cout_horaire))}
          {ligne("Notes", employe.notes)}
        </section>

        {peutVoirHistoriqueFrais&&<section className="space-y-3 rounded-md border p-4 dark:border-neutral-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Historique des notes de frais</h2><p className="text-sm text-neutral-500">Justificatifs, décisions et montants conservés dans la fiche du salarié.</p></div><Link href={`/notes-frais?employe=${id}`} className="rounded border px-3 py-2 text-sm font-medium">Ouvrir le dossier complet</Link></div><div className="grid gap-2">{(notesFrais??[]).slice(0,12).map(note=>{const statut=statutNoteFrais(note.statut);const chantier=Array.isArray(note.chantier)?note.chantier[0]:note.chantier;return <Link key={note.id} href={`/notes-frais/${note.id}`} className="grid gap-1 rounded border p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[120px_1fr_1fr_auto_auto] sm:items-center"><strong className="font-mono">{note.reference}</strong><span>{note.fournisseur??"Sans fournisseur"}</span><span className="text-neutral-500">{chantier?.nom??"Frais généraux"} · {note.date_frais}</span><span style={{color:statut.couleur}}>{statut.libelle}</span><strong className="font-mono">{euros(note.montant_ttc)}</strong></Link>})}{!(notesFrais??[]).length&&<p className="rounded border border-dashed p-4 text-sm text-neutral-500">Aucune note de frais enregistrée pour cet employé.</p>}</div></section>}

        {peutGererRib && (
          <CoordonneesBancairesForm type="employe" beneficiaireId={id} retour={`/employes/${id}`} rib={rib}/>
        )}

        {peutGerer&&<section className="space-y-3 rounded-md border p-4 dark:border-neutral-800"><div><h2 className="font-semibold">Photo de l’employé</h2><p className="text-sm text-neutral-500">Portrait visible dans l’annuaire et la fiche interne.</p></div><form action={importerPhotoEmployeAction.bind(null,id)} className="flex flex-col gap-3 sm:flex-row"><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" capture="user" required className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"/><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">{employe.photo_storage_path?"Remplacer la photo":"Ajouter la photo"}</button></form>{employe.photo_storage_path&&<form action={supprimerPhotoEmployeAction.bind(null,id)}><ConfirmSubmitButton message="Supprimer la photo de cet employé ?" className="text-xs text-red-700">Supprimer la photo</ConfirmSubmitButton></form>}</section>}

        {peutGerer&&<section className="space-y-3 rounded-md border p-4 dark:border-neutral-800"><div><h2 className="font-semibold">Signature de l’employé</h2><p className="text-sm text-neutral-500">Signature numérique dessinée, conservée dans le dossier du salarié{employe.signature_at?` · enregistrée le ${new Date(employe.signature_at).toLocaleDateString("fr-FR")}`:""}.</p></div><SignatureEmploye employeId={id} aDejaSignature={Boolean(employe.signature_storage_path)}/></section>}

        {peutGerer&&<><section className="space-y-4 rounded-md border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <div>
            <h2 className="font-semibold">Accès personnel à l’application</h2>
            <p className="text-sm text-neutral-500">La fiche, le poste et ses autorisations sont préparés avant que l’employé crée son compte.</p>
          </div>
          {employe.numero_inscription ? <InvitationEmploye employeId={employe.id} numero={employe.numero_inscription} nom={nomEmploye(employe)} email={employe.email} compteActif={Boolean(employe.utilisateur_id)} inscriptionsActives={!isEmailLoginDisabled()} invitationEnvoyeeAt={employe.invitation_envoyee_at} premiereConnexionAt={employe.premiere_connexion_at} derniereConnexionAt={employe.derniere_connexion_at} applicationInstalleeAt={employe.application_installee_at} /> : <p className="text-sm text-red-700">La migration des numéros d’inscription doit être appliquée.</p>}
          {employe.utilisateur_id&&<div className="rounded-md border bg-white p-3"><p className="text-sm"><strong>État du compte :</strong> {employe.compte_application_statut?.replaceAll("_"," ")??"actif"}</p><p className="mt-1 text-xs text-neutral-500">Un compte en pause ne peut plus entrer dans l’entreprise, mais reste facturé pour le mois. La fermeture conserve l’historique.</p><div className="mt-3 flex flex-wrap gap-2">{employe.compte_application_statut!=="actif"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"actif")}><button className="rounded bg-green-700 px-3 py-2 text-sm text-white">Réactiver</button></form>}{employe.compte_application_statut!=="pause"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"pause")}><button className="rounded border px-3 py-2 text-sm">Mettre en pause</button></form>}{employe.compte_application_statut!=="ferme"&&<form action={changerStatutCompteApplicationAction.bind(null,id,"ferme")}><ConfirmSubmitButton message="Fermer l’accès de ce compte ? Le mois entamé restera facturé." className="rounded border border-red-400 px-3 py-2 text-sm text-red-700">Fermer le compte</ConfirmSubmitButton></form>}</div></div>}
          {employe.utilisateur_id&&<div className="rounded-md border bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Appareils enregistrés</p><p className="text-xs text-neutral-500">Deux appareils sont inclus par compte. Au-delà, le compte est facturé comme un employé supplémentaire au tarif mensuel de son poste. Révoquez les anciens appareils inutilisés.</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${(appareils??[]).filter(a=>!a.revoque_at).length>2?"bg-red-100 text-red-800":"bg-green-100 text-green-800"}`}>{(appareils??[]).filter(a=>!a.revoque_at).length} actif(s)</span></div><div className="mt-3 space-y-2">{(appareils??[]).map(appareil=><div key={appareil.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm ${appareil.revoque_at?"opacity-50":""}`}><div><strong>{appareil.nom_appareil}</strong><p className="text-xs text-neutral-500">{appareil.type_appareil} · {appareil.application_installee?"application installée":"navigateur"} · dernière activité {new Date(appareil.derniere_activite_at).toLocaleString("fr-FR")}</p></div>{!appareil.revoque_at&&<form action={revoquerAppareilEmployeAction.bind(null,id,appareil.id)}><ConfirmSubmitButton message="Révoquer cet appareil ? Il sera réenregistré lors d’une prochaine connexion sur cet appareil." className="text-xs text-red-700">Révoquer</ConfirmSubmitButton></form>}</div>)}{!(appareils??[]).length&&<p className="text-xs text-neutral-500">Aucun appareil enregistré pour l’instant.</p>}</div></div>}
        </section>

        <section className="space-y-4 rounded-md border p-4 dark:border-neutral-800">
          <div><h2 className="font-semibold">Identification stock et QR employé</h2><p className="text-sm text-neutral-500">L’employé crée lui-même son mot de passe stock depuis « Mon espace ». L’administrateur peut seulement le réinitialiser ; il n’est jamais affiché ni conservé en clair.</p></div>
          <div className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${employe.code_stock_active ? "bg-green-600" : "bg-neutral-300"}`} /><strong>{employe.code_stock_active ? "Accès personnel actif" : "Mot de passe stock à créer"}</strong></div>
          <p className="rounded bg-neutral-50 p-3 font-mono text-sm dark:bg-neutral-900">Identifiant à saisir au dépôt : {employe.identifiant_interne ?? employe.reference_interne}</p>
          {employe.code_stock_active && <form action={reinitialiserMotDePasseStockEmployeAction.bind(null, id)}><ConfirmSubmitButton message="Réinitialiser l’accès stock ? L’employé devra créer un nouveau mot de passe depuis Mon espace." className="text-sm text-red-700">Réinitialiser le mot de passe stock</ConfirmSubmitButton></form>}
        </section></>}

        {codeIdentification && <IdentificationCodeCard id={codeIdentification.id} code={codeIdentification.code} label="QR code de la fiche employé" />}

        <section className="space-y-4 rounded-md border border-[#c9a24a]/50 bg-[#c9a24a]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Carte professionnelle BTP</h2><p className="text-sm text-neutral-500">Copie numérique privée à présenter rapidement en cas de contrôle. Le document original reste la référence officielle.</p></div><Link href={`/employes/${id}/carte`} className="rounded-md border border-[#0d1b2a] px-3 py-1.5 text-sm font-medium">Badge & habilitations →</Link></div>
          {peutGerer&&<>
          {employe.carte_btp_storage_path?<div className="grid gap-4 sm:grid-cols-[220px_1fr]"><a href={`/api/employes/${id}/carte-btp`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border bg-white"><div className="flex h-36 items-center justify-center">{employe.carte_btp_mime_type?.startsWith("image/")?<Image src={`/api/employes/${id}/carte-btp`} alt={`Carte BTP de ${nomEmploye(employe)}`} width={220} height={144} unoptimized className="h-36 w-full object-contain"/>:<span className="text-center text-sm font-medium">📄<br/>Ouvrir la carte BTP PDF</span>}</div></a><div className="space-y-2 text-sm"><p><span className="text-neutral-500">Fichier :</span> {employe.carte_btp_nom}</p>{employe.carte_btp_numero&&<p><span className="text-neutral-500">N° de carte :</span> <span className="font-mono">{employe.carte_btp_numero}</span></p>}{employe.carte_btp_expiration&&<p><span className="text-neutral-500">Expiration :</span> {formatDateFr(employe.carte_btp_expiration)}</p>}<div className="flex gap-3"><a href={`/api/employes/${id}/carte-btp`} target="_blank" rel="noreferrer" className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-medium text-white">Présenter la carte</a><a href={`/api/employes/${id}/carte-btp?download=1`} className="rounded-md border px-3 py-2 text-sm">Télécharger</a></div><form action={supprimerCarte}><ConfirmSubmitButton message="Supprimer la copie numérique de cette carte BTP ?" className="text-xs text-red-600">Supprimer la carte</ConfirmSubmitButton></form></div></div>:<p className="rounded border border-dashed p-4 text-sm text-neutral-500">Aucune carte BTP enregistrée.</p>}
          <form action={importerCarte} className="grid gap-3 border-t pt-4 sm:grid-cols-2"><label className="text-xs text-neutral-500 sm:col-span-2">Importer ou remplacer la carte<input name="carte_btp" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" required className="mt-1 block w-full rounded border px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-500">Numéro de carte <span className="font-normal">(facultatif)</span><input name="carte_btp_numero" defaultValue={employe.carte_btp_numero??""} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-500">Date d’expiration <span className="font-normal">(facultatif)</span><input name="carte_btp_expiration" type="date" defaultValue={employe.carte_btp_expiration??""} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2">Enregistrer la carte BTP</button></form>
          </>}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Chantiers suivis</h2>
          {!equipesChantiers || equipesChantiers.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun chantier actuellement affecté.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <tbody>
                  {equipesChantiers.map((affectation) => {const chantier=Array.isArray(affectation.chantier)?affectation.chantier[0]:affectation.chantier;return chantier&&(
                    <tr key={`${chantier.id}-${affectation.role_chantier}`} className="border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{chantier.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/chantiers/${chantier.id}`} className="font-medium hover:underline">{chantier.nom}</Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{roleChantier(affectation.role_chantier).libelle} · {chantier.ville ?? "—"}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Planning à venir</h2><Link href="/planning" className="text-xs font-medium text-blue-700 hover:underline">Ouvrir le planning →</Link></div>
          {!planningAVenir || planningAVenir.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune affectation à venir.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {planningAVenir.map((ligne) => {
                const chantier = Array.isArray(ligne.chantier) ? ligne.chantier[0] : ligne.chantier;
                return (
                  <article key={ligne.id} className="rounded-md border p-3 text-sm">
                    <p className="text-xs text-neutral-500">{formatDateFr(ligne.date)} · {Number(ligne.heures)} h</p>
                    <p className="font-medium">{chantier?.nom ?? LIBELLES_TYPE_ACTIVITE[ligne.type_activite] ?? "Activité interne"}</p>
                    {ligne.lieu_activite && <p className="text-neutral-600 dark:text-neutral-400">{ligne.lieu_activite} · <a href={lienMaps(ligne.lieu_activite)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">Itinéraire</a></p>}
                    {ligne.tache && <p className="text-neutral-600 dark:text-neutral-400">{ligne.tache}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-md border border-red-200 p-4 dark:border-red-900/50">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Effacement des données (RGPD)</h2>
          {employe.anonymise_at ? (
            <p className="mt-2 text-xs text-neutral-500">
              Ce salarié a été anonymisé le {new Date(employe.anonymise_at).toLocaleDateString("fr-FR")}. Son identité et ses
              coordonnées ont été effacées ; les éléments légalement obligatoires ont été conservés.
            </p>
          ) : (
            <>
              <p className="mt-2 text-xs text-neutral-500">
                Efface définitivement l&apos;identité et les coordonnées de ce salarié (nom, contact,
                photo, signature, documents personnels). Les heures travaillées, la paie et la
                comptabilité sont conservées, comme la loi l&apos;impose. Action irréversible.
              </p>
              <form action={anonymiserEmployeAction} className="mt-3">
                <input type="hidden" name="employe_id" value={employe.id} />
                <ConfirmSubmitButton
                  message="Anonymiser ce salarié ? Son identité et ses coordonnées seront effacées définitivement."
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
                >
                  Anonymiser ce salarié
                </ConfirmSubmitButton>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
