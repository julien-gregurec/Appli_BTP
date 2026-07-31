# Audit de changement de nom commercial

## 1. Date de l'audit

31 juillet 2026.

## 2. Worktree, branche et commit analysés

- Worktree : `/Users/juliengregurec/Projects/liria-claude`
- Branche : `claude/developpement-parallele`
- Commit de base : `e8bb1a1` (HEAD au moment de l'audit ; identique à `main` pour le code applicatif, ce worktree n'ajoute que de la documentation par-dessus)

## 3. Méthode utilisée

Audit strictement en lecture seule. Aucune modification, aucun remplacement automatique.

- Recherche insensible à la casse de `liria` dans tout le contenu du dépôt (`grep -rIn -i "liria"`), hors `node_modules/`, `.git/`, `.next/`, `dist/`, `build/`.
- Recherche séparée des noms de fichiers et de dossiers contenant `liria` (`find -iname "*liria*"`), pour couvrir les fichiers binaires (images, PDF, vidéos) invisibles à une recherche de contenu.
- Recherche ciblée complémentaire : adresses e-mail (`@[a-z0-9.-]+\.[a-z]{2,}`), URL Vercel (`*.vercel.app`), variables d'environnement (`LIRIA_[A-Z_]+`), classes et variables CSS (`bg|text|border-liria-*`, `--liria-*`), pour les formes qui n'apparaissent pas littéralement comme le mot « Liria » à l'identique.
- Lecture du contenu exact de chaque fichier identifié pour distinguer un simple commentaire, une donnée réellement stockée en base, un identifiant technique, ou un texte visible par un utilisateur final.
- Vérification croisée : `package.json` (nom du paquet), `git remote -v` (dépôt GitHub), `supabase/config.toml` (identifiant de projet local), fichiers Sentry (`sentry.*.config.ts`), `.env.local.example` (variables d'environnement types).
- Aucune connexion à un service externe (Vercel, Supabase hébergé, Stripe, Sentry, OpenAI) n'a été effectuée : ce qui s'y trouve réellement (noms de projet, noms de produits, organisations) n'a pas pu être vérifié depuis ce dépôt — voir catégorie « impossible à confirmer sans accès au service ».

## 4. Légende des catégories

| Catégorie | Signification |
|---|---|
| À remplacer obligatoirement | Visible par un utilisateur final (interface, e-mail, document généré, notification) ou bloquant pour l'identité du produit. |
| À remplacer avant commercialisation | Pas nécessairement visible par le client final, mais visible en interne, dans un document destiné à être diffusé (guide, vidéo), ou incohérent si laissé tel quel. |
| Identifiant technique à conserver | Nom de variable, de clé de stockage local, d'événement ou de schéma technique ; renommer n'apporte rien et peut casser une compatibilité locale sans bénéfice. |
| Migration historique à ne pas modifier | Fichier de migration SQL déjà appliqué : ne jamais éditer un fichier de migration existant, corriger uniquement par une nouvelle migration si une donnée réelle doit changer. |
| Donnée de test | Valeur utilisée uniquement dans un test automatisé ou un jeu de données de démonstration, sans impact client. |
| Visuel à régénérer | Logo, icône, image, vidéo ou PDF : ne se corrige pas par un remplacement de texte, nécessite une nouvelle génération du fichier. |
| Document juridique | CGU, CGV, mentions légales, politique de confidentialité/cookies, DPA : le nom y est un terme contractuel défini, à traiter avec la même rigueur qu'une révision de contrat. |
| Compte externe à renommer manuellement | Paramètre d'un service tiers (Vercel, Stripe, etc.) qui ne se change pas depuis ce dépôt. |
| Impossible à confirmer sans accès au service | Existence ou contenu non vérifiable depuis le code seul (tableau de bord d'un service tiers). |

## 5. Tableau des occurrences

*Les décomptes d'occurrences correspondent au nombre de lignes contenant « liria » (insensible à la casse), pas au nombre d'apparitions du mot (une ligne peut en contenir plusieurs). Détail ligne par ligne disponible en rejouant les commandes de la section 3.*

| Emplacement | Occurrence | Catégorie | Action | Risque | Charge estimée |
|---|---|---|---|---|---|
| `src/app/layout.tsx` | `title`, `description`, `applicationName`, `appleWebApp.title` = « Liria Gestion Pro V3 » (7 lignes) | À remplacer obligatoirement | Remplacer les métadonnées Next.js par le nouveau nom | Faible | 15 min |
| `src/app/manifest.ts` | `name`, `short_name`, chemins d'icônes du manifest PWA (5 lignes) | À remplacer obligatoirement | Remplacer nom PWA + pointer vers les nouvelles icônes | Moyen (dépend des nouveaux visuels) | 20 min |
| `src/app/page.tsx` | Titre de page, logo + alt, texte d'accroche affiché (4 lignes) | À remplacer obligatoirement | Remplacer texte et chemin logo | Faible | 20 min |
| `public/sw.js` | Commentaire d'en-tête, `VERSION = "liria-v3"` (cache), chemins d'icônes, titre de notification push par défaut (7 lignes) | À remplacer obligatoirement | Renommer + changer la version de cache (invalidation normale au déploiement) | Moyen (service worker, cache navigateur) | 20 min |
| `src/components/Sidebar.tsx` | Logo + libellé « LIRIA GESTION PRO » dans la barre latérale, lien vers le guide PDF (5 lignes) | À remplacer obligatoirement | Remplacer texte, logo, lien du guide | Faible | 15 min |
| `src/components/ApercuPoste.tsx` | Mini barre latérale simulée dans l'aperçu de poste (« LIRIA GESTION PRO ») (2 lignes) | À remplacer obligatoirement | Miroir de `Sidebar.tsx`, à traiter ensemble | Faible | 10 min |
| `src/components/AssistantIA.tsx` | En-tête du panneau (« ✨ Assistant Liria »), `aria-label`, libellé « Message au support Liria », classes CSS de marque, nom d'événement `liria:ouvrir-assistant` (15 lignes) | À remplacer obligatoirement | Textes visibles à remplacer ; nom d'événement technique traité séparément (voir §8) | Moyen (fichier central du chat IA) | 30 min |
| `src/components/BriefingMatin.tsx` | Bloc d'accueil matin, déclenche l'événement `liria:ouvrir-assistant`, classes CSS de marque (3 lignes) | À remplacer obligatoirement (texte) / identifiant technique à conserver (événement) | Vérifier la cohérence avec `AssistantIA.tsx` pour l'événement | Faible | 10 min |
| `src/components/PiedLegal.tsx` | Pied de page « © {année} Liria Gestion Pro » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/components/DocumentImprimable.tsx`, `src/app/imprimer/doe/[id]/page.tsx`, `src/app/imprimer/paie/[id]/page.tsx` | Logo par défaut sur devis/factures imprimés, DOE, relevé de paie ; mention « Généré par Liria Gestion Pro » (3 lignes) | À remplacer obligatoirement | Remplacer chemin logo + mention ; documents remis aux clients | Moyen (documents commerciaux) | 20 min |
| `src/app/(app)/parametres/page.tsx` | Logo par défaut de l'entreprise + phrase « L'identité du logiciel reste toujours Liria Gestion Pro » | À remplacer obligatoirement | Remplacer texte et chemin logo par défaut | Faible | 10 min |
| `src/app/login/page.tsx` | Logo + `alt` sur l'écran de connexion | À remplacer obligatoirement | Remplacer chemin logo | Faible | 5 min |
| `src/app/(app)/boutique/page.tsx`, `src/app/(app)/plateforme/boutique/page.tsx`, `src/lib/navigation.ts`, `src/lib/stripe-boutique.ts` | Titre « Boutique Liria », libellé de menu « Boutique Liria », message d'erreur boutique (5 lignes au total) | À remplacer obligatoirement | Remplacer libellés visibles côté client et back-office | Faible | 15 min |
| `src/app/(app)/connecteurs/page.tsx` | Encart sécurité : « Liria Gestion Pro n'enregistre jamais le mot de passe… » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/(app)/depenses/[id]/page.tsx` | « Enregistrer un paiement effectué hors Liria », « Les virements initiés dans Liria sont… » (2 lignes) | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/(app)/paiements-bancaires/page.tsx` | « Liria prépare les ordres. La banque exige ensuite… » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/(app)/parametres/import/page.tsx` | « Liria reconnaît les intitulés courants… » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/(app)/parametres/notifications/page.tsx` | « …même Liria fermé » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/(app)/pointage/gestion/page.tsx` | « …tant que la page Liria reste ouverte » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/components/SuiviZoneChantier.tsx` | « Gardez Liria ouverte en arrière-plan… », clé de stockage local `liria:gps:*` (3 lignes) | À remplacer obligatoirement (texte) / identifiant technique à conserver (clé de stockage) | Séparer le texte affiché (à remplacer) de la clé technique (à conserver, voir §8) | Faible | 10 min |
| `src/components/StockKioskForm.tsx` | « …préfixe sécurisé du QR Liria » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/components/InvitationEmploye.tsx`, `src/components/InvitationEntreprise.tsx` | Texte des invitations envoyées par SMS/partage à de vraies personnes (« … sur Liria Gestion Pro… ») (3 lignes) | À remplacer obligatoirement | Remplacer texte — impact direct sur des messages envoyés à des tiers | Moyen (communication externe) | 15 min |
| `src/app/onboarding/besoins/page.tsx`, `src/app/onboarding/demarrage/page.tsx` | « La tarification définitive vous sera confirmée par LIRIA », en-tête « Liria Gestion Pro V3 », lien guide PDF (3 lignes) | À remplacer obligatoirement | Remplacer texte et lien | Faible | 10 min |
| `src/app/offline/page.tsx` | Titre de page + texte « Liria Gestion Pro a besoin d'une connexion… » (2 lignes) | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/paiement/succes/page.tsx`, `src/app/paiement/annule/page.tsx`, `src/app/paiement/abonnement/succes/page.tsx` | Lien de retour « Retour à Liria Gestion Pro » (3 lignes) | À remplacer obligatoirement | Remplacer texte | Faible | 10 min |
| `src/app/actions/abonnement.ts` | Message d'erreur redirigé « Contactez Liria Gestion Pro » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/actions/suite-metier.ts` | « Le portail peut être ouvert depuis Liria Gestion Pro… » | À remplacer obligatoirement | Remplacer texte | Faible | 5 min |
| `src/app/api/rgpd/export/route.ts` | Nom de fichier téléchargé `export-donnees-liria-{date}.json` | À remplacer obligatoirement | Renommer le gabarit de nom de fichier RGPD | Faible | 5 min |
| `src/app/(app)/plateforme/page.tsx`, `src/app/(app)/plateforme/support/page.tsx`, `src/app/actions/plateforme.ts`, `supabase/migrations/20260714000072_plateforme_equipe.sql`, `supabase/migrations/20260724000158_plateforme_reinitialisation_mot_de_passe.sql` | « Collaborateurs LIRIA », « Support LIRIA », placeholder `email@liria.fr`, commentaires « admin plateforme (Liria) » (5 lignes, dont 2 migrations = commentaires seuls) | À remplacer obligatoirement (code/UI) / migration historique à ne pas modifier (les 2 fichiers `.sql`) | Remplacer les textes UI ; laisser les commentaires des migrations déjà appliquées tels quels | Faible | 15 min |
| `src/lib/ai/assistant.ts` | Prompt système de l'assistant IA : « Tu es l'assistant intégré de Liria Gestion Pro… », « contacter le support Liria… » (2 lignes) | À remplacer obligatoirement | Le nom apparaît dans les réponses générées par l'IA — priorité haute malgré le faible nombre de lignes | Faible techniquement, **élevé en visibilité** (l'IA peut citer l'ancien nom en conversation) | 15 min |
| `src/lib/ai/copilote.ts` | Descriptions d'outils internes à l'IA mentionnant « support Liria » (4 lignes) | À remplacer avant commercialisation | Ces textes ne sont pas montrés tels quels à l'utilisateur mais influencent ce que l'IA peut reformuler | Faible | 10 min |
| `src/lib/xlsx.ts` | Métadonnée `creator: "Liria Gestion Pro"` des fichiers Excel exportés | À remplacer obligatoirement | Visible dans les propriétés du fichier Excel téléchargé par le client | Faible | 5 min |
| `src/lib/expenses/export.ts` (+ `export.test.ts`) | `schema: "liria-gestion-pro/expense-export/v1"` dans le manifeste d'export des notes de frais | Identifiant technique à conserver | Aucun code ne relit/valide cette valeur (vérifié) ; la changer n'apporte rien et complique la comparaison avec des exports déjà livrés à des comptables — conserver ou verser en `v2` plutôt que renommer à l'identique | Faible si conservé ; moyen si modifié (interopérabilité avec des exports déjà remis) | 0 min (conserver) |
| `src/lib/feature-catalogue.ts` | Commentaire « Catalogue produit Liria Gestion Pro V3 » | À remplacer avant commercialisation | Commentaire de code, sans impact fonctionnel | Faible | 2 min |
| `src/app/globals.css`, `src/components/DicteeCompteRendu.tsx`, `src/components/BriefingMatin.tsx`, `src/components/AnalyseDocumentIA.tsx`, `src/components/AnalyseRentabiliteIA.tsx`, `src/components/PushNotificationsSettings.tsx`, `src/components/DevisEditor.tsx`, `src/components/AssistantIA.tsx` | Variables et classes CSS `--liria-navy`, `--liria-gold`, etc., `bg-liria-navy`, `text-liria-gold`… (8 fichiers, 24 occurrences de classes + déclarations) | Identifiant technique à conserver | Invisible pour l'utilisateur final (jamais affiché comme texte) ; renommage optionnel, à ne faire que dans une passe de nettoyage dédiée, jamais en urgence | Faible (technique) mais effort non négligeable si fait (8 fichiers à toucher ensemble) | 0 min (conserver) — 45 min si renommage décidé plus tard |
| `src/components/AppPresenceTracker.tsx`, `src/components/DashboardWidgets.tsx`, `src/components/MobileModuleGrid.tsx` | Clés `localStorage` (`liria-appareil-id`, `liria-presence-*`, `liria-dashboard-widgets-*`, `liria-dashboard-masques`) (7 lignes au total) | Identifiant technique à conserver | Invisible pour l'utilisateur ; renommer réinitialiserait silencieusement les préférences déjà enregistrées dans le navigateur des utilisateurs existants, sans bénéfice | Faible si conservé ; moyen si renommé (perte de préférences locales) | 0 min (conserver) |
| `next.config.ts`, `src/lib/version.ts` (+ `version.test.ts`), `scripts/audit-application.mjs`, `scripts/capturer-guide.mjs`, `scripts/verification-parcours.mjs`, `scripts/video/enregistrer.mjs`, `scripts/create-liria-videos.py` | Variables d'environnement `LIRIA_APP_VERSION`, `LIRIA_BUILD_*`, `LIRIA_DEPLOYMENT_*`, `LIRIA_AUDIT_*`, `LIRIA_VIDEO_TARGET` (≈ 40 lignes au total) | Identifiant technique à conserver | Renommer exigerait de reconfigurer les variables d'environnement sur Vercel en parallèle du code — risque de rupture au déploiement sans bénéfice utilisateur | Élevé si modifié sans coordination Vercel ; nul si conservé | 0 min (conserver) |
| `.env.local.example` | `VAPID_SUBJECT=mailto:contact@liria-gestion-pro.fr` | À remplacer obligatoirement | Adresse de contact technique des notifications push, à aligner sur le nouveau domaine | Faible (fichier d'exemple, pas de secret réel) | 5 min |
| `src/app/(app)/abonnement/page.tsx`, `src/app/tarifs/page.tsx` | Lien `mailto:contact@liria-gestion-pro.fr`, texte « configuration par Liria » (2 fichiers, 7 lignes) | À remplacer obligatoirement | Remplacer l'adresse e-mail et le texte ; dépend d'une adresse e-mail réellement fonctionnelle sur le nouveau nom | Moyen (adresse de contact client) | 15 min |
| `src/app/(app)/plateforme/page.tsx` | Placeholder de formulaire `email@liria.fr` | À remplacer obligatoirement | Simple exemple affiché dans un champ, faible impact | Faible | 2 min |
| `src/components/DocumentLegal.tsx` | Regex `/\[contact@liria[^\]]*\]/g` qui masque les placeholders juridiques non complétés | À remplacer avant commercialisation | À adapter en même temps que les placeholders des documents juridiques (voir plus bas) | Faible | 5 min |
| `package.json` | `"name": "liria-gestion-pro"` | À remplacer avant commercialisation | Nom de paquet npm interne, non publié sur le registre npm | Faible | 2 min |
| `package-lock.json` | Reflet automatique du nom de `package.json` (2 lignes) | À remplacer avant commercialisation | Se régénère automatiquement via `npm install` après renommage de `package.json`, ne pas éditer à la main | Faible | 0 min (automatique) |
| `supabase/config.toml` | `project_id = "btp-platform"` | Identifiant technique à conserver | Ne contient pas « Liria » ; identifiant de projet Supabase **local** uniquement, sans lien avec la marque | Nul | 0 min |
| `supabase/migrations/20260714000072_*.sql`, `20260715000080_*.sql`, `20260718000100_*.sql`, `20260718000105_*.sql`, `20260723000134_*.sql`, `20260724000144_*.sql` (commentaires uniquement) | Commentaires SQL en tête de fichier mentionnant « Liria » (7 lignes au total) | Migration historique à ne pas modifier | Ne jamais éditer un fichier de migration déjà appliqué ; laisser tel quel, c'est un historique | Élevé si modifié (fichier déjà exécuté en base) | 0 min (ne pas toucher) |
| `supabase/migrations/20260724000144_boutique_catalogue.sql`, `20260724000145_boutique_commandes.sql`, `20260724000175_liaison_boutique_tresorerie.sql`, `20260724000176_correction_reglement_boutique_tresorerie.sql` | **Données littérales insérées** : nom de fournisseur auto-créé `'Liria (boutique)'`, libellés de permission « boutique de matériel Liria », lignes d'écriture comptable « Commande boutique Liria réglée par carte » (≈ 12 lignes) | À remplacer obligatoirement (par une **nouvelle migration**, jamais en éditant les fichiers existants) | Écrire une migration de correction qui met à jour les libellés déjà stockés en base **et** la fonction qui crée automatiquement la fiche fournisseur pour les nouvelles entreprises | Élevé (donnée métier visible par le client dans sa liste de fournisseurs) | 1 à 2 h (nouvelle migration + vérification des entreprises existantes) |
| `supabase/production/creer_entreprise_demo_18_mois.sql` | Entreprise de démonstration nommée littéralement `'Liria Gestion Pro - Entreprise Demo'` | Donnée de test | Script de démonstration hors migrations versionnées ; à régénérer sous le nouveau nom quand une nouvelle démo sera créée | Faible | 10 min |
| `supabase/production/supprimer_entreprises_test.sql` | Vérifie l'existence d'une entreprise nommée exactement `'LIRIA CONCEPT'` avant suppression des entreprises de test | **Décision à prendre séparément** — voir note ci-dessous | Ne pas traiter comme un simple renommage de code : `LIRIA CONCEPT` semble être le nom réel d'une entreprise en production, pas seulement le nom du logiciel | Élevé (script de suppression en production, condition de sécurité) | À chiffrer séparément selon la décision |
| `src/lib/identifiants.test.ts`, `src/lib/expenses/integrity.test.ts`, `src/lib/expenses/export.test.ts` | « Liria Concept », « Liria Gestion Pro », « Liria » utilisés comme exemples de saisie dans des tests unitaires (4 lignes) | Donnée de test | Remplacer par n'importe quelle chaîne d'exemple ; aucun impact fonctionnel, purement illustratif dans le test | Faible | 10 min |
| `src/lib/version.test.ts` | Variables d'environnement `LIRIA_*` simulées dans les tests (18 lignes) | Identifiant technique à conserver | Suit directement les noms de variables réelles (voir plus haut) ; à modifier seulement si ces variables sont renommées | Faible | 0 min (lié aux env vars) |
| `public/icons/*.png` (6 fichiers), `public/liria-gestion-pro-logo*.png` (2 fichiers) | Icônes PWA et logo principal, brandés dans leur nom de fichier **et** leur contenu graphique | Visuel à régénérer | Créer les nouvelles icônes (192/512/apple-touch) et le nouveau logo, puis mettre à jour tous les chemins listés dans ce tableau (`manifest.ts`, `layout.tsx`, `sw.js`, `Sidebar.tsx`, `page.tsx`, `login/page.tsx`, `DocumentImprimable.tsx`, `imprimer/doe/[id]/page.tsx`, `parametres/page.tsx`) | Élevé (identité visuelle) | 2 à 4 h (création graphique) + 30 min (mise à jour des chemins) |
| `public/videos/*.mp4`, `public/videos/*.vtt`, `public/videos/*.jpg`, `output/video/**` | Vidéo de démonstration, publicité, affiche, sous-titres — contenu et nom de fichier brandés (≈ 20 fichiers, 5 fichiers `.vtt`/`.srt` avec du texte) | Visuel à régénérer | Nécessite un nouveau tournage/montage ou a minima un nouveau générique et de nouveaux sous-titres ; ne pas republier avant le choix définitif du nom | Élevé (ressource la plus coûteuse à refaire) | 1 à 3 jours (selon qu'on retouche ou qu'on retourne) |
| `output/video/assets/liria-gestion-pro-logo.png`, `output/video/assets/presentatrice-liria.png` | Fichiers sources utilisés pour la génération vidéo | Visuel à régénérer | Liés directement au point précédent | Élevé | Inclus dans l'estimation vidéo |
| `public/guides/*.pdf`, `output/pdf/*.pdf` | Guide d'utilisation PDF (2 versions) brandé dans le nom de fichier et le contenu | Visuel à régénérer | Régénérer avec `scripts/create-guide-utilisateur-detaille.py` / `scripts/guide/*` une fois le nouveau nom choisi et le manuel `docs/manuel/` mis à jour | Moyen (génération scriptée, mais dépend du manuel à jour) | 2 à 4 h |
| `scripts/create-guide-utilisateur-detaille.py`, `scripts/guide/contenu.py`, `scripts/guide/modules.py`, `scripts/guide/procedures.py`, `scripts/guide/generer_manuel.py`, `scripts/update-guide-branding.py` | Générateurs du guide PDF, contiennent le nom en dur dans le gabarit (≈ 50 lignes au total) | À remplacer avant commercialisation | Modifier les constantes de branding en tête de script avant la prochaine régénération du guide | Faible | 30 min |
| `scripts/create-liria-videos.py`, `scripts/video/enregistrer.mjs`, `scripts/video/monter.py`, `scripts/video/musique.py`, `scripts/video/scenario.json` | Scripts et scénario de production vidéo, textes affichés à l'écran dans la vidéo (≈ 30 lignes) | À remplacer avant commercialisation (script) / visuel à régénérer (résultat) | Modifier le scénario texte avant tout nouveau tournage | Faible (script) / Élevé (résultat) | 30 min (script) |
| `scripts/audit-application.mjs`, `scripts/capturer-guide.mjs`, `scripts/verification-parcours.mjs`, `scripts/seed-demo-history.mjs` | Variables d'environnement `LIRIA_AUDIT_*` (outillage interne de test/capture) | Identifiant technique à conserver | Outils internes, jamais vus par un client | Nul | 0 min |
| `docs/juridique/cgu.md`, `cgv.md`, `mentions-legales.md`, `politique-confidentialite.md`, `politique-cookies.md`, `rgpd-registre-des-traitements.md`, `dpa-entreprises-clientes.md`, `README.md` | Nom du service défini contractuellement (« le Service »), URL de production citée dans les mentions légales, placeholders `[contact@liria… — À COMPLÉTER]` (8 fichiers, ≈ 16 lignes) | Document juridique | Réviser chaque document comme une révision de contrat : remplacer la définition du « Service », l'URL, les adresses de contact — envisager une relecture par un professionnel du droit avant republication, pas un simple remplacement de texte | Élevé (valeur contractuelle) | 3 à 5 h (révision complète + vérification juridique) |
| `docs/manuel/README.md`, `01-introduction.md`, `MODELE-CHAPITRE.md`, `PERIMETRE-V1.md`, `PLAN-CAPTURES.md` | Nom utilisé comme titre de travail dans les en-têtes du manuel (déjà signalé comme provisoire dans `README.md`) (12 lignes au total) | À remplacer avant commercialisation | Le manuel documente déjà que ce nom est provisoire ; un seul remplacement global dans `docs/manuel/` une fois le nom choisi | Faible | 30 min |
| `docs/developpement/inventaire-fonctionnalites.md`, `organisation-worktrees.md` | Titre et mentions dans la documentation de développement interne (15 lignes) | À remplacer avant commercialisation | Documentation interne, non distribuée au client | Faible | 15 min |
| `docs/AUDIT_SECURITE.md`, `AUDIT_DEPENDANCES_LOT_2.md`, `BUDGET_MISE_EN_SERVICE.md`, `DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`, `PAIEMENTS_BANCAIRES_ET_PAIE.md`, `RAPPORT_LOT_3_COMMERCIALISATION.md`, `RECETTE_ENTREPRISE_TEST_5_ANS.md` | Documentation produit/technique interne, mentions ponctuelles (≈ 12 lignes au total) | À remplacer avant commercialisation | Documents de travail internes, priorité basse | Faible | 20 min |
| `RELAIS_CHATGPT.md`, `RELAIS_CLAUDE.md`, `RELAIS_CODEX_ABONNEMENT.md`, `PROMPT_CODEX.md`, `PROMPT_CODEX_RGPD.md`, `PRODUCTION_CHECKLIST.md`, `SUIVI_BESOINS_METIER.md` | Documents de relais entre intervenants/outils IA du projet, forte densité de mentions (≈ 100 lignes au total, dont 52 dans `RELAIS_CHATGPT.md` seul) | À remplacer avant commercialisation | Documents de pilotage interne, jamais distribués au client ; priorité basse mais volume important — prévoir du temps dédié | Faible (aucun impact client) mais volumineux | 1 h |
| `README.md` (racine) | Aucune occurrence trouvée (fichier `create-next-app` par défaut, jamais personnalisé) | — | Aucune action liée au renommage ; à envisager séparément comme readme projet à écrire | Nul | 0 min |
| Dépôt GitHub (`git remote -v`) | `julien-gregurec/Appli_BTP` | — (déjà générique) | Le nom du dépôt ne contient pas « Liria » : aucune action de renommage requise pour cet élément | Nul | 0 min |
| Domaine `liria-gestion-pro.fr` / `liria.fr` (cités dans le code comme adresses de contact) | Utilisés dans du texte et dans `VAPID_SUBJECT`, sans preuve dans ce dépôt qu'ils sont réellement enregistrés/actifs | Impossible à confirmer sans accès au service | Vérifier auprès du bureau d'enregistrement de domaines si ces noms sont déjà possédés avant de les utiliser comme adresse de contact réelle | Élevé (adresse de contact légal/RGPD) si le domaine n'existe pas réellement | À vérifier manuellement |
| Projet Vercel `liria-concept-gestion-btp` (équipe `julien-gregurec`, URL `https://liria-concept-gestion-btp.vercel.app`) | Cité dans `PRODUCTION_CHECKLIST.md`, `RELAIS_CHATGPT.md`, `RELAIS_CLAUDE.md`, `scripts/update-guide-branding.py`, `docs/juridique/mentions-legales.md` | Compte externe à renommer manuellement | Vercel permet de renommer un projet et/ou d'ajouter un domaine personnalisé sans perdre le déploiement ; à faire depuis le tableau de bord Vercel, puis mettre à jour les 5 fichiers qui citent l'URL en dur | Moyen (redirection à prévoir si l'ancienne URL doit continuer à fonctionner) | 30 min (Vercel) + 15 min (mise à jour des mentions) |
| Projet Supabase hébergé (production) | Nom d'affichage du projet sur le tableau de bord Supabase | Impossible à confirmer sans accès au service | Le fichier local `supabase/config.toml` utilise un identifiant technique générique (`btp-platform`), sans lien avec la marque ; seul le nom d'affichage côté tableau de bord Supabase pourrait mentionner l'ancien nom — à vérifier manuellement | Faible (cosmétique côté tableau de bord uniquement) | À vérifier manuellement |
| Compte/produits Stripe | Noms de produits, de prix ou de l'entreprise affichés sur les reçus et le portail client Stripe | Impossible à confirmer sans accès au service | Aucun nom de marque dans les clés d'environnement Stripe du code (`STRIPE_PRICE_*`) ; seuls les libellés configurés côté tableau de bord Stripe (visibles par le client sur ses factures/reçus) pourraient mentionner l'ancien nom — à vérifier manuellement, impact direct sur des documents que voit le client | Élevé si non vérifié (facture au nom de l'ancienne marque) | À vérifier manuellement |
| Projet Sentry | Nom d'affichage du projet/organisation sur sentry.io | Impossible à confirmer sans accès au service | Le DSN dans `sentry.server.config.ts` / `sentry.edge.config.ts` est un identifiant opaque sans nom de marque ; seul le nom d'affichage sur le tableau de bord Sentry est à vérifier manuellement | Nul (jamais vu par un client) | À vérifier manuellement |
| Organisation/projet OpenAI | Nom d'organisation ou de projet sur platform.openai.com | Impossible à confirmer sans accès au service | Aucun nom de marque dans les variables `OPENAI_*` du code ; à vérifier manuellement si pertinent (rarement visible par le client) | Nul | À vérifier manuellement |

## 6. Détail des indicateurs demandés

### 6.1 Nombre total de fichiers concernés

**154 fichiers** contiennent au moins une occurrence du nom actuel (135 identifiés par leur contenu texte + 19 fichiers binaires — logos, PDF, vidéos — identifiés uniquement par leur nom de fichier).

### 6.2 Nombre d'occurrences

**489 lignes** contenant le terme « liria » (insensible à la casse) dans les fichiers texte, sans compter les occurrences multiples sur une même ligne ni les 19 fichiers binaires (qui n'ont pas de « ligne » à compter).

### 6.3 Code et interface

**68 fichiers** sous `src/` (pages, composants, actions serveur, bibliothèques, tests unitaires inclus). C'est la catégorie la plus nombreuse et celle qui concentre l'essentiel des occurrences « à remplacer obligatoirement » (texte visible par l'utilisateur).

### 6.4 Documentation

**≈ 43 fichiers** hors code et hors visuels :
- 8 documents juridiques (`docs/juridique/`)
- 5 fichiers du manuel utilisateur (`docs/manuel/`)
- 9 documents produit/technique internes (`docs/` hors juridique et manuel)
- 7 documents de relais/pilotage à la racine (`RELAIS_*`, `PROMPT_CODEX*`, `PRODUCTION_CHECKLIST.md`, `SUIVI_BESOINS_METIER.md`)

### 6.5 Tests

**4 fichiers** de tests unitaires Vitest (`src/lib/identifiants.test.ts`, `src/lib/version.test.ts`, `src/lib/expenses/integrity.test.ts`, `src/lib/expenses/export.test.ts`). Aucun test end-to-end Playwright n'existe sur cette branche (`claude/developpement-parallele` = `main`) ; le dossier `tests/e2e/` n'existe que sur `release/commercialisation-v1` (worktree Codex, hors périmètre de cet audit). Aucune fixture pgTAP (`supabase/tests/`) ne mentionne le nom.

### 6.6 Visuels et vidéos

**26 fichiers** : 16 sous `public/` (6 icônes PWA, 2 logos, 3 vidéos/sous-titres/affiche, 2 PDF de guide, +1 doublon de PDF nommé « 2 ») et 10 sous `output/` (2 PDF, 2 vidéos, 2 sous-titres `.srt`, 2 `.vtt`, 2 images sources de génération vidéo). C'est la seule catégorie qui ne peut pas être traitée par un remplacement de texte : chaque fichier doit être régénéré.

### 6.7 Services externes

5 services identifiés comme dépendant potentiellement du nom, par ordre de priorité de vérification :

1. **Vercel** — projet `liria-concept-gestion-btp`, URL de production en dur dans 5 fichiers du dépôt. Confirmé dans le code, action de renommage à faire manuellement sur Vercel.
2. **Stripe** — libellés de produits/prix et informations affichées sur les factures et reçus envoyés aux clients. Non vérifiable depuis le code ; priorité de vérification élevée car directement visible par le client.
3. **Supabase (hébergé)** — nom d'affichage du projet en production. Non vérifiable depuis le code ; impact cosmétique uniquement (tableau de bord interne).
4. **Sentry** — nom d'affichage du projet/organisation. Non vérifiable depuis le code ; aucun impact client.
5. **OpenAI** — nom d'organisation/projet. Non vérifiable depuis le code ; aucun impact client probable.

**GitHub** a été vérifié et ne nécessite aucune action : le dépôt distant (`julien-gregurec/Appli_BTP`) ne contient pas le nom actuel.

**Domaine(s)** `liria-gestion-pro.fr` / `liria.fr` cités comme adresses de contact dans le code : leur statut d'enregistrement réel n'a pas pu être vérifié depuis ce dépôt et doit être confirmé avant toute communication officielle sous le nouveau nom.

### 6.8 Identifiants techniques à ne pas renommer (recommandation par défaut)

- Variables d'environnement `LIRIA_APP_VERSION`, `LIRIA_BUILD_COMMIT`, `LIRIA_BUILD_DATE`, `LIRIA_BUILD_ENVIRONMENT`, `LIRIA_DEPLOYMENT_DATE`, `LIRIA_DEPLOYMENT_URL`, `LIRIA_AUDIT_URL`, `LIRIA_AUDIT_EMAIL`, `LIRIA_AUDIT_PASSWORD`, `LIRIA_AUDIT_OUTPUT`, `LIRIA_VIDEO_TARGET` — renommer exigerait une reconfiguration coordonnée sur Vercel, sans bénéfice utilisateur.
- Clés de stockage local du navigateur : `liria-appareil-id`, `liria-presence-*`, `liria-dashboard-widgets-v1`, `liria-dashboard-widgets-configured-v1`, `liria-dashboard-widgets-change`, `liria-dashboard-masques`, `liria:gps:*`, `liria:ouvrir-assistant` — renommer réinitialiserait silencieusement les préférences déjà enregistrées chez les utilisateurs existants.
- Variables et classes CSS `--liria-navy`, `--liria-gold`, `--liria-anthracite`, `--liria-white`, `--liria-gray-clair` et leurs classes Tailwind associées (`bg-liria-navy`, `text-liria-gold`, etc.) — jamais affichées comme texte, purement des noms de jetons de design.
- `schema: "liria-gestion-pro/expense-export/v1"` dans les exports de notes de frais — non revalidé par aucun code lu, mais potentiellement déjà présent dans des fichiers remis à des comptables ; conserver ou verser en `v2` plutôt que renommer à l'identique.
- `project_id = "btp-platform"` dans `supabase/config.toml` — ne contient pas le nom actuel, aucune action liée au renommage.
- DSN Sentry (`sentry.server.config.ts`, `sentry.edge.config.ts`) — identifiants numériques opaques, aucun nom de marque.

### 6.9 Ordre recommandé

1. **Choisir et valider le nom définitif** (juridique, disponibilité de domaine, disponibilité sur les services tiers) — préalable à tout le reste.
2. **Vérifier les comptes externes** (Vercel, Stripe, Supabase, Sentry, OpenAI, domaine) pour savoir ce qui doit réellement être renommé côté service, avant de toucher au code.
3. **Documents juridiques** (`docs/juridique/`) — à traiter tôt car ils encadrent tout le reste, avec relecture dédiée.
4. **Code et interface** (`src/`) — le remplacement de texte proprement dit, fichier par fichier, en commençant par les métadonnées/PWA (layout, manifest, service worker, logo) puis les textes visibles page par page.
5. **Nouvelle migration Supabase** pour corriger les données déjà stockées (fiche fournisseur boutique, libellés de permission) — jamais en éditant les migrations existantes.
6. **Visuels** (logos, icônes, PDF, vidéos) — dépend du nom validé à l'étape 1 et peut démarrer en parallèle des étapes 3-4 une fois le nom fixé.
7. **Manuel utilisateur et guides** (`docs/manuel/`, régénération des PDF via `scripts/guide/*`) — après que le code et les visuels soient stabilisés, puisque le manuel documente l'application réelle.
8. **Documentation interne** (`RELAIS_*`, `docs/developpement/`, autres) — priorité la plus basse, sans impact client, peut être étalée dans le temps.
9. **Recherche finale de vérification** (voir §6.12) — une fois tout ce qui précède terminé.

### 6.10 Estimation réaliste du temps total

| Bloc | Estimation |
|---|---|
| Vérification des comptes externes et du domaine | 1 à 2 h |
| Documents juridiques (révision + relecture) | 3 à 5 h |
| Code et interface (texte, hors visuels) | 6 à 8 h |
| Nouvelle migration Supabase (données boutique) | 1 à 2 h |
| Visuels statiques (logo, icônes) | 2 à 4 h |
| PDF du guide (régénération scriptée) | 2 à 4 h |
| Vidéos (retouche a minima des génériques/sous-titres) | 1 à 3 jours |
| Manuel utilisateur (remplacement du nom provisoire) | 30 min |
| Documentation interne | 1 à 2 h |
| Recherche finale + tests de non-régression | 2 à 3 h |
| **Total hors vidéos** | **≈ 1,5 à 2 jours** |
| **Total avec régénération vidéo complète** | **≈ 3 à 5 jours**, cohérent avec l'estimation transmise en fin de message précédent, en l'absence de domaine et de réseaux sociaux déjà déployés à migrer |

La vidéo est le principal facteur de variation : une simple mise à jour du générique et des sous-titres reste dans la fourchette basse, un nouveau tournage avec présentatrice pousse vers la fourchette haute.

### 6.11 Checklist de renommage

- [ ] Nom définitif choisi et validé (disponibilité juridique, domaine, réseaux sociaux si prévus plus tard)
- [ ] Domaine(s) réellement enregistré(s) et adresse(s) e-mail de contact fonctionnelle(s) confirmés
- [ ] Projet Vercel renommé ou domaine personnalisé configuré ; URL de production mise à jour partout où elle est citée en dur
- [ ] Libellés Stripe (produits, prix, informations affichées sur les factures/reçus) vérifiés et mis à jour
- [ ] Nom d'affichage Supabase, Sentry, OpenAI vérifiés (impact cosmétique uniquement)
- [ ] Documents juridiques (CGU, CGV, mentions légales, politique de confidentialité/cookies, DPA, registre RGPD) révisés et, si besoin, relus par un professionnel du droit
- [ ] Métadonnées et PWA (`layout.tsx`, `manifest.ts`, `sw.js`) mises à jour
- [ ] Nouveau logo et nouvelles icônes créés, tous les chemins de fichiers mis à jour dans le code
- [ ] Tous les textes visibles côté application remplacés (voir tableau §5, catégorie « à remplacer obligatoirement »)
- [ ] Prompt système et outils de l'assistant IA mis à jour (`src/lib/ai/assistant.ts`, `src/lib/ai/copilote.ts`)
- [ ] Nouvelle migration Supabase écrite pour corriger la fiche fournisseur boutique et les libellés de permission déjà stockés
- [ ] Décision prise sur l'entreprise `LIRIA CONCEPT` en production (renommage de l'entreprise elle-même ou non — décision distincte du renommage du logiciel)
- [ ] Tests unitaires mis à jour (données d'exemple, pas de logique à changer)
- [ ] PDF du guide régénéré via les scripts existants une fois le manuel à jour
- [ ] Vidéos retouchées ou retournées selon le budget disponible
- [ ] Manuel utilisateur (`docs/manuel/`) : remplacement global du nom provisoire (déjà anticipé dans `README.md`)
- [ ] Documentation interne mise à jour (priorité basse, peut être faite en dernier)
- [ ] Recherche finale de vérification effectuée (§6.12) sans nouvelle occurrence trouvée hors exceptions documentées

### 6.12 Stratégie de recherche finale

Une fois le renommage effectué, rejouer exactement les commandes suivantes depuis la racine du dépôt et vérifier que seules les exceptions documentées ci-dessous subsistent :

```bash
grep -rIn --exclude-dir={node_modules,.git,.next,dist,build} -i "liria" . | wc -l
grep -rIl --exclude-dir={node_modules,.git,.next,dist,build} -i "liria" .
find . -type d \( -name node_modules -o -name .git -o -name .next \) -prune -o -type f -iname "*liria*" -print
grep -rIn --exclude-dir={node_modules,.git,.next,dist,build} -E "LIRIA_[A-Z_]+" .
grep -rIn --exclude-dir={node_modules,.git,.next,dist,build} -E "(bg|text|border)-liria-|--liria-|--color-liria-" .
```

**Exceptions attendues après renommage** (ne pas les considérer comme un échec de la recherche finale) :
- Commentaires dans les migrations SQL déjà appliquées (`supabase/migrations/2026...sql`) — ne jamais éditer un fichier de migration existant.
- Variables d'environnement `LIRIA_*` et clés de stockage local `liria-*`/`liria:*`, si la décision a été prise de les conserver (voir §6.8).
- Classes et variables CSS `--liria-*` / `*-liria-*`, si la décision a été prise de les conserver.
- `schema: "liria-gestion-pro/expense-export/v1"`, si conservé pour compatibilité avec des exports déjà livrés.

Compléter par une recherche manuelle, hors périmètre de ce dépôt de code :
- Vérifier le rendu réel de l'application dans un navigateur (titre d'onglet, favicon, notifications push, PDF générés) après build.
- Vérifier les tableaux de bord Vercel, Stripe, Supabase, Sentry, OpenAI un par un (voir §6.7).
- Vérifier qu'aucune capture d'écran ou vidéo publiée ailleurs (réseaux sociaux, portfolio) ne montre encore l'ancien nom, une fois ces canaux mis en place.
