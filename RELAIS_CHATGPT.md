# IDENTIFIANTS SALARIÉS + COMPTE DÉPÔT + SEED JUJU — 14 juillet (Codex)

**Migration 76 appliquée. Lot publié sur `main` (`2664259`, correctif guide public `7572ff0`) et déployé par Vercel.**

- `supabase/migrations/20260714000076_identifiants_et_compte_depot.sql` ajoute le choix d’identifiant salarié : référence interne existante ou préfixe personnalisable sur 2 à 8 caractères suivi de 4 chiffres (`LIR-0001`). La renumérotation est atomique et ne modifie ni comptes ni historiques.
- Un poste protégé `Compte dépôt` est créé pour les entreprises actuelles et futures. Il ne reçoit que Stock, Borne stock et le mode dépôt ; le proxy verrouille le terminal sur ces pages jusqu’à déconnexion explicite.
- Chaque mouvement de borne continue d’exiger le mot de passe stock personnel. La RPC v3 contrôle en plus, sur le poste du salarié identifié, le droit distinct `effectuer_entree_stock` ou `effectuer_sortie_stock`. Le mouvement reste attribué au salarié, jamais au compte partagé.
- L’identifiant de borne est affiché dans Employés, la fiche, Mon espace et la carte interne. Le numéro aléatoire `BTP-…` reste réservé à l’invitation/activation du compte applicatif.
- Le script `supabase/production/seed_juju_6_mois.sql` a rempli avec succès l’entreprise nommée exactement `juju` avec six mois de clients, chantiers, devis, factures, règlements, planning, pointages, stock, achats, flotte, outillage et frais. Les accès de test ont été générés dans la dernière ligne du résultat.
- Correctif du seed après erreur `affectations_lieu_coherent_check` : deux rotations de tableaux pouvaient produire l’index PostgreSQL `0` et donc un chantier NULL. Les formules sont maintenant strictement comprises entre 1 et la taille du tableau. L’exécution échouée ayant été annulée par la transaction, le script complet corrigé peut être relancé.
- Manuel utilisateur complet créé et contrôlé visuellement : `output/pdf/Guide_utilisation_Liria_Gestion_Pro.pdf`, 24 pages A4, sommaire et signets. Une copie servie par l’application se trouve sous `public/guides/Guide_utilisation_Liria_Gestion_Pro.pdf`; `/aide` propose le bouton « Ouvrir le guide PDF ».
- Contrôles finaux du lot : TypeScript OK, ESLint OK, 14/14 tests, `git diff --check` OK et build webpack complet OK. Seul l’avertissement connu `unpdf/import.meta` reste présent sans bloquer la compilation.
- Production contrôlée : le guide répond HTTP 200 en PDF sur `/guides/Guide_utilisation_Liria_Gestion_Pro.pdf`. Reste un test métier authentifié : changer le préfixe, connecter un compte dépôt et effectuer une entrée/sortie avec un salarié autorisé puis non autorisé.

---

# 🛡️ ACCÈS PROPRIÉTAIRE + SUSPENSION AUTOMATIQUE DES IMPAYÉS — 14 juillet (Codex)

**Migration 75 appliquée, code poussé (`ddf3ea1`) et déployé.**

- `/plateforme` permet d’entrer dans une entreprise avec droits administrateur, motif obligatoire, session d’intervention journalisée et bouton de sortie. Aucun salarié ou compte facturable artificiel n’est créé.
- Un impayé déclenche un avertissement de 10 jours, un compte à rebours chez les administrateurs clients et une alerte dans la plateforme.
- À l’échéance, les règles de base refusent automatiquement l’accès et redirigent vers `/abonnement-suspendu`, sans dépendre d’un cron. Le support plateforme reste accessible dans sa session explicite.
- « Règlement reçu » annule la suspension prévue et réactive immédiatement un abonnement suspendu.
- Emails automatiques non inclus faute de fournisseur SMTP/Resend ; alertes applicatives complètes.
- ESLint, TypeScript, 14/14 tests, build webpack, diff-check OK.
- Migrations 74 et 75 confirmées appliquées par Julien ; commits `667016b` et `ddf3ea1` poussés sur `gh/main`. Production contrôlée : page suspendue HTTP 200, plateforme protégée par login.

---

# 🔒 BORNE DÉPÔT PERSONNELLE + PLANNING MOBILE + ABONNEMENT AUTO — 14 juillet (Codex)

**Code local vérifié, pas encore poussé. Migration 74 à appliquer avant publication :** `supabase/migrations/20260714000074_acces_stock_personnel.sql`.

- Sessions ordinaires PC/smartphone : persistance Supabase SSR déjà correcte (cookies renouvelés, 400 jours maximum par défaut), aucune reconnexion quotidienne ajoutée.
- Borne stock partagée : reste connectée au dépôt, mais exige à chaque mouvement le numéro `BTP-…` et un mot de passe stock créé par le salarié dans `/mon-espace`. Les anciens PIN administrateur sont invalidés ; l’admin peut uniquement réinitialiser.
- Nouvelle RPC sécurisée `enregistrer_mouvement_stock_borne_v2` : droit `utiliser_borne_stock`, limitation des tentatives, erreur générique, mouvement strictement attribué à l’employé authentifié par ses identifiants dépôt.
- Planning mobile refait jour par jour avec navigation collante et détails lisibles ; tableau ordinateur conservé.
- Prix plateforme corrigé : offre recommandée (49/89/149 € avec 3 comptes inclus) + 12 € par compte actif ou en pause supplémentaire. L’ancien mauvais compteur des membres n’est plus utilisé.
- QR/code-barres existants et futurs déjà assurés par migration 68 ; pointage au nom d’un autre déjà interdit par migration 70.
- Contrôles : ESLint, TypeScript, 14/14 tests, build webpack et diff-check OK.
- Déploiement volontairement retenu : appliquer migration 74, tester le parcours réel, puis commit/push. CLI Supabase non connecté et navigateur intégré indisponible pendant ce passage.

---

# ✅ IMPORT DE DONNÉES (MIGRATION DEPUIS BATAPPLI…) — 14 juillet (Claude)

**Code poussé (`36b183f`) — AUCUNE migration SQL (utilise les tables existantes).** Module d'import générique CSV/Excel pour faire basculer une entreprise depuis un autre logiciel (Batappli, EBP, Codial…). Page `/parametres/import` (gated `gerer_utilisateurs`, lien dans Paramètres). 4 types : **clients**, **chantiers** (client rattaché/créé par nom), **employés**, **catalogue** (`prestations_catalogue`). Flux : upload → parse serveur (`src/lib/import/parse.ts` : CSV avec détection séparateur `;`/`,` + Excel via `@excel.js/exceljs`) → auto-mapping des colonnes → aperçu → insertion par lots de 200 sous RLS (entreprise du user). Config champs : `src/lib/import/config.ts`. Actions : `src/app/actions/import.ts` (`analyserFichierImport`, `importerDonneesAction`). Assistant client : `src/components/ImportWizard.tsx`. Normalisation : nombres (virgule FR), dates (AAAA-MM-JJ ou JJ/MM/AAAA), enums validés/défauts. Cap 5000 lignes, fichier 8 Mo max. **Pas de fichier Batappli réel encore** → mapping manuel ; preset Batappli à caler quand un export sera fourni. Import Excel natif OK.

**Seed de test dispo (non poussé, scratchpad)** : `seed_donnees_test.sql` génère 40 employés + 100 chantiers + 80 outils + 40 véhicules pour une entreprise cible (`v_cible`, défaut 'juju'). Fourni à Julien via presse-papier pour ses tests.

---

# ✅ QUESTIONNAIRE INSCRIPTION + SUPPORT CHAT + RESET ACCÈS — 14 juillet (Claude)

**Migration 73 `20260714000073_besoins_et_support.sql` APPLIQUÉE + code poussé (`513d6a5`).**

**(A) Questionnaire d'inscription → recommandation d'abonnement.** Après création d'entreprise (`createEntrepriseAction`, chemin auth réelle), le dirigeant est redirigé vers `/onboarding/besoins` : nb salariés + besoins (cases) + attentes + commentaire. `enregistrerBesoinsAction` (`src/app/actions/besoins.ts`) upsert dans `entreprise_besoins` et calcule l'offre via `recommanderOffre()`. Écran de reco (Essentiel 49 € / Pro 89 € / Premium 149 €, **placeholders**) avec prix mensuel = base offre + salariés sup. Logique dans `src/lib/plateforme.ts` (`BESOINS_OPTIONS`, `ATTENTES_OPTIONS`, `OFFRES`, `recommanderOffre`, `prixAbonnementMensuel(nb, base)`). RPC `plateforme_besoins()` pour la vue plateforme.

**(B) Support chat entreprise ↔ plateforme.** Table `support_messages` (cote entreprise/plateforme, RLS `est_membre_actif` côté entreprise, RPC SECURITY DEFINER côté plateforme). Bouton flottant « Aide » (`src/components/AideButton.tsx`) dans le shell `(app)/layout.tsx` → `/aide` (chat entreprise, `src/app/(app)/aide/page.tsx`, actions `src/app/actions/support.ts`). Côté plateforme : `/plateforme/support` (boîte de réception + badge non-lus + réponse), lien « Support » sur `/plateforme`. RPC `plateforme_support_fils()`, `plateforme_support_messages(uuid)` (marque lus), `plateforme_support_repondre(uuid,text)`, `support_marquer_lus_entreprise(uuid)`. Chat par rafraîchissement (pas de temps réel Supabase Realtime — évolution possible).

**(C) Reset accès employés effectué (à la demande de Julien, pour re-tester).** Toutes les adhésions `utilisateurs_entreprises` supprimées sauf comptes protégés (julien.gregurec@gmail.com + plateforme_admins) ; fiches `employes` déliées + repassées `compte_application_statut='non_ouvert'` + timestamps invitation/installation/connexion effacés. Aucun compte de connexion supprimé (FK `restrict` sur `codes_acces`/`chantier_transferts`/`demandes_conges.created_by` rendraient la suppression fragile). Contrôle post-reset : 1 adhésion restante (LIRIA), 0 fiche avec accès, 0 fiche liée. **julien.gregurec@gmail.com intouchable jusqu'à création de sa société.**

Lien d'inscription nouvelle entreprise : `https://liria-concept-gestion-btp.vercel.app/signup` → onboarding (créer entreprise) → questionnaire besoins → dashboard.

---

# ✅ BASCULE AUTH RÉELLE + ÉQUIPE PLATEFORME — 14 juillet (Claude)

**Bascule production faite.** `DISABLE_EMAIL_LOGIN=false` sur Vercel : la connexion réelle est ACTIVE. `/dashboard` et `/plateforme` redirigent (307) vers `/login`. Owner : `julien.gregurec@gmail.com` (auth id `c913921d`), profil + membership LIRIA admin OK, mot de passe posé par l'utilisateur. Le mode prototype (`isEmailLoginDisabled()`, `dev_contexte_entreprise`, policies anon) reste dans le code pour le dev local mais n'est plus actif en prod.

