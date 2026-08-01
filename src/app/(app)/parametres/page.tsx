import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { modifierEntrepriseAction, modifierLogoEntrepriseAction } from "@/app/actions/entreprise";
import Link from "next/link";
import Image from "next/image";
import { permissionsUtilisateur } from "@/lib/permissions";
import { DocumentTemplatePreview } from "@/components/DocumentTemplatePreview";
import { prefixeIdentifiantEntreprise } from "@/lib/identifiants";
import { DashboardWidgetPreferences } from "@/components/DashboardWidgets";
import { BrandWordmark } from "@/components/BrandWordmark";
import { PRODUCT_NAME } from "@/lib/brand";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function ParametresPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererAcces = permissions === null || permissions.includes("gerer_utilisateurs");
  const { data: entreprise } = await supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single();
  const prefixeIdentifiant = entreprise?.prefixe_identifiant_employe ?? prefixeIdentifiantEntreprise(entreprise?.nom ?? "");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between"><div><h1 className="text-xl font-semibold">Paramètres de l’entreprise</h1><p className="text-sm text-neutral-500">Ces informations apparaissent notamment sur les devis et factures.</p></div><div className="flex flex-wrap justify-end gap-2">{peutGererAcces&&<Link href="/parametres/import" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Importer des données</Link>}{peutGererAcces&&<Link href="/parametres/acces" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Accès et rôles</Link>}<Link href="/parametres/notifications" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Notifications</Link><Link href="/parametres/donnees" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Mes données</Link><Link href="/parametres/version" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Version</Link></div></div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Paramètres enregistrés.</p>}
        <DashboardWidgetPreferences />
        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><h2 className="text-sm font-semibold">Logo de l’entreprise</h2><div className="mt-3 flex items-center gap-5">{entreprise?.logo_url?<Image src={entreprise.logo_url} alt="Logo actuel" width={144} height={80} unoptimized className="h-20 w-36 rounded border bg-white object-contain p-2"/>:<div className="flex h-20 w-36 items-center justify-center rounded border bg-white p-2"><BrandWordmark className="text-sm text-[#0d1b2a]"/></div>}<form action={modifierLogoEntrepriseAction} className="flex-1"><label className="block text-xs text-neutral-500">Nouveau logo (PNG, JPG ou WebP · 5 Mo max.)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-2 block w-full rounded-md border px-3 py-2 text-sm"/></label><button className="mt-3 rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">Importer ce logo</button></form></div><p className="mt-2 text-xs text-neutral-500">Le logo de votre entreprise apparaît dans son encart, sur les devis et sur les factures. L’identité du logiciel reste toujours {PRODUCT_NAME}.</p></section>
        <form action={modifierEntrepriseAction} className="space-y-6">
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Identité et adresse</h2>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">Nom affiché *</label><input name="nom" required defaultValue={entreprise?.nom ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Raison sociale</label><input name="raison_sociale" defaultValue={entreprise?.raison_sociale ?? ""} className={input} /></div></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">Forme juridique</label><input name="forme_juridique" defaultValue={entreprise?.forme_juridique ?? ""} placeholder="Ex. SAS, SARL, EI" className={input} /></div><div><label className="text-xs text-neutral-500">SIRET</label><input name="siret" inputMode="numeric" pattern="[0-9 ]{14,17}" defaultValue={entreprise?.siret ?? ""} className={input} /></div></div>
            <div><label className="text-xs text-neutral-500">Adresse</label><input name="adresse" defaultValue={entreprise?.adresse ?? ""} className={input} /></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">Code postal</label><input name="code_postal" defaultValue={entreprise?.code_postal ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Ville</label><input name="ville" defaultValue={entreprise?.ville ?? ""} className={input} /></div></div>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div><h2 className="text-sm font-semibold">Identifiants des salariés</h2><p className="text-xs text-neutral-500">Cet identifiant est affiché sur la fiche du salarié et sert à s’identifier sur la borne du dépôt. Le numéro d’invitation à l’application reste séparé et privé.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="text-xs text-neutral-500">Format</label><select name="mode_identifiant_employe" defaultValue={entreprise?.mode_identifiant_employe??"prefixe_4_chiffres"} className={input}><option value="reference_interne">Référence interne existante</option><option value="prefixe_4_chiffres">3 lettres de l’entreprise + 4 chiffres</option></select></div>
              <div><label className="text-xs text-neutral-500">Préfixe du dépôt</label><input name="prefixe_identifiant_employe" minLength={2} maxLength={8} pattern="[A-Za-z0-9]{2,8}" defaultValue={prefixeIdentifiant} placeholder="Ex. LIR" className={`${input} uppercase`}/><p className="mt-1 text-[11px] text-neutral-500">Par défaut : trois premières lettres du nom de l’entreprise, sans accent. Exemple : {prefixeIdentifiant}-0001. Le préfixe reste modifiable.</p></div>
            </div>
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Un changement de format renumérote les identifiants visibles des salariés. Les comptes et historiques ne sont pas modifiés.</p>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Assurances et mentions légales</h2>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">N° assurance décennale</label><input name="assurance_decennale_numero" defaultValue={entreprise?.assurance_decennale_numero ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Assureur décennale</label><input name="assurance_decennale_assureur" defaultValue={entreprise?.assurance_decennale_assureur ?? ""} className={input} /></div></div>
            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-neutral-500">N° assurance RC Pro</label><input name="assurance_rc_pro_numero" defaultValue={entreprise?.assurance_rc_pro_numero ?? ""} className={input} /></div><div><label className="text-xs text-neutral-500">Pénalités de retard (%)</label><input name="taux_penalites_retard" type="number" min="0" step="0.01" defaultValue={entreprise?.taux_penalites_retard ?? ""} className={input} /></div></div>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div><h2 className="text-sm font-semibold">Horaires de travail et contrôle des pointages</h2><p className="text-xs text-neutral-500">Ces durées servent à distinguer les heures normales, les écarts et les heures supplémentaires. Chaque pointage reste soumis à validation.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"].map((jour,index)=><label key={jour} className="text-xs text-neutral-500">{jour}<input name={`heures_jour_${index+1}`} type="number" min="0" max="24" step="0.25" defaultValue={entreprise?.horaires_journaliers?.[String(index+1)]??(index<4?8:index===4?7:0)} className={`${input} mt-1`}/></label>)}</div><label className="block text-xs text-neutral-500">Alerter à partir d’un écart de<input name="seuil_ecart_pointage" type="number" min="0" max="8" step="0.25" defaultValue={entreprise?.seuil_ecart_pointage??0.25} className={`${input} mt-1 max-w-xs`}/><span className="mt-1 block">Toute durée supérieure à 12 h passe en vérification renforcée ; à partir de 15 h, l’alerte devient critique.</span></label></section>

          <section id="grands-deplacements" className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div><h2 className="text-sm font-semibold">Grands déplacements</h2><p className="text-xs text-neutral-500">Choisissez la méthode utilisée pour préparer les budgets de mission. Chaque dépense reste justifiée et validée dans les notes de frais.</p></div>
            <label className="block text-xs text-neutral-500">Mode de calcul
              <select name="mode_grand_deplacement" defaultValue={entreprise?.mode_grand_deplacement??"frais_reels"} className={`${input} mt-1`}>
                <option value="frais_reels">Frais réels — justificatifs et budget manuel</option>
                <option value="forfait_urssaf">Forfait indicatif URSSAF 2026</option>
              </select>
            </label>
            <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"><strong>Barème intégré 2026 :</strong> pendant les trois premiers mois, 21,40 € par repas ; hébergement et petit-déjeuner 76,60 € à Paris/92/93/94 ou 56,80 € ailleurs. Les taux réduits des mois 4 à 24 puis 25 à 72 sont appliqués automatiquement selon la date initiale de la mission.</div>
            <p className="text-xs text-amber-800">Ce calcul est une aide de gestion et ne constitue pas une validation sociale ou fiscale. Les conditions du grand déplacement et les justificatifs doivent être contrôlés avec le conseil comptable de l’entreprise.</p>
          </section>

          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div><h2 className="text-sm font-semibold">Frais de route (petit déplacement)</h2><p className="text-xs text-neutral-500">Calcule automatiquement panier/trajet/transport selon la zone de distance du chantier (barèmes définis dans Paie → Paramètres → Zones BTP), pour chaque jour pointé et validé.</p></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="petit_deplacement_automatique" defaultChecked={entreprise?.petit_deplacement_automatique===true} />
              Activer le calcul automatique
            </label>
            <p className="text-xs text-neutral-500">Nécessite que chaque chantier concerné ait sa distance au siège renseignée (fiche chantier → Position GPS).</p>
          </section>

          <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold">Suivi de zone chantier</h2>
              <p className="text-xs text-neutral-500">Pendant qu’un salarié est pointé (entre l’arrivée et le départ), sa position est vérifiée régulièrement pour s’assurer qu’il reste sur le chantier. Le salarié est informé de ce suivi dans l’application. Nécessite les coordonnées GPS renseignées sur chaque chantier.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="suivi_zone_actif" defaultChecked={entreprise?.suivi_zone_actif===true} />
              Activer le suivi de zone
            </label>
            <label className="block text-xs text-neutral-500">Fréquence de vérification
              <select name="suivi_zone_frequence_minutes" defaultValue={entreprise?.suivi_zone_frequence_minutes??30} className={`${input} mt-1 max-w-xs`}>
                <option value="15">Toutes les 15 minutes</option>
                <option value="30">Toutes les 30 minutes</option>
                <option value="60">Toutes les heures</option>
                <option value="120">Toutes les 2 heures</option>
              </select>
            </label>
          </section>
          <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Personnalisation des documents</h2>
            <p className="text-xs text-neutral-500">Choisissez un modèle puis adaptez-le à la charte de l’entreprise. Le rendu s’applique aux devis, factures et commandes.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([{id:"classique",nom:"Classique",detail:"Sobre et polyvalent"},{id:"moderne",nom:"Moderne",detail:"En-tête coloré et dynamique"},{id:"elegante",nom:"Élégant",detail:"Centré, lignes fines"},{id:"technique",nom:"Technique",detail:"Tableau structuré et alterné"},{id:"compacte",nom:"Compact",detail:"Plus de lignes par page"},{id:"epuree",nom:"Épuré",detail:"Minimal et léger"}] as const).map(modele=><label key={modele.id} className="group relative cursor-pointer rounded-lg border p-3 transition hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-md focus-within:ring-2 focus-within:ring-[#c9a24a] has-[:checked]:border-[#c9a24a] has-[:checked]:bg-[#c9a24a]/10 has-[:checked]:shadow-md"><input type="radio" name="mise_en_page_documents" value={modele.id} defaultChecked={(entreprise?.mise_en_page_documents??"classique")===modele.id} className="absolute right-3 top-3 z-10 accent-[#c9a24a]"/><span className="block pr-7 font-semibold">{modele.nom}</span><span className="text-xs text-neutral-500">{modele.detail}</span><div className="mt-3"><DocumentTemplatePreview modele={modele.id} couleurPrincipale={entreprise?.couleur_documents} couleurAccent={entreprise?.couleur_secondaire_documents}/></div></label>)}</div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="text-xs text-neutral-500">Police</label><select name="police_documents" defaultValue={entreprise?.police_documents??"arial"} className={input}><option value="arial">Arial — sobre</option><option value="trebuchet">Trebuchet — moderne</option><option value="verdana">Verdana — lisible</option><option value="georgia">Georgia — classique</option></select></div><div><label className="text-xs text-neutral-500">Position du logo</label><select name="position_logo_documents" defaultValue={entreprise?.position_logo_documents??"gauche"} className={input}><option value="gauche">À gauche</option><option value="centre">Centré</option><option value="droite">À droite</option></select></div><div><label className="text-xs text-neutral-500">Taille du texte</label><input name="taille_police_documents" type="number" min="10" max="16" defaultValue={entreprise?.taille_police_documents??13} className={input}/></div><div><label className="text-xs text-neutral-500">Largeur du logo (px)</label><input name="logo_largeur_documents" type="number" min="60" max="180" defaultValue={entreprise?.logo_largeur_documents??105} className={input}/></div><div><label className="text-xs text-neutral-500">Couleur principale</label><input name="couleur_documents" type="color" defaultValue={entreprise?.couleur_documents??"#0d1b2a"} className={`${input} h-10`}/></div><div><label className="text-xs text-neutral-500">Couleur d’accent</label><input name="couleur_secondaire_documents" type="color" defaultValue={entreprise?.couleur_secondaire_documents??"#c9a24a"} className={`${input} h-10`}/></div></div>
            <div className="flex flex-wrap gap-4 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900"><label className="flex items-center gap-2"><input name="afficher_logo_documents" type="checkbox" defaultChecked={entreprise?.afficher_logo_documents!==false}/>Afficher le logo</label><label className="flex items-center gap-2"><input name="afficher_descriptions_documents" type="checkbox" defaultChecked={entreprise?.afficher_descriptions_documents!==false}/>Afficher les descriptions</label><label className="flex items-center gap-2"><input name="afficher_tva_lignes_documents" type="checkbox" defaultChecked={entreprise?.afficher_tva_lignes_documents!==false}/>Afficher la TVA par ligne</label></div>
            <div><label className="text-xs text-neutral-500">Texte d’en-tête</label><textarea name="texte_entete" rows={3} defaultValue={entreprise?.texte_entete ?? ""} className={input} /></div>
            <div><label className="text-xs text-neutral-500">Texte de pied de page</label><textarea name="texte_pied_page" rows={3} defaultValue={entreprise?.texte_pied_page ?? ""} className={input} /></div>
          </section>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer les paramètres</button>
        </form>
      </div>
    </main>
  );
}
