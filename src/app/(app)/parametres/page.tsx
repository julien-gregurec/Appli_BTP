import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { modifierEntrepriseAction, modifierLogoEntrepriseAction } from "@/app/actions/entreprise";
import Link from "next/link";
import Image from "next/image";
import { permissionsUtilisateur } from "@/lib/permissions";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function ParametresPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererAcces = permissions === null || permissions.includes("gerer_utilisateurs");
  const { data: entreprise } = await supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single();

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between"><div><h1 className="text-xl font-semibold">Paramètres de l’entreprise</h1><p className="text-sm text-neutral-500">Ces informations apparaissent notamment sur les devis et factures.</p></div><div className="flex gap-2">{peutGererAcces&&<Link href="/parametres/import" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Importer des données</Link>}{peutGererAcces&&<Link href="/parametres/acces" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Accès et rôles</Link>}</div></div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Paramètres enregistrés.</p>}
        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><h2 className="text-sm font-semibold">Logo de l’entreprise</h2><div className="mt-3 flex items-center gap-5"><Image src={entreprise?.logo_url||"/liria-concept-logo.png"} alt="Logo actuel" width={144} height={80} unoptimized className="h-20 w-36 rounded border bg-white object-contain p-2"/><form action={modifierLogoEntrepriseAction} className="flex-1" encType="multipart/form-data"><label className="block text-xs text-neutral-500">Nouveau logo (PNG, JPG ou WebP · 5 Mo max.)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-2 block w-full rounded-md border px-3 py-2 text-sm"/></label><button className="mt-3 rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Importer ce logo</button></form></div><p className="mt-2 text-xs text-neutral-500">Le logo est utilisé immédiatement dans le logiciel, les devis et les factures.</p></section>
        <form action={modifierEntrepriseAction} className="space-y-6">
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Identité et adresse</h2>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">Nom affiché *</label><input name="nom" required defaultValue={entreprise?.nom ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Raison sociale</label><input name="raison_sociale" defaultValue={entreprise?.raison_sociale ?? ""} className={input} /></div></div>
            <div><label className="text-xs text-neutral-500">SIRET</label><input name="siret" defaultValue={entreprise?.siret ?? ""} className={input} /></div>
            <div><label className="text-xs text-neutral-500">Adresse</label><input name="adresse" defaultValue={entreprise?.adresse ?? ""} className={input} /></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">Code postal</label><input name="code_postal" defaultValue={entreprise?.code_postal ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Ville</label><input name="ville" defaultValue={entreprise?.ville ?? ""} className={input} /></div></div>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div><h2 className="text-sm font-semibold">Identifiants des salariés</h2><p className="text-xs text-neutral-500">Cet identifiant est affiché sur la fiche du salarié et sert à s’identifier sur la borne du dépôt. Le numéro d’invitation à l’application reste séparé et privé.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="text-xs text-neutral-500">Format</label><select name="mode_identifiant_employe" defaultValue={entreprise?.mode_identifiant_employe??"reference_interne"} className={input}><option value="reference_interne">Référence interne existante — EMP-0001</option><option value="prefixe_4_chiffres">Préfixe personnalisé + 4 chiffres</option></select></div>
              <div><label className="text-xs text-neutral-500">Préfixe personnalisé</label><input name="prefixe_identifiant_employe" minLength={2} maxLength={8} pattern="[A-Za-z0-9]{2,8}" defaultValue={entreprise?.prefixe_identifiant_employe??"EMP"} placeholder="Ex. LIR" className={`${input} uppercase`}/><p className="mt-1 text-[11px] text-neutral-500">Exemple : LIR-0001. Lettres et chiffres uniquement.</p></div>
            </div>
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Un changement de format renumérote les identifiants visibles des salariés. Les comptes et historiques ne sont pas modifiés.</p>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Assurances et mentions légales</h2>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">N° assurance décennale</label><input name="assurance_decennale_numero" defaultValue={entreprise?.assurance_decennale_numero ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Assureur décennale</label><input name="assurance_decennale_assureur" defaultValue={entreprise?.assurance_decennale_assureur ?? ""} className={input} /></div></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">N° assurance RC Pro</label><input name="assurance_rc_pro_numero" defaultValue={entreprise?.assurance_rc_pro_numero ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Pénalités de retard (%)</label><input name="taux_penalites_retard" type="number" min="0" step="0.01" defaultValue={entreprise?.taux_penalites_retard ?? ""} className={input} /></div></div>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Personnalisation des documents</h2>
            <p className="text-xs text-neutral-500">Ces réglages sont destinés aux changements occasionnels de charte. Ils s’appliquent aux devis, factures et commandes.</p>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="text-xs text-neutral-500">Police</label><select name="police_documents" defaultValue={entreprise?.police_documents??"arial"} className={input}><option value="arial">Arial — sobre</option><option value="trebuchet">Trebuchet — moderne</option><option value="verdana">Verdana — lisible</option><option value="georgia">Georgia — classique</option></select></div><div><label className="text-xs text-neutral-500">Mise en page</label><select name="mise_en_page_documents" defaultValue={entreprise?.mise_en_page_documents??"classique"} className={input}><option value="classique">Classique</option><option value="compacte">Compacte</option><option value="epuree">Épurée</option></select></div><div><label className="text-xs text-neutral-500">Taille du texte</label><input name="taille_police_documents" type="number" min="10" max="16" defaultValue={entreprise?.taille_police_documents??13} className={input}/></div><div><label className="text-xs text-neutral-500">Largeur du logo (px)</label><input name="logo_largeur_documents" type="number" min="60" max="180" defaultValue={entreprise?.logo_largeur_documents??105} className={input}/></div><div><label className="text-xs text-neutral-500">Couleur principale</label><input name="couleur_documents" type="color" defaultValue={entreprise?.couleur_documents??"#0d1b2a"} className={`${input} h-10`}/></div></div>
            <div><label className="text-xs text-neutral-500">Texte d’en-tête</label><textarea name="texte_entete" rows={3} defaultValue={entreprise?.texte_entete ?? ""} className={input} /></div>
            <div><label className="text-xs text-neutral-500">Texte de pied de page</label><textarea name="texte_pied_page" rows={3} defaultValue={entreprise?.texte_pied_page ?? ""} className={input} /></div>
          </section>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer les paramètres</button>
        </form>
      </div>
    </main>
  );
}