**Migration 72 `20260714000072_plateforme_equipe.sql` APPLIQUÉE + code poussé (`3db83ac`, `3ffa889..3db83ac`).** Module « Équipe plateforme » sur `/plateforme` : plusieurs comptes du personnel LIRIA pour dépanner toutes les entreprises.
- `plateforme_admins` gagne `role` (`total`/`support`/`facturation`/`lecture`, défaut `total`), `nom`, `ajoute_par`.
- RPC `plateforme_lister_admins()`, `plateforme_ajouter_admin(email,nom,role)`, `plateforme_retirer_admin(email)` — SECURITY DEFINER, gardées par `est_plateforme_admin()`, execute réservé à `authenticated`. Retrait protégé : pas soi-même, pas le dernier membre.
- Actions `ajouterAdminPlateformeAction` / `retirerAdminPlateformeAction` dans `src/app/actions/plateforme.ts`. Section UI ajoutée sur `src/app/(app)/plateforme/page.tsx`.
- **Flux compte plateforme** : ajouter l'email dans l'UI → créer le compte de connexion dans Supabase (Authentication → Add user, même email) → transmettre le mot de passe. Accès = espace plateforme (entreprises, abonnements, facturation).
- **NON FAIT (volontaire, "on verra par la suite")** : entrer DANS les données d'une entreprise cliente (chantiers/devis) pour dépanner = changement RLS (bypass plateforme sur les policies `est_membre_actif`). À concevoir prudemment plus tard. Les niveaux d'accès différenciés (`role`) sont stockés mais pas encore appliqués côté droits.

⚠️ Codex est en pause à la demande de l'utilisateur (« je fais tout, dis à Codex de s'arrêter ») pour éviter les conflits sur la même base.

---

# ✅ LOT 57→71 DÉPLOYÉ EN PRODUCTION — 13 juillet (Claude)

Les 15 migrations 57→71 ont été **appliquées** (guidées une par une via presse-papier ; la 57 était déjà en base) et le code a été **poussé** (commit `c59ae13`, `f94aba7..c59ae13`). Vérifié en prod : `/planning`, `/plateforme/facturation`, `/conges`, `/stock/borne`, `/mes-travaux`, `/notes-frais`, `/dashboard`, `/employes`, `/commandes`, `/plateforme` = **HTTP 200** avec vrai contenu. QR codes présents (`codes_identification` a déjà des lignes). `notes-frais` reste fermé en prototype (auth requise, par design). ✅ Planning : vue mobile en cartes ajoutée (commit `7f36f6c`). ✅ /plateforme : prix mensuel auto par client = abonnement de base (49 €, ≤3 salariés) + employés supplémentaires (12 €/salarié), barème dans `src/lib/plateforme.ts` `TARIF_ABONNEMENT` (commit `dfee6d7`). Les 4 demandes utilisateur (QR, pointage strict, planning mobile, formule abonnement) sont livrées et déployées.

---

# Relais pour ChatGPT — « Liria Gestion Pro »

## 00. REPRISE CODEX — 13 juillet 2026, archivage/frais + modules complémentaires (CODE LOCAL PRÊT, MIGRATIONS 57–71 NON APPLIQUÉES)

Cette section est l’état le plus récent et prime sur les sections historiques ci-dessous.

- Un module complet de justificatifs et notes de frais a été développé avec stockage privé, contrôle MIME réel, fichiers originaux non recompressés, SHA-256, versions, mode simple/renforcé non qualifié, horodatage serveur non qualifié, journal d’audit append-only chaîné, workflow salarié/responsable/comptable/admin, legal hold, doublons, téléchargement avec vérification d’intégrité et export ZIP (CSV, originaux, historique, manifeste et empreintes).
- Migrations `57` à `61` : socle dépenses, audit/exports, permissions/workflow, intégrité/storage et exports sécurisés. Code sous `src/lib/expenses/`, API sous `src/app/api/notes-frais/`, écrans `/notes-frais`, `/notes-frais/[id]`, `/notes-frais/exports`, `/parametres/notes-frais`. Documentation : `docs/ARCHIVAGE_JUSTIFICATIFS.md`.
- Migration `62` + `/conges` : demandes personnelles, correction/refus/validation et création automatique d’affectations planning en semaine.
- Migration `63` : état des comptes actif/pause/fermé, facturation mensuelle par poste, comptes en pause facturables pour le mois, création d’entreprise depuis `/plateforme`, tarifs par poste et snapshot mensuel. Le snapshot d’une première activation est fait après la transition pour ne pas perdre le mois.
- Migration `64` : personnalisation rare des devis/factures (police, taille, couleur, largeur logo, mise en page) dans Paramètres et `DocumentImprimable`.
- Migration `65` : liaison pointage ↔ affectation, heures planifiées/validées dans planning et chantiers, validation/refus. Le reliquat de l’ancienne obligation de photo est retiré : le GPS/date/heure serveur reste obligatoire.
- Migration `66` + `/mes-travaux` : devis chantier expurgé de tous les prix/totaux pour les ouvriers affectés, via RPC SECURITY DEFINER qui ne renvoie que les tâches utiles.
- Migration `67` : outillage hors service indisponible, alerte réparation, remise en service ou mise au rebut définitive auditée ; détail des travaux sur factures véhicule.
- Migration `68` : QR internes pour article, chantier, véhicule, outil et employé ; QR privés affichés dans les fiches ; borne `/stock/borne` mobile avec scan QR/code-barres, code personnel haché (jamais en clair), chantier obligatoire à la sortie, mouvement attribué à l’employé, journal des tentatives et limitation après erreurs. Le scanner explique le besoin HTTPS et conserve saisie/douchette en repli.
- Migration `69` : socle de droits personnels obligatoire pour tous les postes présents/futurs : planning, pointage personnel, notes personnelles, congés et borne stock. Les modules non autorisés restent absents du menu.
- Migration `70` corrige un écart détecté pendant l’audit transversal : `gerer_pointage` n’autorise plus à pointer au nom d’un collègue. Il permet seulement consultation/correction/validation. L’arrivée doit appartenir à la fiche liée au compte et la clôture RPC est l’unique chemin de création du pointage final.
- Migration `71` + `/plateforme/facturation` : relevés mensuels historiques par entreprise, compte, poste, offre et montant HT. Les comptes ouverts puis fermés dans le mois restent inclus ; les relevés nominatifs sont masqués en prototype.
- Dépendances ajoutées : `fflate`, `qrcode`; tests via Vitest. Tests structurels Supabase : `supabase/tests/archivage_notes_frais_rls.test.sql` et `borne_stock_securisee.test.sql`.
- Contrôles au 13/07 : `npm test` = 12/12, TypeScript OK, lint OK, `npm run build` OK. Audit production : deux alertes modérées proviennent du PostCSS embarqué dans Next 16 ; la correction automatique proposée ferait une rétrogradation majeure, donc aucun `--force` n’a été appliqué.
- **Blocage actuel** : Supabase CLI non lié (`supabase/.temp/project-ref` absent), `SUPABASE_ACCESS_TOKEN` absent et aucune session SQL pilotable. Les migrations 57–71 ne sont donc **pas appliquées** et le lot n’est **pas déployé**. Ne pas déployer avant exécution et test transactionnel des migrations dans l’ordre. `DISABLE_EMAIL_LOGIN=true` reste actif ; les notes personnelles demeurent fermées honnêtement en prototype.
- Le script futur `supabase/production/sortie_mode_prototype.sql` contient les grants authentifiés de toutes les nouvelles RPC. Il reste volontairement NON APPLIQUÉ jusqu’à la bascule coordonnée des comptes personnels.
- Ne jamais ajouter/supprimer les doublons non suivis `*page 2.tsx` et `StockMovementForm 2.tsx` : ils ne font pas partie de ce lot.

> Document de passation à jour au **13 juillet 2026**. À lire en entier avant toute modification.
> Il complète (et prime sur) l'ancien relais Claude collé dans la conversation.
> Copie synchronisée : `~/RELAIS_CHATGPT.md`. **À mettre à jour à CHAQUE modification.**

---

## 0X. REPRISE CODEX — 13 juillet 2026, lot accès/commandes/planning (MIGRATIONS APPLIQUÉES, PRÊT À DÉPLOYER)

Cette section prime sur les états précédents pour ce lot.

- Deux migrations nouvelles sont **appliquées et contrôlées sur Supabase** :
  - `20260713000055_activites_hors_chantier.sql` : le planning accepte, sans faux chantier, les types Chantier, Bureau, Dépôt, Visite médicale, Formation, Congé/absence et Autre. `chantier_id` devient nullable avec une contrainte de cohérence ; l’unicité des affectations est adaptée.
  - `20260713000056_suivi_acces_collaborateurs.sql` : dates d’invitation, activation, première/dernière connexion et installation PWA sur la fiche employé ; RPC sécurisées de suivi ; statistiques SaaS par entreprise (effectif facturable, comptes activés, invitations, installations, connectés sur 30 jours, options utilisées).
- Le script futur `supabase/production/sortie_mode_prototype.sql` a aussi été complété avec les trois grants authenticated de la migration 56 ; il reste volontairement non appliqué.
- Employés : la liste et la fiche affichent désormais « À inviter », « Invitation envoyée », « Compte activé » ou « Connecté », avec les dates utiles et la détection d’installation. Copier/partager une invitation enregistre l’événement côté serveur.
- Plateforme propriétaire : `/plateforme` affiche par entreprise employés facturables, comptes activés, invitations, utilisateurs connectés sur 30 jours, installations, dernière connexion et options actives. Cette vue prépare une facturation selon effectif/options.
- Limite importante : `DISABLE_EMAIL_LOGIN=true` reste actif. Une session passée dans l’ancien mode partagé ne permet pas d’identifier rétroactivement Nathan (ou un autre salarié). Le suivi individuel fiable commence avec le compte personnel, après la bascule coordonnée vers l’authentification réelle. **Ne pas attribuer artificiellement une connexion anonyme à Nathan.**
- Nathan Gregurec (`d202eb63-361c-4ece-a602-1f8646ecf548`) a été marqué comme invité par partage le 13/07/2026 à 20:46 (heure de Paris). Son compte, son installation et ses connexions restent honnêtement à « non détecté/jamais » tant qu’il n’utilise pas un compte personnel authentifié. La fiche propose aussi « Marquer comme déjà envoyée » pour reprendre les invitations antérieures au nouveau suivi.
- Commandes fournisseurs : nouvelle saisie de réception par ligne avec trois choix (non reçu / reçu partiellement / reçu totalement), quantité partielle, calcul visible reçu/manquant et statut automatique. Le tableau affiche aussi la quantité manquante.
- E-mails : la consigne interne d’ajout manuel du PDF a été retirée du message réellement destiné au client/fournisseur ; elle reste uniquement dans l’interface. La grammaire de la fenêtre est corrigée (`du devis`, `de la facture`, `de la commande`).
- Dépenses fournisseurs : une personne ayant `gerer_achats` peut annuler un règlement validé par erreur. Le trigger existant recalcule automatiquement montant réglé, reste et statut. Les lecteurs seuls ne voient pas le bouton.
- Planning : formulaire dynamique de type d’activité, lieu facultatif pour les activités hors chantier, affichage dans le tableau et dans le message de partage email/WhatsApp.
- Contrôles code verts : `npm run lint`, `npx tsc --noEmit --incremental false`, `npx next build --webpack`, `git diff --check`.
- Contrôle SQL après exécution : colonnes planning/suivi présentes, trois RPC présentes et droit `authenticated` de présence tous à `true`. Vérifier `/planning`, une commande partielle, une dépense avec annulation de règlement, `/employes`, `/employes/[id]`, `/plateforme`, puis pousser sur `gh main`.

---

## 0Y. REPRISE CODEX — 13 juillet 2026 (ÉTAT LE PLUS RÉCENT)

Cette section prime sur les mentions « migration 47/48 à exécuter » et « à auditer » de la section 0Z.

- Nom officiel du logiciel : **Liria Gestion Pro**. `LIRIA CONCEPT` reste le nom de l’entreprise de Julien et l’identité utilisée sur ses documents commerciaux ; ne pas confondre les deux.
- Gestion des accès : la page `/parametres/acces` propose désormais un **Aperçu par poste**. L’administrateur ouvre une simulation en lecture seule, bascule ordinateur/téléphone et contrôle le menu, les modules Consulter/Gérer, les actions personnelles, les chiffres financiers, le pointage et le planning. La simulation consomme la même liste de navigation et les droits réellement enregistrés ; aucune usurpation de compte.
- Migration 53 appliquée et contrôlée : une note de frais accepte un `chantier_id` optionnel, contraint à la même entreprise. Voir ou gérer les notes de l’équipe exige simultanément `gerer_notes_frais` et `voir_indicateurs_financiers` côté interface, actions serveur, table RLS et justificatifs privés. Admin/Gérant et RH comptable sont autorisés ; Chef d’équipe et ouvrier restent limités à leurs propres notes. L’accès anon aux notes et à leurs documents est supprimé : en mode prototype, le module affiche un message de confidentialité sans exposer de données.
- Migration 54 appliquée et contrôlée : quatre droits sont désormais obligatoires pour tous les postes présents et futurs — `acces_planning`, `acces_pointage`, `saisir_son_pointage`, `saisir_ses_notes_frais`. Les RPC de création/modification d’un poste les réinjectent toujours et l’UI les affiche désactivés avec le badge « Inclus pour tous ».
- Employés : la date de sortie disparaît du formulaire tant que le statut n’est pas `sorti`, devient obligatoire pour un salarié sorti et est effacée si le salarié redevient actif. Le changement rapide vers Sorti enregistre la date du jour. L’ancienneté est calculée depuis la date d’entrée, arrêtée à la date de sortie, puis affichée sur les cartes mobiles, le tableau et la fiche.
- Migrations 47 et 48 contrôlées comme déjà appliquées : tables habilitations_employe et notes_frais présentes, deux policies chacune et accès prototype actifs.
- Migration 49 appliquée : correction définitive de « permission denied for function generer_numero_inscription_employe ». Le trigger de numéro s’exécute en security definer, tandis que le générateur reste inaccessible directement. Test réel sous le rôle anon dans une transaction annulée : création réussie, aucune fiche de test conservée.
- Migration 50 appliquée : notes de frais strictement personnelles. Chaque poste reçoit le droit de déposer ses propres frais ; le salarié est dérivé du compte connecté et ne peut pas être remplacé par le formulaire. Le responsable/comptable possède un droit séparé pour voir et traiter l’équipe. Quatre policies authenticated et un bucket privé notes-frais contrôlés.
- Migration 51 appliquée : chaque nouvelle commande en authentification réelle enregistre automatiquement le compte et, s’il existe, la fiche employé qui l’a réellement créée. Aucun formulaire ne permet de commander au nom d’un autre salarié.
- Le pointage était déjà protégé par la migration 45 : arrivée et départ uniquement pour la fiche liée au compte ; la gestion/validation d’équipe reste une autorisation séparée.
- Parcours accès vérifié : invitation personnelle par numéro BTP, invitation générale par code entreprise, installation PWA depuis l’inscription, puis choix activer sa fiche / rejoindre une entreprise / créer une entreprise.
- Liste des employés améliorée pour le mobile (commit `b41f747`, déployé et vérifié) : cartes à 390 px avec numéro interne/BTP, fonction, contrat, contact, coût, état du compte applicatif, poste d’accès et droits Consulter/Gérer/Personnel dépliables. Le tableau détaillé reste affiché sur ordinateur. Test visuel et dépliage des autorisations réussis.
- Flotte et Outillage adaptés au mobile : cartes dédiées sous 768 px, tableaux conservés sur ordinateur. La liste Flotte montre désormais aussi l’ouvrier assigné, les alertes contrôle/assurance et un accès explicite aux factures/travaux. L’Outillage montre affectation, disponibilité, état, statut et vérification échue. Lint, TypeScript, build webpack et contrôle local des deux routes verts.
- Clients et Chantiers adaptés au mobile : cartes dédiées avec référence, statut et informations principales, plus un bouton pleine largeur vers la fiche et le suivi. Filtres et tableaux ordinateur sont conservés.
- Devis et Factures adaptés au mobile : cartes avec client, statut, date, montant et action pleine largeur pour ouvrir/envoyer/télécharger. Les devis affichent le chantier ; les factures affichent échéance et reste à encaisser. Filtres, indicateurs et tableaux ordinateur conservés.
- Nouveau devis : création rapide de chantier rendue explicite. Le bouton `+ Nouveau chantier` reste toujours visible ; sans client il ouvre le formulaire avec l’instruction de rattachement, puis s’active dès le choix du client. Après création rapide d’un nouveau client, le formulaire Nouveau chantier s’ouvre automatiquement. Le chantier créé est ajouté à la liste et présélectionné. Parcours navigateur vérifié sans créer de donnée de test.
- Migration 52 appliquée et contrôlée : nouveau droit séparé `voir_indicateurs_financiers`. Les totaux facturé/encaissé/reste/devis acceptés, les montants des alertes et ceux du suivi devis sont masqués sans ce droit. Deux postes de gestion seulement le possèdent actuellement ; les autres postes restent explicitement à `false`.
- Accueil terrain : le salarié connecté voit son propre pointage arrivée/départ et ses prochaines affectations. Le serveur et la RLS dérivent la fiche liée au compte : même un responsable ne peut jamais pointer au nom d’un collègue ; `gerer_pointage` sert seulement à consulter/valider l’équipe.
- Mobile : bouton Menu renforcé (zone tactile et calques), bouton Retour déterministe vers la page parente et supprimé du tableau de bord. L’accueil affiche `Bonjour Prénom` en auth réelle et simplement `Bonjour` dans le prototype.
- Authentification réelle toujours volontairement non activée : DISABLE_EMAIL_LOGIN reste à true. Ne pas couper le prototype sans la validation finale de Julien et le test du compte propriétaire.
- Limite à retenir : le prototype masque désormais les chiffres globaux, mais il ne peut pas identifier un ouvrier différent. Les droits individuels complets exigent la bascule coordonnée auth réelle + `supabase/production/sortie_mode_prototype.sql`, uniquement après accord explicite car elle change le mode d’accès de tous les utilisateurs.
- Contrôles base : habilitations=true, notes=true, correctif employé=true, deux droits notes=true, quatre policies notes, bucket privé=true, auteur commande=true, droit chiffres=true, pointage personnel=true.
- Contrôles code : lint, TypeScript, build webpack et diff-check verts.

## 0Z. NOUVEAU LOT UTILISATEUR — 13 juillet 2026 (À TRAITER EN PRIORITÉ)

Demandes et bugs remontés par Julien après tests sur mobile. **Traiter d'abord les BUGS (mobile prod cassé).**

### 🐞 Bugs mobile (priorité haute)
1. ✅ **CORRIGÉ (Claude, commit `9a3ec99`, déployé + vérifié)** — Barre de menu trop haute / non cliquable + pas de retour. Fix dans `src/app/(app)/layout.tsx` (CSS mobile) : header `.app-shell>header` reçoit `padding-top:env(safe-area-inset-top)` + `height:auto` (bouton Menu enfin cliquable sous l'encoche iOS) ; `main` reçoit `padding-top: calc(4rem + safe-area + 0.5rem)` (le titre ET les liens « ← Retour » ne sont plus cachés sous le header fixe). Nouveau composant `src/components/MobileBack.tsx` = bouton retour flottant `router.back()` (mobile only, `md:hidden`), rendu dans le layout.
2. ✅ **CORRIGÉ (Claude, commit `9a3ec99`, déployé + vérifié)** — Le 404 n'était PAS que mobile : **toute fiche devis ET facture** renvoyait 404. Cause = **ambiguïté d'embed PostgREST** (`PGRST201`) : la migration 43 a ajouté une FK composite `xxx_chantier_entreprise_fkey` en plus de la FK simple `xxx_chantier_id_fkey`, donc `chantier:chantiers(...)` devenait ambigu → requête en erreur → `data` null → `notFound()`. Seules `devis` et `factures` sont concernées. Fix : préciser la FK dans les embeds — `chantier:chantiers!devis_chantier_id_fkey(...)` (devis/[id] + devis liste) et `chantier:chantiers!factures_chantier_id_fkey(...)` (factures/[id]). ⚠️ **À vérifier ailleurs** si d'autres tables reçoivent des FK composites plus tard (tester `select=id,chantier:chantiers(id)` par table).

### 🔧 Fonctionnalités demandées
3. ✅ **FAIT (Claude, commit `ebeb5b8`, déployé + testé)** — Nouveau devis : bouton **« + Nouveau chantier »** dans `DevisEditor` (création inline pour le client sélectionné, action JSON `creerChantierRapideAction` dans `actions/chantiers.ts`) + **champ de recherche** au-dessus du select chantier quand >4 chantiers. Testé end-to-end en prod (chantier créé + auto-sélectionné).
4. ✅ **FAIT (Claude, commit `a717e9e`, déployé + vérifié visuellement)** — Planning réécrit en **tableau lignes = ouvriers / colonnes = jours** (`src/app/(app)/planning/page.tsx`), cases = chantier + tâche + heures (couleur par chantier), total/ouvrier, jour courant surligné, `×` pour retirer une affectation. Formulaire d'ajout + nav semaine + partage email/WhatsApp conservés. Style MAYART.
5. 🟡 **CODE FAIT (Claude, commit `7f13675`, déployé), ⏳ migration 47 à exécuter** — `20260713000047_habilitations_employe.sql` (table habilitations SST/CACES/hauteur/électrique/amiante + dates). Page **`/employes/[id]/carte`** = badge complet (entreprise+SIRET, photo/carte, fonction, n° interne, chantiers affectés, statut carte BTP dérivé de l'expiration, habilitations + validité, **avertissement CIBTP obligatoire** + « copie numérique »). Lib `src/lib/carte-btp.ts`, actions `src/app/actions/habilitations.ts`, lien depuis `/employes/[id]`. — Spec initiale : **Carte BTP — vue complète par salarié** (dans la fiche employé / « Mon espace ») : photo ; nom + prénom ; employeur + SIRET ; fonction (poseur, chef d'équipe, chef de chantier…) ; numéro interne du salarié ; chantiers affectés ; **habilitations + dates de validité** (SST, CACES, travail en hauteur, habilitation électrique) ; **statut carte BTP** (valide / en attente / expirée / à renouveler) ; copie visuelle de la carte marquée « **copie numérique — ne remplace pas l'original** » ; bouton pour ouvrir l'attestation provisoire officielle CIBTP quand elle est valable. **⚠️ Avertissement obligatoire à afficher** : « Cette carte numérique est un badge professionnel interne. Elle ne constitue pas la Carte d'identification professionnelle BTP délivrée par CIBTP France. »
6. 🟡 **CODE FAIT (Claude, commit `82c86ba`, déployé), ⏳ migration 48 à exécuter** — `20260713000048_notes_frais.sql` (table notes_frais + statuts soumise/validée/remboursée/refusée). Page **`/notes-frais`** : formulaire scan (salarié, date, montant, catégorie, description, justificatif photo/PDF → bucket `documents-employes`) + liste pour le comptable avec changement de statut + justificatif via lien signé (`/api/notes-frais/[id]/justificatif`). Lib `src/lib/notes-frais.ts`, actions `src/app/actions/notes-frais.ts`. Entrée menu « Notes de frais » (permission `acces_achats`). — Spec initiale : un employé peut **scanner une facture / un justificatif** qui part **directement au comptable**.

**Note (Claude)** : le module **Mon espace** de Codex (fiche perso + carte BTP, `src/app/(app)/mon-espace/` + `src/app/api/mon-espace/`) a été **committé et publié** (commit `82c86ba`) car il était fonctionnel (build vert) et son entrée menu était déjà dans `Sidebar.tsx` — cela évitait un lien mort en prod. Les fichiers doublons `*page 2.tsx` / `StockMovementForm 2.tsx` restent volontairement non suivis.
7. **Actions strictement au nom propre** : chaque employé n'agit **que pour lui-même** — il ne peut **pas pointer, commander, ni agir au nom d'un autre**. Selon ses autorisations (`gerer_*`) il peut gérer certaines choses pour l'équipe (ex. valider des pointages), mais jamais **saisir** un pointage/une commande à la place de quelqu'un d'autre. À auditer sur tous les flux de création.
8. **Accès / installation** : deux entrées possibles — soit **installer l'app** (PWA) soit **recevoir une invitation** donnant accès à son compte. Si installation directe : proposer **créer une entreprise** OU **rejoindre une entreprise** avec l'identifiant/code donné par l'admin. (Le socle existe — code entreprise + invitation par numéro — à vérifier de bout en bout en auth réelle.)

---

## 0A. MISE À JOUR CODEX — 12 juillet 2026 (ÉTAT AUTORITATIF)

Cette section **prime sur les mentions “à faire / migration à exécuter” plus bas**, conservées uniquement comme historique.

- **Migrations hébergées appliquées jusqu’à 37**, avec le trou volontaire `28` : `29 planning_hebdomadaire`, `30 acces_modules`, `31 membres_postes`, `32 logo_entreprise`, `33 pointage_preuves`, `34 stock_import_nuanciers`, `35 code_entreprise`, `36 plateforme_abonnements`, `37 depenses_actifs_documents`. La migration 28 n’existe plus dans `migrations/` : le script de coupure du prototype est rangé dans `supabase/production/sortie_mode_prototype.sql` et reste **NON APPLIQUÉ**.
- **Migration 36 passée et contrôlée** : colonne abonnement, propriétaire `julien.gregurec@gmail.com`, RPC de liste/modification et droit `authenticated` tous vérifiés `true`. `/plateforme` répond HTTP 200 et affiche LIRIA CONCEPT + les statuts.
- **Planning** : vue semaine visuelle, tâche = date + heures + chantier + plusieurs ouvriers, partage email/WhatsApp. Migration 29 et test multi-ouvriers réussis, données test supprimées.
- **Accès & rôles** : droits par module, rôles, affectation des comptes, suppression de rôle vide, navigation filtrée et routes protégées en auth réelle. Code d’entreprise + membre en attente + activation par poste appliqués.
- **Email/PDF** : fenêtre email devis/facture avec destinataire, CC multiples, objet/message, accès PDF et passage automatique au statut envoyé. SMTP + pièce jointe automatique reste dépendant d’un fournisseur externe.
- **Logo** : import entreprise sécurisé, logo LIRIA fourni déjà importé dans le bucket public dédié et utilisé par navigation/PDF.
- **Pointage terrain** : GPS, précision, photo privée obligatoire, carte, statut à vérifier, validation/rejet et commentaire.
- **Stock** : import atomique XLSX/CSV/PDF (catalogue ou inventaire), nuanciers, codes-barres, sélection de teinte et mouvement via douchette/saisie. Test Excel réel : article + quantité + mouvement + teinte validés puis nettoyés.
- **Flotte/outillage/dépenses** : véhicule assigné à un ouvrier, facture fournisseur liée à chantier + employé + véhicule ou outil, historique et total par actif, PDF/photo de facture dans stockage privé.
- **Listes intelligentes** : véhicule avec repli local + modèles vPIC officiels ; outillage avec suggestions BTP ; saisie libre toujours autorisée.
- **Suivi complet** : lire `SUIVI_BESOINS_METIER.md`.
- **Dépendances ajoutées** : `@excel.js/exceljs` et `unpdf`. Le fork Excel ne ramène pas la dépendance `uuid` vulnérable de l’ancien paquet `exceljs`. `npm audit` conserve seulement les 2 alertes modérées préexistantes liées à Next/PostCSS.
- **Validation finale verte** : `npm run lint`, `npx tsc --noEmit --incremental false`, `npx next build --webpack`, `git diff --check`. Build : 42 pages statiques générées, routes nouvelles `/plateforme`, `/stock/[id]`, `/api/referentiels/vehicules` incluses.
- **Sécurité production** : `supabase/production/sortie_mode_prototype.sql` a été complété avec toutes les RPC 30–37. Nouveau dry-run complet `BEGIN … ROLLBACK` réussi ; après rollback, fonction prototype présente, droit anon présent et 46 policies anon intactes. Ne pas l’appliquer tant que `DISABLE_EMAIL_LOGIN=true` et sans sauvegarde/validation explicite.

---

## 0. MISE À JOUR — reprise Claude, 12 juillet 2026 (fin de journée)

**⚡ L'APPLICATION EST EN PRODUCTION.**

- **URL prod : https://liria-concept-gestion-btp.vercel.app** (Vercel, équipe `julien-gregurec`, plan Hobby, projet unique `liria-concept-gestion-btp`).
- **GitHub** : `github.com/julien-gregurec/Appli_BTP`, désormais **privé** et **peuplé** (il était vide avant, d'où les échecs de déploiement initiaux). Branche `main`. Le dépôt local a un remote `gh` → push fonctionne via le trousseau macOS (osxkeychain). **Pour redéployer : `git push gh main`** (même un commit `--allow-empty`) → Vercel rebuild auto (~50 s, `next build`).
- **Variables d'env Vercel (projet)** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, et **`DISABLE_EMAIL_LOGIN=true`**.
  - ⚠️ `DISABLE_EMAIL_LOGIN=true` en prod = **l'app s'ouvre sans connexion** (« Bonjour Prototype »), donc **accessible à quiconque a l'URL**. C'est un choix temporaire de l'utilisateur (test/démo). **À repasser à `false` + lancer le script de durcissement avant un vrai usage.** Après changement d'une variable Vercel, il faut **redéployer** (push) pour qu'elle prenne effet.
- **Changement de préréglage Vercel** : le framework doit être **Next.js** (piège : ne pas confondre avec « NestJS » ni laisser « Other »). Build Command / Output Directory = laisser **auto** (ne rien mettre).

**Correctif script de production (fait par Claude)** : `supabase/production/sortie_mode_prototype.sql` re-accordait `EXECUTE` à `authenticated` sur 15 RPC mais en **oubliait 6** pourtant appelées par l'app (`creer_poste_avec_permissions`, `enregistrer_permissions_poste`, `modifier_poste_membre`, `supprimer_poste_vide`, `importer_articles_stock`, `valider_preuve_pointage`). **Les 6 grants ont été ajoutés** — sans quoi la gestion des accès, l'import d'articles et la validation des pointages tombaient en « permission denied » après la coupure. Voir `PRODUCTION_CHECKLIST.md`.

**Ajout fonctionnel (Claude)** : bouton **« Envoyer par email »** sur les fiches devis ET facture (lien `mailto:` pré-rempli destinataire/objet/corps, helper `src/lib/email.ts`) — zéro dépendance. Grisé si le client n'a pas d'email.

**⚠️ ÉCART IDENTIFIÉ — gestion des comptes employés (À FAIRE, non commencé)** :
- Il **n'existe AUCUN moyen pour l'admin de créer/inviter le compte d'un employé.**
- `/parametres/acces` gère les **postes** + **permissions par module** + **affectation d'un poste à un membre déjà présent** — mais rien pour **ajouter un membre**.
- `/onboarding` ne fait que **créer une nouvelle entreprise** (le créateur devient Admin/Gérant) ; **pas d'option « rejoindre une entreprise existante »**, pas d'invitation.
- Conséquence : une entreprise n'a qu'**un seul compte** (l'admin). La section « Comptes et postes » reste vide de collègues.
- **Solution recommandée à construire** : invitation par email (table `invitations` : entreprise_id, email, poste_id, token, statut ; l'employé s'inscrit via le lien → rattachement auto à l'entreprise + poste). Alternative : code d'entreprise partagé. **Nécessite une migration SQL + UI.** En attente du choix de l'utilisateur (email vs code).

**NOUVELLE FONCTIONNALITÉ — Code d'entreprise + rattachement des employés (migration appliquée)** :
- Choix utilisateur : **code d'entreprise** (pour à terme facturer chaque entreprise/code). L'admin partage un code ; l'employé le saisit à l'inscription pour rejoindre l'entreprise ; il arrive **« en attente »** ; l'admin l'active en lui affectant un poste.
- **✅ Migration appliquée : `supabase/migrations/20260710000035_code_entreprise.sql`** — colonne `entreprises.code_adhesion` (unique, 8 car., trigger de génération + backfill), RPC `rejoindre_entreprise_par_code(text)` et activation par affectation d’un poste.
- Code applicatif (déjà en place) : `rejoindreEntrepriseAction` dans `src/app/actions/entreprise.ts` ; `getContexteEntreprise` (src/lib/entreprise.ts) redirige un membre non-actif vers **`/en-attente`** (nouvelle page) ; `/onboarding` propose « Créer » **ou** « Rejoindre avec un code » ; `/parametres/acces` **réécrit lisible** : affiche le **code d'entreprise** + liste les membres **en attente** (badge) que l'admin valide via « Valider » (= affecter un poste).
- ✅ **DÉPLOYÉ EN PROD (commit `988fc70`)** : migration 35 appliquée (LIRIA a le code `BW2HYQTA`), page `/parametres/acces` vérifiée en prod (affiche le code + « Comptes et postes »). Le **rattachement par code lui-même** ne s'active qu'en **auth réelle** (`DISABLE_EMAIL_LOGIN=false`) — à tester quand l'utilisateur réactivera le login.
- ⚠️ **Piège auth git rencontré** : une session avait mis un helper `credential.https://github.com.helper` = `!/tmp/gh_install/.../gh` dans `~/.gitconfig` (global) ; le binaire temporaire ayant été supprimé, `git push` échouait. **Corrigé** : `gh` réinstallé à un emplacement STABLE `~/.local/gh/bin/gh` (v2.96.0, compte `julien-gregurec`, token `gho_…` scope `repo`), et `git config --global credential."https://github.com".helper "!$HOME/.local/gh/bin/gh auth git-credential"`. Les push fonctionnent désormais.
- **DIRECTION SAAS validée** : l'utilisateur veut **vendre le logiciel à d'autres entreprises du BTP** (chaque code = client facturable). Feuille de route : Étape 0 codes entreprise (fait) · Étape 1 espace propriétaire plateforme (en cours, voir ci-dessous) · Étape 2 Stripe (abonnements/paiement — nécessite compte Stripe + tarifs + clés de l'utilisateur) · Étape 3 landing + inscription self-service. Super-admin identifié **par email**.

**ÉTAPE 1 — Espace propriétaire plateforme (migration appliquée et contrôlée)** :
- **✅ Migration appliquée : `20260710000036_plateforme_abonnements.sql`** — ajoute les statuts/échéance/note d’abonnement, le propriétaire et les RPC gardées. Vérification structurelle complète réussie.
- Code : `src/lib/plateforme.ts` (`estPlateformeAdmin()` → **true en mode prototype** pour démo, sinon RPC email) ; `src/app/actions/plateforme.ts` ; page **`/plateforme`** (liste des entreprises + stats + édition du statut d'abonnement par entreprise) ; lien **★ Plateforme** dans `Sidebar` (prop `plateformeAdmin`, calculé dans `(app)/layout.tsx`).
- En mode prototype la page requête `entreprises` directement (colonnes ajoutées par la migration) ; en auth réelle elle passe par la RPC gardée par email. **La restriction par email n'est effective qu'en auth réelle** ; en prototype (prod actuelle, public) l'écran est visible de tous — acceptable tant qu'il n'y a qu'une entreprise, à resserrer avant d'ouvrir le SaaS.
- Reste Étape 2 (Stripe) à faire ; nécessite les choix tarifaires et les clés du compte Stripe.

**État qualité au moment de la reprise** : `npx tsc --noEmit`, `npm run lint`, `npx next build --webpack` = **verts** (y compris après l'ajout du code d'entreprise). Modules live testés en prod (10 routes → HTTP 200).

**Note** : à ce stade le tableau de bord prod affiche « Total facturé 0,00 € » — à confirmer si l'utilisateur s'attend à retrouver des données de test (mêmes DB Supabase).

---

## 1. Projet & environnement

- **Dépôt local** : `/Users/juliengregurec/Documents/btp-platform`
- **Stack** : Next.js `16.2.10` (App Router, Turbopack par défaut en dev, dossier `src/`), React 19, TypeScript, Tailwind v4, `@supabase/ssr`.
- **Node via nvm** : binaire dans `/Users/juliengregurec/.nvm/versions/node/v24.18.0/bin` — **PAS dans le PATH par défaut**. Avant toute commande npm/npx en shell : `source "$HOME/.nvm/nvm.sh"`.
- **Pas de Docker ni de brew**. Pas de CLI Supabase globale et projet non lié ; le paquet `supabase` existe toutefois en devDependency et `npx supabase` est disponible localement.
- **⚠️ Lire `AGENTS.md`** à la racine : ce Next.js 16 a des ruptures d'API. Consulter `node_modules/next/dist/docs/` avant de coder. Points déjà gérés : `middleware` renommé `proxy` (`src/proxy.ts`), `cookies()` asynchrone, groupe de routes `src/app/(app)/` pour les pages authentifiées.

## 2. Supabase

- **Projet hébergé** : `https://uykukebthgmqtxlmkpnn.supabase.co` (organisation « Application julien »).
- **Clé publique** (format récent `sb_publishable_...`) dans `.env.local` (gitignored). Elle est faite pour être publique (protégée par RLS).
- **Entreprise unique en base** : `ENT-001`, id `cc90ee48-7c9a-4983-a143-0df72ca0c937`, nom **LIRIA CONCEPT**.

### Application des migrations — IMPORTANT
- Les fichiers `supabase/migrations/*.sql` sont appliqués **MANUELLEMENT** : copier/coller dans le **SQL Editor** de Supabase. **Aucun lien CLI**, aucune application automatique.
- Après une migration qui crée des tables : cliquer **« Run and enable RLS »** dans le popup.
- Le **cache de schéma PostgREST peut être en retard** : si l'app dit « Could not find the table … in schema cache », lancer `notify pgrst, 'reload schema';` (déjà ajouté en fin de chaque migration récente) ou redémarrer le projet.
- Relancer une migration déjà passée → erreur « relation already exists » = **inoffensif**, ça veut juste dire qu'elle est déjà appliquée.
- **Piège éditeur SQL** : toujours créer un **nouveau snippet vierge**, coller, vérifier visuellement la fin du fichier, puis exécuter (un onglet réutilisé a déjà mélangé deux requêtes).

## 3. Mode PROTOTYPE sans connexion (TEMPORAIRE — à retirer avant prod)

- `.env.local` contient `DISABLE_EMAIL_LOGIN=true`.
- `src/lib/auth-mode.ts` → `isEmailLoginDisabled()` pilote le mode.
- Quand actif : le `proxy` saute l'auth, `getContexteEntreprise()` appelle la RPC `dev_contexte_entreprise()` (migration 08) qui renvoie la 1ʳᵉ entreprise (LIRIA CONCEPT, ENT-001) comme utilisateur « Prototype », et la RLS est contournée par une policy `prototype acces anonyme` + des grants larges au rôle `anon`.
- **Conséquence** : l'app est utilisable en local **sans login**. Pour tester : lancer le serveur et naviguer, aucune authentification nécessaire. On peut aussi lire/écrire directement via l'API REST avec la clé publique.

## 4. État Git

- Le dépôt repose **presque entièrement sur des fichiers non suivis** depuis le commit initial. **NE PAS** lancer de reset/checkout/clean destructif.
- Repo GitHub distant `github.com/julien-gregurec/Appli_BTP` existe mais **vide** — l'utilisateur n'a **pas** voulu pousser (le garder local / éventuellement passer en privé d'abord). **Ne rien pousser sans demander.**

## 5. Modules fonctionnels (tous testés navigateur)

Menu latéral : Tableau de bord · Clients · Chantiers · Devis · Prestations · Factures · Commandes · Fournisseurs · Dépenses · Charges récurrentes · Planning · Employés · Pointage heures · Rentabilité · Trésorerie · Stock · Flotte automobile · Outillage · Dépôt · Inventaires · Exports comptables · Paramètres. Tous les modules affichés sont actifs.

- **Comptes & Entreprises** : entreprise, postes, permissions_poste, RLS, bootstrap admin, références auto `ENT-001`.
- **Clients & Chantiers** : fiches, contacts, types de chantier (auto-seedés), tâches, transferts, workflow statut chantier (12 statuts), références `CLI-0001` / `CHA-2026-001`. Recherche + filtres. Fiche client enrichie (total facturé/encaissé/reste dû, 5 derniers devis/factures). Fiche chantier enrichie (devis acceptés, facturé, encaissé, heures planifiées, compteur et accès au coffre documentaire). Bouton « Nouveau devis » présélectionne client **et** chantier.
- **Employés** : liste/création/fiche/modif/statut, références `EMP-0001`+, `taux_horaire` (facturé) vs `cout_horaire` (interne), FK `responsable_id` sur chantiers.
- **Planning (refonte)** : modèle **affectation** = chantier + employé + date + heures + tâche (fini début/fin). Récaps « heures par chantier » et « heures par ouvrier ». Table `affectations` (migration 11). L'ancienne table `planning_evenements` est **dormante** (non utilisée), `StatutPlanningSelect.tsx` supprimé.
- **Devis** : éditeur avec lignes dynamiques + calcul HT/TVA/TTC temps réel, statuts, numéro `DEV-2026-001` généré à l'envoi (pas sur brouillon), modification des brouillons (`/devis/[id]/modifier`), duplication, recherche/filtres. Insertion de prestations préenregistrées. **Création d'un client à la volée** depuis l'éditeur (bouton « + Nouveau client »).
- **Prestations préenregistrées** (catalogue) : `/prestations`, création/modif/activation, 5 prestations BTP seedées, insertion dans le devis, enregistrement rapide d'une ligne manuelle vers le catalogue.
- **Factures** : création depuis devis **accepté** (copie des lignes en snapshot figé), `date_echeance` auto depuis le délai de paiement client, statuts, paiements (avec contrôles : refus sur brouillon/annulée/avoir, refus si dépasse le reste dû), suppression de paiement vérifiée, modification des brouillons (`/factures/[id]/modifier`), recherche/filtres, indicateurs facturé/encaissé/reste. Numéro `FAC-2026-001`. **Statuts payée/partiellement payée pilotés automatiquement par les paiements** (triggers).
- **Impression / PDF** : routes `/imprimer/devis/[id]` et `/imprimer/factures/[id]` (layout dédié sans sidebar), composant `DocumentImprimable` (A4, style inline, en-tête entreprise + logo, client, lignes, totaux, mentions légales BTP — pénalités uniquement sur factures), composant `AutoPrint` qui déclenche `window.print()` → « Enregistrer au format PDF ». Boutons « Télécharger PDF » sur les fiches devis/facture.
- **Envoi par email (mailto)** : bouton « Envoyer par email » sur les fiches devis **et** facture → ouvre le client mail par défaut avec destinataire (email du client), objet et corps FR pré-remplis (montant TTC + rappel de joindre le PDF + signature entreprise). Helper `src/lib/email.ts` (`lienMailtoDocument`). Zéro dépendance / clé API. Bouton grisé si le client n'a pas d'email. (Envoi SMTP automatique avec PDF joint = évolution future si besoin, nécessiterait Resend/Nodemailer + clé.)
- **Commandes fournisseurs** (migration 21 appliquée et testée) : `/fournisseurs` (carnet + création + activer/désactiver), `/commandes` (liste), `/commandes/nouveau` (`CommandeEditor` : fournisseur avec **création inline**, chantier optionnel, dates, description, lignes qté×PU HT/TVA, total live), `/commandes/[id]` (détail, transitions SQL guardées, réception cumulative partielle/complète et suppression brouillon/annulée). Création en-tête+lignes atomique par RPC, totaux recalculés en base, liens fournisseur/chantier/commande isolés par entreprise. Nav active.
- **Photos & documents chantier** (migration 22 appliquée et testée) : `/chantiers/[id]/documents`, dépôt privé Supabase limité à 15 Mo, images/PDF/Word/Excel, 8 catégories métier, note, galerie avec aperçu image, téléchargement par URL signée 60 s et suppression confirmée. Métadonnées et objets Storage sont isolés par entreprise ; le mode prototype n’ouvre que le bucket dédié. La fiche chantier affiche le compteur et le lien direct.
- **Flotte automobile** (migration 23 appliquée et testée) : `/flotte`, création et fiche véhicule, immatriculation unique, marque/modèle/type/statut, kilométrage, échéances contrôle technique/assurance/entretien et historique des relevés. Le trigger verrouille le véhicule et interdit tout recul du kilométrage. Nav active.
- **Outillage** (migration 24 appliquée, auditée et testée) : `/outillage`, registre individuel avec référence `OUT-0001`, catégorie, marque/modèle/série, état, prix et vérification. Fiche avec affectation employé/chantier, retour, maintenance, remise en service, hors service et perte. Chaque transition est validée sous verrou et historisée par RPC ; les rôles applicatifs ne peuvent ni modifier ni supprimer directement un outil.
- **Dépôt & Inventaires** (migration 25 appliquée et testée) : `/depot` gère les zones physiques et l’emplacement normalisé des articles ; une zone « Dépôt principal » est seedée. `/inventaires` crée un instantané du stock global ou d’une zone, enregistre tous les comptages puis valide atomiquement les écarts en mouvements d’ajustement. Si le stock change pendant le comptage, la validation est refusée pour éviter une correction erronée.
- **Exports comptables CSV** : `/exports`, période configurable et trois téléchargements privés : journal des ventes, journal des règlements, détail + synthèse TVA par facture/taux. CSV UTF-8 BOM, séparateur `;`, décimales françaises, noms de fichiers explicites, avoirs négatifs et protection contre l’injection de formules. Les brouillons sans numéro sont exclus et chaque requête est filtrée par entreprise.
- **Dépenses fournisseurs & rentabilité réelle** (migration 26 appliquée, auditée et testée) : `/depenses` enregistre les factures d’achat avec fournisseur, chantier, commande optionnelle, catégorie, HT/TVA/TTC, échéance et règlements. Anti-doublon fournisseur+n° pièce, cohérence commande/fournisseur/chantier, surpaiement refusé sous verrou et statut payé automatique. Les dépenses HT non annulées sont déduites chantier par chantier dans `/rentabilite`, en plus du coût de main-d’œuvre.
- **Trésorerie prévisionnelle** : `/tresorerie`, encaissements et décaissements réalisés sur 30 jours, total à recevoir/à payer et projection hebdomadaire sur 13 semaines. Les factures/charges en retard sont ramenées en première semaine, les échéances au-delà de 90 jours sont exclues, et la variation cumulée est affichée en tableau et barres. La page précise qu’il s’agit d’une variation, pas d’un solde bancaire.
- **Charges récurrentes** (migration 27 appliquée et testée) : `/charges`, loyer/assurance/abonnement/location avec fournisseur, catégorie, chantier optionnel, périodicité mensuelle/trimestrielle/annuelle, HT/TVA et prochaine échéance. Les occurrences futures alimentent la trésorerie. La matérialisation atomique crée la dépense fournisseur réelle puis avance l’échéance, sans double comptage.
- **Tableau de bord** : CA facturé/encaissé/reste, devis acceptés/à suivre, chantiers actifs, prochaines affectations et **centre d’alertes opérationnelles consolidé**. Les alertes sont triées critique/à anticiper et couvrent factures, devis, livraisons fournisseurs, seuils de stock, contrôle technique/assurance/entretien flotte et vérifications outillage, avec lien direct vers l’objet à traiter.
- **Pointage heures** : `/pointage`, saisie heures normales/supp/pause/tâche/commentaire par employé+chantier+date, filtre mensuel, totaux, suppression confirmée (migration 18).
- **Rentabilité** : `/rentabilite`, agrège par chantier devis acceptés + factures HT + heures pointées, coût main-d'œuvre via `employes.cout_horaire`, marge estimée + taux. Précise que matériaux/sous-traitance/frais généraux ne sont pas encore déduits.
- **Stock** : `/stock`, articles (référence unique, unité, emplacement, seuil, prix achat HT), entrées/sorties chantier/ajustements, stock màj sous verrou par trigger (sortie > dispo refusée), synthèse valeur d'achat + alertes (migration 19).
- **Paramètres** : `/parametres`, modification identité/adresse/SIRET/assurances/pénalités/textes documents ; alimente les impressions.
- **Sécurité applicative** : les server actions (clients, employés, planning, prestations, chantiers, tâches, devis, factures) vérifient explicitement `entreprise_id` **en plus** de la RLS. Composant `ConfirmSubmitButton` pour les actions sensibles.

## 6. Migrations appliquées sur la base hébergée (01–27 et 29–37)

`01 comptes_entreprises` · `02 trigger_profil` · `03 bootstrap_entreprise` · `04 clients_chantiers` · `05 devis` · `06 factures` · `07 consolidation_financiere` · `08 mode_sans_connexion` · `09 planning` · `10 employes` · `11 affectations` · `12 prestations_catalogue` · `13 modification_devis_atomique` · `14 duplication_devis` · `15 creation_devis_atomique` · `16 delai_paiement_client` · `17 modification_facture_atomique` · `18 pointages` · `19 stock` · `20 synchro_statuts` · `21 commandes_fournisseurs` · `22 documents_chantier` · `23 flotte` · `24 outillage` · `25 depot_inventaires` · `26 depenses_fournisseurs` · `27 charges_recurrentes`.

Puis : `29 planning_hebdomadaire` · `30 acces_modules` · `31 membres_postes` · `32 logo_entreprise` · `33 pointage_preuves` · `34 stock_import_nuanciers` · `35 code_entreprise` · `36 plateforme_abonnements` · `37 depenses_actifs_documents`. Le numéro 28 est réservé au script manuel de production sorti du dossier automatique.

**Migration 20 appliquée et renforcée après audit** : recalcul paiements sérialisé sous verrou, paiements positifs, transfert ancien/nouveau document, préservation du statut en retard, cascade devis→chantier et facture finale/simple→chantier. Les acomptes, situations et avoirs ne clôturent jamais un chantier. Les liens document/chantier sont contraints à la même entreprise et les helpers `SECURITY DEFINER` internes sont interdits à `anon`/`authenticated`. Backfill confirmé : FAC-2026-001/002/003 sont `payee`, montants payés égaux au TTC ; `CHA-2026-001` est `facture`.

**Migration 21 appliquée et renforcée après audit** : références annuelles, contraintes de dates/TVA/quantités, FK composites d’isolation entreprise, création atomique commande+lignes, transitions SQL atomiques et réception partielle/complète. Test SQL transactionnel multi-TVA réussi (35 € HT, 5,50 € TVA, 40,50 € TTC), sur-réception refusée, réception partielle puis complète. Test navigateur réussi avec création fournisseur inline et commande `CMD-2026-001` à 36 € ; les données de test ont ensuite été supprimées et les compteurs de tables contrôlés à zéro. RPC métier accessibles, helpers internes non exécutables par `anon`.

**Migration 22 appliquée et testée** : table `documents_chantier`, bucket privé `chantier-documents`, limite 15 Mo et formats contrôlés. FK composite chantier/entreprise, RLS membres et policies Storage par premier dossier `entreprise_id`. Test réel réussi : ajout d’une pièce technique temporaire, affichage dans `/chantiers/[id]/documents`, téléchargement HTTP 307 vers une URL signée, puis suppression via l’interface avec compteur revenu à zéro.

**Migration 23 appliquée et testée** : tables `vehicules` et `releves_kilometrage`, FK composite et RLS. Test navigateur : utilitaire temporaire créé à 10 000 km, relevé à 10 150 km, compteur et historique mis à jour ; véhicule et relevé de test supprimés ensuite.

**Migration 24 appliquée, auditée et testée** : tables `outils` et `mouvements_outillage`, références automatiques, FK composites et RLS. RPC atomique pour les transitions d’affectation ; double affectation refusée. Test navigateur complet création → affectation à Julien → retour, puis test direct du verrou avec 4 événements d’historique avant nettoyage. Outil temporaire supprimé, aucun résidu. Audit privilèges confirmé : `anon UPDATE=false`, `anon DELETE=false`, RPC métier exécutable.

**Migration 25 appliquée et testée** : `zones_depot`, `inventaires`, `lignes_inventaire`, rattachement `zone_id` sur stock/outillage et deux RPC atomiques. Test réel : article temporaire initialisé à 10, inventaire `INV-2026-001` compté à 8, un ajustement moins créé et stock final 8 ; seconde validation refusée. Second test : mouvement concurrent pendant le comptage, validation refusée et brouillon préservé. Tous les articles, mouvements et inventaires temporaires ont été supprimés (compteurs 0/0).

**Migration 26 appliquée, auditée et testée** : `depenses_fournisseurs` et `reglements_fournisseurs`, FK composites, cohérence automatique avec la commande, statut de règlement recalculé et plafond TTC sous verrou. Test navigateur : pièce temporaire 100 € HT / 20 € TVA, paiement partiel 50 €, surpaiement 71 € refusé, solde 70 €, statut `payee` et coût chantier HT 100 €. `/rentabilite` est passé de 15 090 € à 14 990 € de marge pendant le test, puis revenu à zéro achat après nettoyage. Dépense et fournisseur temporaires supprimés (0/0). Audit privilèges : modification/suppression directe de l’en-tête interdites à `anon`.

**Migration 27 appliquée et auditée** : `charges_recurrentes`, lien vers `depenses_fournisseurs` et RPC `materialiser_charge_recurrente`. Audit SQL confirmé table/colonne/RPC/grant. Test navigateur : charge mensuelle 50 € HT + 10 € TVA, projection 90 jours à 180 €, matérialisation d’une dépense 60 €, échéance avancée du 12 juillet au 12 août et projection restée 180 € sans doublon. Dépense, charge et fournisseur temporaires supprimés (0/0/0).

**Script de production NON APPLIQUÉ** : `supabase/production/sortie_mode_prototype.sql` est volontairement hors des migrations automatiques. Il supprime toutes les policies `anon`, révoque tables/séquences/fonctions anonymes, verrouille les `SECURITY DEFINER`, réaccorde uniquement les helpers/RPC authentifiés et supprime `dev_contexte_entreprise`. Dry-run complet dans `BEGIN … ROLLBACK` réussi avec assertions : zéro policy anon, zéro lecture table anon, zéro `SECURITY DEFINER` anonyme, helper RLS et RPC métier authentifiés conservés. Rollback vérifié : `/dashboard` fonctionne encore comme Prototype.

**Préparation Auth production vérifiée sans exposer d’identité** : `ENT-001` a 1 membre actif et 1 poste ; profil public, compte Auth, entreprise active, email confirmé, mot de passe et ancienne connexion sont tous présents. Il reste à choisir l’hébergement/URL, sauvegarder puis autoriser explicitement le script manuel de sortie et `DISABLE_EMAIL_LOGIN=false`.

**RPC clés (SECURITY DEFINER)** : `dev_contexte_entreprise`, `creer_entreprise_bootstrap`, `creer_devis_brouillon`, `modifier_devis_brouillon` (approx.), `dupliquer_devis`, `creer_facture_depuis_devis(uuid,text)` (vérifie devis accepté + client + délai → `date_echeance`), `modifier_facture_brouillon`, recalculs totaux/paiements par triggers.

## 7. Rebranding LIRIA CONCEPT

- Entreprise `ENT-001` = **LIRIA CONCEPT**, adresse **9 rue du Maréchal Leclerc, 67860 Rhinau**, slogan **Concevoir • Aménager • Réaliser**, contact `06 50 93 11 87` / `liriaconcept@gmail.com`.
- **Charte** (dossier `~/Desktop/LIRIA CONCEPT/`) : bleu nuit `#0D1B2A`, or `#C9A24A`, anthracite `#1F2328`, blanc `#FFFFFF`. Reprise dans le PDF (en-tête, filet or, bandeau de tableau bleu nuit).
- **Logo** : `public/liria-concept-logo.png`, affiché dans la navigation et les PDF devis/factures.
- **Activité confirmée** (`LIRIA_CONCEPT_Dossier_Pro.pdf`) : agencement intérieur — cloisons amovibles, panneaux décoratifs, portes, vitrages, cabines sanitaires, sols stratifiés, fourniture + pose ; pros & particuliers. Statut envisagé : **Entreprise Individuelle au réel** (pas encore immatriculée). Tarifs : min 50 €/h, objectif 60 €/h.
- **⚠️ SIRET actuellement en base = `12345678900012` = valeur factice de test.** L'EI n'est pas encore créée. **NE PAS** reprendre le SIRET / capital / dénomination de l'ancienne structure `JULIEN GREGUREC MULTISERVICES` (SAS) présente dans les vieux PDF. À compléter avec les vraies infos légales une fois l'EI immatriculée (via `/parametres`).

## 8. Suivi des 5 retours utilisateur (batch du 11/07)

1. **Créer un client directement depuis le formulaire de devis** → **FAIT & testé (11/07)**. Bouton « + Nouveau client » dans `DevisEditor` → mini-formulaire (type, nom/prénom/société, tél, email, CP, ville) → « Créer et sélectionner » crée la fiche et la sélectionne automatiquement. Action JSON dédiée `creerClientRapideAction` (sans redirect) dans `src/app/actions/clients.ts`. Le garde-fou « il faut d'abord créer un client » de `devis/nouveau` a été retiré (on peut démarrer un devis sans aucun client existant).
2. **Refonte Planning (heures)** → **FAIT & testé** (migration 11).
3. **PDF téléchargeable devis/factures** → **FAIT & testé**. Envoi email = reporté (PDF d'abord).
4. **Synchro auto des statuts** → **FAIT, migration 20 appliquée et vérifiée**. FAC-002/003 corrigées en `payee`, cascade chantier active et durcie (voir §6).
5. **Lignes de prestation préenregistrées** → **FAIT** (module Prestations, migration 12).

## 9. Validations (état vert au 12/07/2026, après migrations 20-27)

```bash
source "$HOME/.nvm/nvm.sh"
cd ~/Documents/btp-platform
npm run lint                       # OK
npx tsc --noEmit --incremental false  # OK
npx next build --webpack           # OK (build de prod réussi)
git diff --check                   # OK (aucun conflit whitespace)
```

## 10. Lancer / tester en local

- Démarrer le serveur dev **sans bloquer sur le PATH** :
  ```bash
  cd /Users/juliengregurec/Documents/btp-platform && PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" npm run dev
  ```
  (Le fichier `~/.claude/launch.json` a une entrée `btp-platform-dev` pour l'outil de preview de Claude ; sous ChatGPT, lancer simplement `npm run dev`.)
- Un `next dev` fantôme peut rester bloqué (crash EPIPE) : `pkill -f "next dev"` puis `lsof -ti:3000,3003 | xargs kill -9`, puis relancer.
- **Astuce test des formulaires React contrôlés** : le remplissage champ par champ réinitialise parfois les refs. Fiable = un seul script JS qui utilise le setter natif `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` + dispatch `input`/`change`, remplit tous les champs d'un coup, puis clique le submit.
- **Test PDF** : naviguer vers `/imprimer/devis/[id]` rend le document A4 ; `window.print()` ne bloque pas le rendu, on peut capturer/valider directement.

## 11. Reprise recommandée (ordre)

1. Retours utilisateur #1→#5 terminés, migrations 20-27 et modules opérationnels/financiers prioritaires livrés.
2. **Passage production préparé mais volontairement non activé** : lire `PRODUCTION_CHECKLIST.md`, choisir l’URL/hébergement et confirmer la bascule. Le script manuel de production coupe définitivement le prototype anonyme.
3. Évolution nécessitant un choix/secret externe : envoi email SMTP réel (Resend) avec PDF joint.
3. Quand l'EI LIRIA est immatriculée : renseigner SIRET / assurances réels dans `/parametres` (retirer le SIRET factice `12345678900012`).
4. Avant prod : **retirer le mode prototype** (migration 08 + `DISABLE_EMAIL_LOGIN`) et réactiver l'auth réelle + RLS stricte.

## 12. Fichiers clés

- `src/components/DevisEditor.tsx` · `src/components/CommandeEditor.tsx` · `src/components/DocumentImprimable.tsx` · `src/components/AutoPrint.tsx` · `src/components/ConfirmSubmitButton.tsx` · `src/components/StatutCommandeSelect.tsx` · `src/components/Sidebar.tsx`
- `src/app/actions/{devis,factures,clients,chantiers,employes,planning,prestations,commandes,documents,flotte,outillage,depot,inventaires,depenses,charges}.ts`
- `src/lib/{devis,factures,commandes,documents,outillage,email,chantier-statuts,entreprise,auth-mode}.ts`
- `src/app/imprimer/{devis,factures}/[id]/page.tsx`
- `src/app/api/exports/comptabilite/route.ts` · `src/lib/csv.ts` · `src/app/(app)/exports/page.tsx`
- `src/app/(app)/tresorerie/page.tsx` · `src/lib/tresorerie.ts`
- `PRODUCTION_CHECKLIST.md` · `supabase/production/sortie_mode_prototype.sql` (**prêt, testé en rollback, non appliqué et hors migrations automatiques**)
- `src/app/(app)/…` : dashboard, clients, chantiers, devis, factures, commandes, fournisseurs, planning, employes, pointage, rentabilite, stock, prestations, parametres
- `supabase/migrations/*` (migrations 01 à 44 appliquées ; voir les sections de suivi)

## 13. Historique de démonstration LIRIA — 12 juillet 2026

- La base Supabase a été enrichie sans suppression des données existantes pour simuler plusieurs mois d'activité.
- Totaux après remplissage : **8 clients, 9 chantiers, 8 employés, 12 devis, 8 factures, 12 affectations planning, 13 pointages, 10 prestations, 12 articles et 20 mouvements de stock, 3 zones de dépôt, 1 inventaire validé, 7 fournisseurs, 5 commandes, 3 véhicules, 9 outils, 6 dépenses fournisseurs et 3 charges récurrentes**.
- Les données ajoutées sont cohérentes entre modules : devis et factures rattachés aux clients/chantiers, paiements et statuts automatiques, temps par équipe, sorties de stock par chantier, véhicules/outils affectés et dépenses reliées aux actifs.
- Les coordonnées ajoutées sont fictives et utilisent `example.fr` pour empêcher tout envoi accidentel à de vraies personnes.
- Le script idempotent est `scripts/seed-demo-history.mjs`. Il a été exécuté deux fois avec des compteurs strictement identiques, donc sans doublon.
- Marqueur technique des données : `HISTORIQUE_DEMO_LIRIA_2026` et références `DEMO-*`. Les données originales ont été conservées.

## 14. Lot terrain, emails et imports — 12 juillet 2026

- **Migrations 38 et 39 appliquées dans Supabase** : `sessions_pointage` avec RPC de clôture atomique, puis historique des affectations véhicule avec RPC atomique.
- `/pointage` propose arrivée puis départ avec GPS. Depuis la migration 41, la photo et la saisie manuelle ont été retirées du nouveau parcours (voir §17).
- Les commandes fournisseur disposent maintenant d’un **bon de commande A4/PDF** (`/imprimer/commandes/[id]`) et du même dialogue email avec destinataire/CC que les devis/factures. Un email fournisseur absent est signalé.
- La fiche véhicule affiche l’ouvrier courant, l’historique d’affectation, les factures associées avec chantier et un résumé des travaux récents de l’ouvrier assigné.
- Un outil `hors_service` reste impossible à affecter côté RPC et apparaît explicitement indisponible dans la liste.
- Imports XLSX/CSV/PDF ajoutés à `/flotte` et `/outillage` via `src/lib/import-assets.ts`.
- Les équipes peuvent prendre une photo directement depuis `/chantiers/[id]/documents` et la classer avant/pendant/après travaux.
- Contrôles : migrations accessibles en anon prototype, 3 affectations véhicules reprises, lint/TypeScript/build Next webpack verts, routes et écrans testés localement.

## 15. Adaptation mobile complète — 12 juillet 2026

- Navigation remplacée sur téléphone par un en-tête compact et un menu latéral coulissant avec fond bloquant et fermeture au changement de page.
- Le contenu commence sous l’en-tête mobile ; la barre latérale bureau reste inchangée à partir de 768 px.
- Règles responsives centralisées dans le layout : marges réduites, grilles/cartes/formulaires empilés, colonnes étendues, boutons tactiles, modales limitées à la hauteur de l’écran et tableaux avec défilement horizontal interne.
- Tests réels avec viewport **390×844** puis **360×800** sur `/dashboard`, `/pointage`, `/devis`, `/devis/nouveau`, `/stock`, `/flotte` et `/commandes` : largeur document strictement égale au viewport, aucun débordement horizontal de page.
- Captures vérifiées : tableau de bord lisible en une colonne, cartes financières sans chevauchement, pointage arrivée/départ entièrement utilisable.

## 16. Permissions Consulter / Gérer — 12 juillet 2026

- **Migration 40 appliquée** : 12 droits `gerer_*` ajoutés en complément des droits `acces_*`, dont clients, chantiers, devis, factures, achats, planning, employés, pointage, stock, flotte, outillage et paramètres.
- Les descriptions `acces_*` indiquent maintenant clairement « Consulter ». La page `/parametres/acces` affiche des badges bleus **Consulter** et or **Gérer**.
- Les postes existants ont reçu les nouveaux droits de gestion correspondant à leurs accès afin de ne provoquer aucune régression. L’admin peut décocher seulement « Gérer » pour rendre un poste lecteur.
- L’enregistrement normalise les droits côté SQL : sélectionner « Gérer » force automatiquement le droit « Consulter » du même module.
- En authentification réelle, l’interface affiche un bandeau « Mode consultation », masque les formulaires/actions de modification et conserve les filtres de lecture.
- Le proxy bloque également toute requête POST d’un utilisateur sans droit `gerer_*`, avec redirection 303 vers la page consultée. Le masquage visuel n’est donc pas la seule protection.
- Les anciennes permissions détaillées clients/chantiers/employés restent en base pour compatibilité mais sont masquées de l’écran simplifié ; les contrôles spéciaux (`gerer_utilisateurs`, `valider_pointages`) restent visibles.

## 17. Pointage GPS simplifié — 12 juillet 2026

- **Migration 41 appliquée** : les photos d’arrivée/départ deviennent facultatives en base et la RPC de clôture accepte un pointage GPS sans photo.
- Le nouveau parcours est uniquement : **Employé + Chantier + GPS + horodatage automatique**. La tâche reste facultative.
- Arrivée et départ conservent chacun leurs coordonnées et leur précision GPS ; la pause est déduite et les heures sont calculées automatiquement.
- La saisie manuelle et la prise de photo ont été retirées de l’interface. Les anciennes saisies restent consultables dans un panneau d’archives pour ne perdre aucun historique.
- L’historique principal affiche clairement le chantier, la date, les heures d’arrivée et de départ, la durée et deux liens cartographiques GPS.

## 18. Comptes collaborateurs et carte BTP — 13 juillet 2026

- Le parcours collaborateur existe : création d’un compte individuel, choix « Rejoindre une entreprise », saisie du code entreprise, demande en attente, puis validation par l’administrateur avec affectation d’un poste dans `/parametres/acces`.
- Les droits du poste séparent **Consulter** et **Gérer** par module. Attention : tant que le mode prototype sans connexion reste actif, tous les visiteurs partagent encore le contexte administrateur ; la séparation individuelle sera effective après la bascule d’authentification décrite dans `PRODUCTION_CHECKLIST.md`.
- **Migration 42 appliquée** : chaque employé peut avoir une carte professionnelle BTP en PDF, PNG, JPG ou WebP (10 Mo maximum), avec numéro et date d’expiration facultatifs.
- Les fichiers sont dans le bucket privé `documents-employes`. Leur affichage passe par `/api/employes/[id]/carte-btp`, qui vérifie l’entreprise et génère un lien signé court ; aucune URL publique permanente n’est exposée.
- La fiche `/employes/[id]` permet d’importer/remplacer, présenter, télécharger ou supprimer la carte. Le rendu a été contrôlé sur mobile 360×800 sans débordement horizontal.

## 19. Affichage compact des postes — 13 juillet 2026

- Dans `/parametres/acces`, chaque poste est désormais replié par défaut pour éviter une page très longue.
- La ligne résumée indique le nombre de membres, de droits **Consulter** et de droits **Gérer**.
- « Afficher les droits » ouvre le détail complet ; « Réduire les droits » le referme. Les cases restent intactes pendant l’ouverture/fermeture et l’enregistrement se fait dans le panneau ouvert.

## 20. Invitation guidée des collaborateurs — 13 juillet 2026

- Le bloc Code entreprise de `/parametres/acces` propose maintenant **Copier le code**, **Copier l’invitation** et **Partager** (partage natif mobile quand disponible).
- Le lien produit pointe vers `/signup?code=…`. Le code est affiché sur l’inscription, enregistré dans les métadonnées du compte puis prérempli sur l’onboarding, y compris après une confirmation d’email différée.
- L’onboarding présente d’abord « Rejoindre une entreprise existante », puis sépare clairement la création d’une nouvelle entreprise réservée au dirigeant.
- En mode prototype, un avertissement précise que le lien est prêt mais que les comptes individuels attendent l’activation de la connexion sécurisée.
- Vérifications : lint, TypeScript, build webpack et rendu HTTP local des deux écrans verts.

## 21. Scan caméra des mouvements de stock — 13 juillet 2026

- `StockMovementForm` ouvre désormais une fenêtre caméra plein écran mobile avec priorité à la caméra arrière et détection automatique des codes 1D/2D via `@zxing/browser`.
- À la détection : le scanner s’arrête, le téléphone vibre si possible, l’article correspondant est sélectionné et l’utilisateur complète quantité/type/chantier avant d’enregistrer.
- La lampe est proposée uniquement si le flux caméra la supporte. Les refus de permission, absence de caméra et navigateurs incompatibles affichent une explication claire.
- La douchette clavier, la recherche par code-barres et la référence article restent disponibles comme replis universels.
- Audit dépendances : deux alertes modérées proviennent du PostCSS embarqué par Next 16.2.10 ; `npm audit` ne propose qu’un changement Next cassant/incohérent, donc aucun `--force` appliqué. Lint, TypeScript et build webpack restent verts.

## 22. Cycle complet des comptes collaborateurs — 13 juillet 2026

- Ajout des callbacks SSR `/auth/callback` (échange PKCE) et `/auth/confirm` (vérification `token_hash`) avec destinations internes filtrées contre les redirections externes.
- L’inscription indique maintenant `emailRedirectTo` et conserve le code entreprise dans sa destination d’onboarding.
- Ajout de `/mot-de-passe-oublie`, du lien sur `/login`, de `/nouveau-mot-de-passe` et des actions Supabase d’envoi puis de mise à jour sécurisée du mot de passe.
- Après modification, la session de récupération est fermée et l’utilisateur doit se reconnecter avec son nouveau mot de passe.
- `PRODUCTION_CHECKLIST.md` contient les deux modèles email Supabase à configurer (`email` et `recovery`) et les URLs de callback à autoriser avant la bascule.

## 23. Renforcement RLS des droits Gérer — 13 juillet 2026

- Audit : le proxy Next bloquait les mutations sans droit `gerer_*`, mais plusieurs policies Supabase authentifiées autorisaient encore directement tout membre actif. La séparation n’était donc pas suffisante contre un appel REST/RPC volontaire hors interface.
- Migration **43 appliquée avec succès dans une transaction Supabase** : `20260713000043_permissions_rls_gestion.sql` crée `a_permission`, ajoute des policies `AS RESTRICTIVE` sur les écritures de 35 tables, protège les tables enfants et impose les droits par bucket Storage.
- Les RPC `SECURITY DEFINER` achats, stock, inventaires, pointage, flotte, outillage et justificatifs sont placées derrière des wrappers contrôlant le droit Gérer ; leurs implémentations internes ne sont plus exécutables par anon/authenticated.
- Le prototype anon reste volontairement inchangé. La syntaxe générale a été analysée par le parseur PostgreSQL natif (91 instructions valides après neutralisation de la clause récente `AS RESTRICTIVE`, confirmée séparément par la documentation PostgreSQL officielle).
- Contrôle après application : `a_permission(uuid,text)` existe et les wrappers RPC ont été créés. L’auth réelle reste volontairement désactivée jusqu’au réglage final des emails et URLs Supabase.

## 24. Invisibilité des modules non autorisés — 13 juillet 2026

- Le menu bureau/mobile masquait déjà les entrées sans `acces_*` et le proxy redirigeait les URLs métier directes.
- Le dashboard est maintenant filtré côté serveur : aucune requête ni carte financière, devis, chantier, planning, stock, flotte, outillage ou achats n’est générée sans le droit correspondant.
- En authentification réelle, une zone **Mes modules** n’affiche que les raccourcis autorisés. Un poste sans aucun accès voit uniquement un message d’attente d’attribution.
- Protections de chemin ajoutées pour les téléchargements de documents chantier, exports CSV, référentiel véhicule et impressions PDF devis/factures/commandes.
- Lint, TypeScript et build webpack verts. Le prototype conserve volontairement la vue complète (`permissions=null`).

## 25. Application installable sur mobile — 13 juillet 2026

- Ajout d’un manifeste PWA (`/manifest.webmanifest`) : nom LIRIA BTP, lancement direct sur `/dashboard`, couleurs de marque et affichage autonome sans barre de navigateur.
- Icônes 192, 512 et Apple Touch générées depuis le monogramme HD LIRIA fourni, sur fond bleu nuit.
- `PwaInstallButton` apparaît dans le menu quand Chrome/Android émet l’événement d’installation ; sur iPhone il affiche le parcours Safari « Partager → Sur l’écran d’accueil ».
- Service worker `/sw.js` volontairement réseau uniquement : il permet l’installation sans mettre en cache les données métier privées d’un collaborateur.
- Vérifications : lint, TypeScript, build webpack, manifeste JSON (`display=standalone`, 3 icônes), service worker, icône et balises Apple servis en HTTP 200.

## 26. Sous-droits sensibles invisibles — 13 juillet 2026

- Un utilisateur ayant seulement `acces_parametres` ne voit plus le lien **Accès et rôles** ; celui-ci exige désormais explicitement `gerer_utilisateurs` dans l’interface en plus du proxy/RPC.
- Dans les archives de pointage, les boutons Valider/Rejeter ne sont rendus que si le poste possède `valider_pointages`. Le droit général `gerer_pointage` ne suffit plus à afficher ce contrôle spécial.
- Suppression d’un ancien pointage reste liée à `gerer_pointage`; le serveur conserve les validations déjà protégées par leur permission dédiée.
- Lint, TypeScript et build webpack verts.

## 27. Numéros d’inscription et activation des employés — 13 juillet 2026

- **Migration 44 appliquée** : chaque fiche employé reçoit un numéro personnel aléatoire `BTP-…`, unique et non séquentiel. Les 8 fiches existantes ont toutes reçu un numéro distinct.
- La création/modification d’un employé impose maintenant de choisir un poste applicatif préparé dans Paramètres → Accès et rôles. Les droits Consulter/Gérer de ce poste sont donc définis avant l’invitation.
- La fiche employé affiche l’état `À inviter` / `Compte activé`, permet de copier le numéro, copier l’invitation ou la partager depuis le téléphone.
- Le lien personnel ouvre `/signup?numero=…`. Après confirmation du compte, l’employé active sa fiche avec son numéro ; l’activation vérifie que l’email correspond à la fiche et rattache automatiquement le compte, l’entreprise et le poste.
- Le numéro peut aussi être saisi manuellement depuis l’onboarding après installation de la PWA. Le bouton d’installation est désormais disponible dès la page d’inscription.
- Les changements futurs de poste ou les statuts `suspendu`/`sorti` sont synchronisés avec le compte applicatif.
- Migrations 43 et 44 exécutées dans des transactions Supabase puis contrôlées : fonctions présentes, 8 numéros attribués, 8 uniques. Lint, TypeScript, build webpack et écrans HTTP employés verts.

## 28. Pointage personnel et profils terrain — 13 juillet 2026

- **Migration 45 appliquée** : nouveau droit `saisir_son_pointage`, distinct de `gerer_pointage`. Un ouvrier peut enregistrer son arrivée/départ GPS sans pouvoir gérer les heures de l’équipe.
- La liaison `employes.utilisateur_id` est vérifiée dans l’interface, le proxy, les policies RLS et la RPC de clôture. En authentification réelle, l’ouvrier ne voit que ses propres sessions, heures et positions GPS ; le gestionnaire conserve la vue équipe.
- Les corrections et suppressions directes restent réservées à `gerer_pointage`; `valider_pointages` reste nécessaire pour valider/rejeter.
- **Migration 46 appliquée** : profils prudents par défaut. `ouvrier` reçoit Chantiers + Planning + Pointage personnel. `Chef d’équipe` reçoit aussi les consultations Stock/Flotte/Outillage et la gestion/validation du planning et des pointages. Aucun droit devis, facture, finances, clients ou paramètres n’est ajouté.
- Les 8 fiches historiques sont maintenant préparées : **3 chefs d’équipe** et **5 ouvriers**, toutes avec un numéro d’inscription et un poste d’accès.

## 30. Visibilité des accès dans la liste Employés — 13 juillet 2026

- La page Employés affiche désormais, pour chaque salarié, si son compte est activé ou si l’invitation reste à envoyer.
- La liste distingue la fonction métier de l’employé et son poste d’accès applicatif.
- Une nouvelle colonne Autorisations résume le nombre de droits Consulter, Gérer et spéciaux. Le détail dépliable affiche chaque autorisation avec un libellé lisible et un badge Voir/Gérer/Spécial.
- Les droits préparés sont visibles avant même l’activation du compte, ce qui permet à l’administrateur de contrôler la fiche avant d’envoyer l’invitation.
- Le tableau conserve un défilement horizontal interne sur mobile.

## 31. Pause et reprise — 13 juillet 2026

- Dernier commit publié : `1beee4b`. Production et migrations 43 à 46 validées.
- Lot local non publié en cours : `Mon espace` dans `src/app/(app)/mon-espace/page.tsx`, route privée `src/app/api/mon-espace/carte-btp/route.ts` et entrée Sidebar. Lint/TypeScript/HTTP local verts ; build, commit et déploiement restent à faire.
- Priorités de reprise : terminer Mon espace ; tester de vrais comptes Admin/Chef/Ouvrier ; préparer puis valider la sortie du prototype ; ajouter le droit photo chantier ; automatiser les emails PDF lorsque Resend/SMTP est fourni ; ajouter OCR quand un fournisseur est choisi ; fusionner le futur dépôt GitHub Stock ; approfondir clôture comptable et notifications.
- Voir la section « Relais de pause » de `RELAIS_CLAUDE.md` pour la liste complète et ordonnée des tâches et dépendances.
```
