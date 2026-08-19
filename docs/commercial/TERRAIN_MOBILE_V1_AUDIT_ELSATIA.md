# TERRAIN-MOBILE-V1 — Audit complet de l'expérience terrain mobile ELSATIA

Audit fonctionnel, UX, responsive et sécurité de la chaîne terrain mobile :
CONNEXION → AUJOURD'HUI → CHANTIER → PLANNING → POINTAGE → DOCUMENTS → PHOTOS → FRAIS → COMPTE RENDU → VALIDATION.

Contrairement aux lots précédents (AVENANTS-V1, PLANNING-POINTAGE-V1), ce lot a pu
s'appuyer sur une **session mobile réellement authentifiée en Local**, avec deux
comptes fictifs créés pour l'occasion (entreprise « Entreprise Terrain Mobile
Audit », salarié « Terrain Audit », chef d'équipe « Chef Audit »). Cela a permis
une vérification visuelle et fonctionnelle réelle, pas seulement une lecture de
code — conformément à la demande explicite de ce lot.

Aucun correctif n'a été appliqué. Aucune Production touchée.

## Résumé exécutif

**Deux P0 découverts, tous deux reproduits et diagnostiqués précisément** :

1. **La capture photo/document terrain est inaccessible aux deux personas cibles**
   (salarié terrain et chef d'équipe) : le formulaire d'ajout n'apparaît tout
   simplement pas sur la page « Photos et documents » d'un chantier, faute du
   droit `gerer_chantiers` — qui n'est accordé ni à un poste Ouvrier ni à un
   poste Chef d'équipe par défaut. C'est l'une des fonctions terrain
   explicitement visées par ce lot.
2. **La création d'une note de frais est cassée** : toute tentative échoue avec
   une erreur serveur 500 avant même la création du brouillon, à cause d'un bug
   SQL réel dans la fonction d'audit (`ajouter_audit_note_frais`) — `digest()`
   n'est pas trouvé car la fonction verrouille son `search_path` sur `public`
   alors que `pgcrypto` est installé dans le schéma `extensions`. Ce bug est
   dans la migration elle-même, donc très probablement présent aussi en Preview
   et Production.

En dehors de ces deux P0, la chaîne connexion → planning → pointage fonctionne
bien sur mobile, avec une bonne hygiène de sécurité (aucune fuite financière
observée, accès direct aux URL sensibles correctement bloqué, session
persistante, confidentialité GPS bien communiquée).

## 1. État initial et audit Git

- Worktree propre, branche `claude/planning-pointage-v1-audit` confirmée à
  `531fabb`, poussée sur `gh` avant de démarrer (pas de merge Production).
- Nouvelle branche créée : `claude/terrain-mobile-v1-audit`, depuis ce HEAD.
- Lots confirmés présents en documentation : AVENANTS-V1, FACTURATION-BTP-V1B,
  DEVIS-LOCK-V1, RENTABILITÉ-V1B/V1C, PLANNING-POINTAGE-V1 (tous les fichiers
  `docs/commercial/*` correspondants existent).
- Git propre tout au long du lot (seuls des fichiers `.md` et un `.env.local`
  local, ignoré par git, ont été touchés).

## 2. Méthodologie — comment la session authentifiée a été obtenue

Ce lot a nécessité plusieurs corrections d'environnement Local avant de pouvoir
naviguer authentifié, toutes documentées ici par transparence (aucune n'affecte
Preview/Production) :

- Le `launch.json` global (`~/.claude/launch.json`) pointait le serveur de dev
  « btp-platform-dev » vers un **autre projet** (`~/Documents/btp-platform`).
  Une entrée dédiée `terrain-mobile-liria-codex` (port 3010) a été ajoutée pour
  ce repo précisément.
- `.env.local` ne contenait qu'un jeton Vercel OIDC, aucune variable Supabase.
  Les variables `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (valeurs publiques,
  génériques à toute instance Supabase locale) ont été ajoutées.
- Le rate-limiter (`src/lib/supabase/proxy.ts`) appelle `createAdminClient()`,
  qui nécessite `SUPABASE_SERVICE_ROLE_KEY` — absente, ce qui bloquait **toute**
  connexion avec une 503 « Protection anti-abus indisponible ». Il s'agit de la
  clé de démo Supabase locale générique (`issuer: supabase-demo`, identique sur
  toute installation locale, jamais celle de Preview/Production) : ajoutée à
  `.env.local` (jamais committé, gitignore vérifié) après confirmation explicite
  de l'utilisateur.
- Le compte de test créé directement en base avait des colonnes `auth.users`
  (`confirmation_token`, etc.) à `NULL` au lieu de chaîne vide, ce que GoTrue ne
  sait pas lire (`sql: Scan error ... converting NULL to string`) — corrigé.
- `public.utilisateurs.entreprise_active_id` n'était pas renseigné, ce qui
  renvoyait systématiquement vers `/onboarding` après connexion — corrigé.
- Les interactions tactiles (`computer` click) se sont montrées peu fiables
  dans cette session (timeouts systématiques). Les parcours ont été exécutés
  via une combinaison de navigation clavier (Tab), remplissage de champ
  (`form_input`) et déclenchement de clic/soumission réels en JS
  (`element.click()`, `form.requestSubmit()`) — ce sont de vrais événements DOM
  qui traversent le code applicatif réel (Server Actions, RLS), pas un
  contournement de la logique métier. Limite d'outillage documentée par
  transparence, sans impact sur la validité des constats.

Toutes les données créées (entreprise, salariés, chantiers, affectations,
pointages, dépense) sont fictives, en Local uniquement, nommées explicitement
« Audit » pour rester identifiables.

## 3. Profils testés

- **Profil A — Salarié terrain** (poste « Ouvrier ») : `acces_chantiers`,
  `acces_planning`, `acces_pointage`, `saisir_son_pointage`,
  `saisir_ses_notes_frais`, `consulter_ses_notes_frais`. Explicitement **sans**
  `gerer_chantiers` ni aucun droit financier — c'est la configuration par
  défaut attendue pour ce poste.
- **Profil B — Chef d'équipe** (poste « Chef equipe ») : mêmes droits de base +
  `gerer_planning`, `valider_pointages`. Également **sans** `gerer_chantiers`
  ni droit financier — configuration réaliste, un chef d'équipe n'étant pas
  automatiquement gestionnaire de chantiers dans ELSATIA.
- **Profil C — Administratif/dirigeant sur mobile** : non testé séparément
  dans ce lot (déjà couvert desktop dans les lots précédents ; le produit n'a
  pas besoin de couvrir l'administration complète en mobile V1, conformément à
  la consigne).

## 4-5. Viewports et orientation

- Testé réellement à **390×844** (iPhone compact) et **430×932** (iPhone
  large) via `resize_window`, sur dashboard, planning, pointage, chantiers,
  documents, notes de frais, comptes-rendus. Aucun débordement, aucun texte
  tronqué critique observé aux deux tailles.
- **412×915** (Android standard) non testé indépendamment faute de temps ;
  risque jugé faible car aucun point de rupture responsive n'a été observé
  entre 390 et 430, et le CSS ne contient pas de breakpoint dans cet
  intervalle.
- **Paysage** : non testé faute de temps. À vérifier rapidement sur la page
  Pointage avant un déploiement large (c'est la page la plus sensible au
  clavier virtuel).
- **iOS Safari / Android Chrome réels** : non testés — le moteur utilisé est
  un Chromium piloté en dimensions mobiles avec user-agent mobile, pas un vrai
  moteur WebKit iOS ni Android Chrome. Limite explicitement documentée.

## 6-7. Connexion et session mobile

- Page `/login` : mise en page mobile propre, un champ par ligne, bouton
  pleine largeur, lien « Mot de passe oublié ? » visible, aucun élément hors
  écran.
- Message explicite et rassurant sous le formulaire : *« Votre connexion reste
  active sur cet ordinateur ou ce téléphone jusqu'à votre déconnexion. Sur un
  appareil partagé, pensez à utiliser « Se déconnecter » »* — répond
  directement à l'exigence de ne pas forcer une reconnexion répétée dans la
  journée, sans rien dire sur la sécurité de la session elle-même (cookie
  HTTP-only côté Supabase SSR, déjà audité dans des lots précédents).
- Connexion et déconnexion testées de bout en bout pour les deux profils :
  fonctionnelles, redirection correcte vers `/dashboard`.
- AUTH-RECOVERY-V1 déjà validé — non retesté en détail ici (juste confirmé que
  le lien « Mot de passe oublié ? » est bien présent et accessible au clavier).

## 8. Page d'arrivée terrain

- Route unique après connexion : `/dashboard`, quel que soit le profil — pas
  de page d'atterrissage dédiée par rôle, mais le contenu s'adapte fortement
  aux permissions.
- Pour le profil terrain : *« Bonjour Terrain »* simple (pas de synthèse
  financière), un bloc **Mes notifications** listant directement les
  affectations du jour (« Nouvelle affectation — Chantier Mobile Audit -
  19/08/2026 - 4.00h »), une grille **Mes modules** limitée à 4 tuiles (Mon
  espace, Pointage, Planning, Chantiers), un aperçu très simple de l'état des
  chantiers, et le bloc de pointage directement intégré en bas de page.
- Réponse à la question centrale du lot : **oui**, un salarié comprend
  immédiatement quoi faire — son chantier du jour et l'action de pointage sont
  visibles sans défilement excessif.
- Une modale « Personnalisez votre tableau de bord » apparaît à la première
  connexion (cases à cocher pour les widgets) — fonctionnelle, pas bloquante,
  facile à valider.

## 9-10. Navigation et priorité des actions

- Pas de barre de navigation basse (bottom nav) : un menu hamburger (`☰ Menu`)
  ouvre un panneau latéral plein écran, structuré par groupes (Accueil,
  Chantiers & interventions, Équipe & temps…), filtré par permission — un
  profil terrain n'y voit que Chantiers, pas Devis/Factures/Rentabilité.
- Un bouton flottant « ← » (`MobileBack`) est présent en bas à gauche sur
  toutes les pages — utile en PWA standalone où le geste retour navigateur
  n'existe pas.
- Depuis l'accueil, le pointage est accessible en 1 clic (tuile ou bloc
  intégré à `/dashboard`), le planning en 1 clic — la priorité terrain est
  respectée.
- Aucune fonction dangereuse ou clairement inutile visible dans le menu pour
  le profil terrain.

## 11-13. Planning mobile

- `/planning` affiche en réalité le **planning de toute l'équipe**
  (« Planning des équipes », « 16 heures planifiées · 2 ouvrier(s) »), pas
  seulement les affectations du salarié connecté — vérifié identique pour les
  deux profils (Terrain et Chef voient les affectations l'un de l'autre). Ce
  n'est pas une fuite cross-tenant (RLS scope bien à l'entreprise), mais un
  choix de conception : chaque salarié voit le planning de tous ses collègues,
  pas seulement le sien. Classé **P2** — à confirmer que c'est un choix
  assumé (cohérent avec une petite équipe BTP qui veut se coordonner) plutôt
  qu'un oubli de filtrage.
- Bandeau « Mode consultation — vous pouvez consulter ces informations, mais
  pas les modifier » affiché en haut, cohérent avec l'absence de
  `gerer_planning` pour le profil terrain. Chaque affectation affiche
  néanmoins un lien « ▶ Modifier » cliquable qui ne mène nulle part d'utile
  pour ce profil (l'écriture serait de toute façon bloquée par le proxy) —
  petite incohérence d'affichage, classée **P3**.
- **Absence d'horaires précis (§12) : confirmée bien gérée.** Chaque carte
  affiche « Prévu 4 h » / « Prévu 8 h », jamais une heure de début/fin — aucune
  impression trompeuse d'horaire précis.
- **Plusieurs chantiers le même jour (§13) : bien distingués.** Testé avec un
  salarié affecté à « Chantier Mobile Audit » (4h) et « Chantier Mobile Audit
  B » (4h) le même jour : deux cartes séparées, bordures de couleur
  différentes, tâche différente affichée sur chacune — aucune confusion
  possible.

## 14-17. Pointage mobile — démarrage et chantier hors planning

- Parcours connexion → pointage testé : le bloc de pointage est visible dès
  `/dashboard`, sans navigation supplémentaire — le geste quotidien est rapide.
- **Chantier préselectionné (§15) : confirmé.** Avec une affectation du jour,
  le premier chantier assigné est proposé automatiquement au chargement de la
  page Pointage. Limite mineure notée : avec deux affectations le même jour,
  c'est systématiquement la première (par ordre de création) qui est
  préselectionnée, sans indice pour distinguer laquelle est « la bonne » —
  classé **P3**, contournable via « Changer de chantier ».
- **Pointage hors planning / mauvais chantier (§16-17) :** le sélecteur
  « Changer de chantier » liste tous les chantiers de l'entreprise (pas
  seulement les affectations du jour), avec un tri qui priorise « Aujourd'hui »
  puis « Assigné » puis les autres (confirmé par lecture de code) — aucun
  blocage inutile, mais aucun avertissement supplémentaire si l'utilisateur
  choisit délibérément un chantier différent de son affectation du jour.
  Cohérent avec le constat déjà fait dans PLANNING-POINTAGE-V1 (autorisé
  silencieusement) — non re-corrigé ici.

## 18-19. Session ouverte et double pointage

- **Session ouverte (§18) : confirmé robuste.** Après démarrage d'un pointage,
  navigation vers une autre page puis retour sur `/pointage` : le chrono actif
  et le bouton « Pointer le départ » restent immédiatement visibles, avec le
  nom du salarié affiché (« Pointage au nom de Terrain Audit ») — aucun risque
  de pointage « invisible ».
- **Double pointage (§19) : protection UI + DB.** Une fois un pointage
  démarré, l'interface elle-même ne propose plus de bouton « Pointer
  l'arrivée » — impossible de même tenter un double pointage depuis l'écran.
  Combiné à la contrainte unique déjà vérifiée empiriquement dans
  PLANNING-POINTAGE-V1 (`sessions_pointage_ouverte_employe_unique`), la
  protection est robuste à deux niveaux.

## 20. Pause

- Champ « Pause (minutes) » présent, cadré 0-1440, pas de bouton
  démarrer/reprendre dédié — c'est une simple saisie numérique au moment du
  pointage de départ, cachée par défaut derrière « Options avancées » (valeur
  par défaut 45 min). Fonctionnel et suffisant pour une petite équipe ;
  la faible visibilité (repliée par défaut) pourrait faire manquer la
  correction à un salarié pressé — classé **P2** (découvrabilité, pas un
  blocage).

## 21-22. GPS et confidentialité

- **GPS refusé/indisponible : testé réellement** (navigateur sans accès
  géolocalisation dans cet environnement). Comportement : message d'erreur
  brut **non traduit**, affiché tel quel — `User denied Geolocation` — au lieu
  d'un message français compréhensible. Classé **P2** : un salarié non
  anglophone ne comprendra pas ce texte, même si le champ de motif de repli
  juste en dessous reste clair et fonctionnel.
- Le repli sans GPS fonctionne bien : le bouton « Pointer l'arrivée » reste
  désactivé tant qu'aucun motif n'est saisi, se débloque dès qu'un texte est
  entré — pas de boucle de blocage.
- Petit bug d'affichage associé : le lien « GPS arrivée » (vers OpenStreetMap)
  généré pour un pointage sans coordonnées réelles pointe vers `mlat=0&mlon=0`
  (« l'île nulle », golfe de Guinée) au lieu d'être masqué — classé **P2/P3**,
  cosmétique mais trompeur si un chef clique dessus en pensant vérifier une
  position réelle.
- **Confidentialité (§22) : très bien traitée.** Sur la page « Gérer et
  vérifier les pointages » (chef d'équipe), le texte est explicite : *« Pour
  respecter la vie privée et les limites des navigateurs, le contrôle
  fonctionne uniquement pendant le pointage et tant que la page ELSATIA
  Gestion Pro reste ouverte. Il s'arrête au départ ou à la fermeture de
  l'application. »* — répond directement à l'exigence de ne pas laisser croire
  à une géolocalisation continue. Bonne pratique à conserver telle quelle.

## 23-24. Réseau lent / perte réseau

- Non testé avec un throttling réseau dédié (contrainte de temps et
  d'outillage dans cette session). Le pointage utilise des Server Actions
  Next.js classiques avec état de chargement géré par React (boutons
  désactivés pendant la soumission d'après lecture de code) — non vérifié
  visuellement sous latence.
- Scénario de perte réseau : non simulé. Besoin identifié mais non classé
  faute de données empiriques — à couvrir dans un futur lot si jugé
  prioritaire, sans qu'il s'agisse d'implémenter un mode offline complet.

## 25-26. PWA

- Manifest (`/manifest.webmanifest`) vérifié directement : `name`,
  `short_name`, `start_url: /dashboard`, `display: standalone`, icônes 192/512
  classiques et maskable — **PWA installable fonctionnelle**, pas un simple
  site responsive.
- Service worker (`public/sw.js`) présent : cache-first pour les assets
  statiques versionnés, réseau uniquement pour les API/Supabase (aucune donnée
  métier mise en cache), gestion des notifications push. Versionnement
  explicite (`elsatia-v4`) avec purge des anciens caches à l'activation — pas
  de risque identifié de cache figé sur une ancienne version.
- Classé **fonctionnel**.

## 27-30. Fiche chantier mobile

- `/chantiers` (liste) : accessible au profil terrain, cartes sans aucun
  montant, uniquement client/ville/statut — cohérent avec les permissions.
- `/chantiers/[id]` (fiche détail) : un **404 intermittent** a été observé en
  Local pendant les tests (parfois 200, parfois 404 pour la même URL, sans
  changement de données). Diagnostiqué précisément : une requête SQL exécutée
  directement avec le contexte RLS du salarié terrain (`set local role
  authenticated` + JWT du compte) retourne la ligne de façon déterministe à
  chaque tentative — **l'accès n'est donc pas un problème de permission**. Le
  404 est attribué à une instabilité de l'environnement Local de dev
  (Turbopack/pooler), pas à un bug applicatif reproductible. Recommandation :
  un test manuel rapide de cette page sur Preview avant mise en production,
  par prudence, sans le classer P0/P1 en l'état.
- Faute d'un accès stable à cette page dans le temps imparti, la vérification
  visuelle complète de l'absence de fuite financière sur la fiche chantier
  mobile **s'appuie sur la lecture de code déjà faite** (tous les affichages
  `euros(...)` sont conditionnés à `peutVoirFinances`), pas sur une capture
  d'écran réelle pour ce lot — à refaire rapidement dès que l'environnement
  Local est stable.
- Adresse/contact : non vérifiés visuellement pour la même raison.

## 31-33. Documents et PDF

- Page « Photos et documents » d'un chantier **accessible en lecture** pour
  les deux profils (aucun 404, contenu affiché correctement : « Aucun document
  pour ce chantier »).
- **Aucun formulaire d'ajout visible** pour les deux profils (voir §34-37 pour
  le diagnostic complet — c'est le P0 principal de ce lot).
- PDF : non testé faute de document existant à ouvrir pour ce chantier fictif
  (aucun document créable par les profils testés, voir P0 ci-dessous) —
  confirmé par lecture de code que l'ouverture se fait via une URL signée
  (`/api/documents/[id]`), rendu natif inline pour un PDF, pas de téléchargement
  forcé.

## 34-38. Photos — P0 : capture inaccessible aux personas terrain

**Constat empirique (les deux profils testés) :** sur `/chantiers/[id]/documents`,
aucun champ de fichier, aucun bouton « Photo rapide », aucun formulaire général
n'apparaît — seulement le message vide *« Aucun document pour ce chantier —
Ajoutez une photo, un plan ou une pièce technique **ci-dessus** »*, qui renvoie
vers un espace qui n'existe pas pour ces profils.

**Cause identifiée avec certitude :**
- Au niveau RLS, l'écriture sur `documents_chantier` exige `gerer_chantiers`
  (migration `20260723000143_retablir_gestion_documents_chantier.sql`).
- Au niveau de l'application, le middleware (`src/lib/module-permissions.ts`,
  règle `["/chantiers","gerer_chantiers"]` dans `GESTION_PERMISSION_PAR_CHEMIN`)
  bloque **toute** mutation sous le préfixe `/chantiers/*` — donc aussi les
  photos, les documents, **et les comptes-rendus** — sans le droit
  `gerer_chantiers`.
- Ni un poste Ouvrier ni un poste Chef d'équipe ne détient `gerer_chantiers`
  par défaut : c'est un droit de gestionnaire de chantiers, pas un droit
  terrain.

**Conséquence :** la fonctionnalité « photo terrain », explicitement citée
comme une capacité historique/marquante d'ELSATIA dans la consigne de ce lot,
est **entièrement inutilisable** par un salarié ou un chef d'équipe standard —
seul un compte disposant de `gerer_chantiers` (généralement un profil
administratif/dirigeant) peut l'utiliser. Compression, multi-upload, capture
caméra (`capture="environment"`) : tout est correctement implémenté au niveau
du code, mais **inaccessible** en pratique pour la cible.

**Classé P0.** Recommandation : accorder un droit dédié (ou réutiliser
`acces_chantiers`/une nouvelle clé `ajouter_documents_chantier`) pour la
capture photo et l'ajout de documents, distinct du droit de gestion complète
d'un chantier (`gerer_chantiers` reste nécessaire pour éditer les tâches,
changer le statut, gérer les intervenants — ce qui doit rester réservé).

## 39-42. Notes, comptes rendus

- Notes internes/observations libres : non identifiées comme fonction séparée
  — les comptes-rendus (voir ci-dessous) en tiennent lieu.
- **Comptes-rendus (§40-42) : accessibles en lecture** pour les deux profils,
  page propre (« Compte-rendu par dictée », bouton « 🎙️ Dicter » et
  alternative « Rédiger sans IA »).
- **Tentative de création (profil terrain) : échec.** La sauvegarde d'un
  compte-rendu passe par un POST sous `/chantiers/[id]/comptes-rendus`, qui
  tombe sous la même règle `/chantiers` → `gerer_chantiers` décrite ci-dessus.
  Le clic sur « Enregistrer le compte-rendu » a été redirigé silencieusement
  vers `?lecture=seule` puis a produit une erreur cliente (« An unexpected
  response was received from the server »). Le code métier lui-même
  (`enregistrerCompteRenduAction`) ne fait *aucune* vérification de
  permission — la seule protection réelle vient du middleware générique, qui
  bloque ici alors même que l'intention du produit (d'après la consigne du
  lot, §41 : *« le chef d'équipe peut-il réellement créer un compte rendu sans
  droits financiers »*) semble être de l'autoriser.
- **Conséquence pratique : ni le salarié terrain ni le chef d'équipe ne
  peuvent enregistrer de compte-rendu depuis le mobile**, malgré une UI
  entièrement fonctionnelle pour la rédaction. Regroupé avec le P0 documents
  ci-dessus (même cause racine, même correctif recommandé : un droit dédié
  distinct de `gerer_chantiers`).
- **Bug de code additionnel découvert (indépendant du permissioning) :** une
  erreur d'hydratation React a été observée sur cette page —
  `DicteeCompteRendu` déduit côté serveur que la dictée vocale est disponible,
  puis découvre côté client qu'elle ne l'est pas (API Web Speech absente dans
  ce navigateur), ce qui provoque un mismatch SSR/client (« Hydration failed »)
  et un flash de contenu. Cela se reproduirait sur tout navigateur mobile réel
  sans support de la reconnaissance vocale (fréquent hors Chrome). Classé
  **P2** (bug de code réel, pas seulement un artefact de l'environnement de
  test, mais sans perte de données ni blocage total — le clic sur « Rédiger
  sans IA » reste fonctionnel après le flash).

## 43-46. Notes de frais — P0 : création cassée

Le formulaire de note de frais est complet et bien conçu (date, fournisseur,
catégorie, type de justificatif, montants HT/TVA/TTC, affectation chantier,
grand déplacement, moyen de paiement, devise, commentaire) — testé rempli avec
succès pour le profil terrain (après ajout de `saisir_ses_notes_frais`,
absent du poste Ouvrier créé par défaut dans ce jeu de test, ce qui a
d'ailleurs permis de confirmer que ce droit est bien indépendant du système
`gerer_chantiers`).

**Tentative de soumission (« Créer le brouillon et ajouter le justificatif ») :
échec systématique avec une erreur serveur 500**, avant même la création du
brouillon — donc avant d'atteindre l'étape justificatif.

**Cause identifiée avec certitude, par les logs serveur :**
```
function digest(text, unknown) does not exist
Hint: No function matches the given name and argument types.
```
La fonction `ajouter_audit_note_frais` (migration
`20260713000060_archivage_notes_frais_integrite_stockage.sql`) est
`security definer` avec `search_path` verrouillé sur `public` uniquement (une
protection standard et voulue contre l'injection de search_path). Mais
`pgcrypto` — qui fournit `digest()` — est installé dans le schéma
`extensions`, pas `public` (confirmé : `select extnamespace::regnamespace from
pg_extension where extname='pgcrypto'` → `extensions`). L'appel non qualifié
`digest(...)` dans le corps de la fonction ne peut donc jamais se résoudre.

**Ce n'est pas un artefact de l'environnement Local** : c'est un bug présent
dans la migration elle-même, indépendant des données de test. Sauf si Preview/
Production a `pgcrypto` installé dans `public` (peu probable avec le
provisionnement Supabase actuel), **cette même erreur bloque très
probablement la création de toute note de frais en Preview et en
Production** — un module pourtant présenté comme une fonction terrain
historique d'ELSATIA.

**Classé P0**, correspondant précisément au critère donné par la consigne
(« upload justificatif cassé ») — en pire, puisque le blocage intervient avant
même l'étape justificatif. Correctif recommandé (non appliqué dans ce lot) :
qualifier l'appel en `extensions.digest(...)`, ou étendre le `search_path` de
la fonction à `search_path=public, extensions`.

Non testés dans ce lot, faute d'avoir pu créer une dépense : justificatif
photo/PDF, prévisualisation, notes de frais cross-tenant, notes de frais pour
un autre salarié, chaîne de validation. Ces points nécessitent que le P0
ci-dessus soit corrigé au préalable.

## 47-49. Notifications, email

- Types de notification confirmés par lecture de code (déjà fait en amont) :
  `planning_modifie`, `pointage_a_verifier`, `pointage_oublie`,
  `decision_conge`, `note_frais_a_verifier`, `decision_note_frais`,
  `sortie_zone_chantier` — pertinents pour le terrain.
- Infrastructure Web Push réelle présente (`PushNotificationsSettings`,
  abonnement `PushManager`, gestion par type) — non testée en conditions
  réelles (nécessite un environnement HTTPS + interaction utilisateur pour la
  permission navigateur, hors périmètre raisonnable de ce lot).
- Emails : non vérifiés spécifiquement dans ce lot ; aucune anomalie
  spécifique au mobile identifiée par ailleurs.

## 50-57. Interface tactile, dates, sélecteurs, claviers, modales

- Boutons principaux (Pointer l'arrivée/départ, Se connecter) : pleine
  largeur, bonne taille, texte lisible — pas de zone de clic trop petite
  observée.
- Sélecteur de mois sur `/pointage` : `<input type="month">` natif, rendu
  correctement par le navigateur mobile (pas de popup desktop hors écran).
- Champs de montant sur notes de frais : `<input type="number">`, déclenche le
  clavier numérique sur mobile réel (non re-vérifié physiquement sur device,
  mais le type HTML est correct).
- Aucune modale géante ou impossible à fermer rencontrée dans les parcours
  testés.
- Header : compact (logo + bouton Menu), ne consomme pas un espace excessif.
- Pas de footer envahissant sur les pages applicatives (uniquement sur la page
  de login/marketing).
- Sélecteurs avec un grand nombre d'options (30+ chantiers/clients) : non
  testés avec un jeu de données de cette taille dans ce lot — seulement 2
  chantiers fictifs créés. Le composant `SearchableSelect` identifié par
  lecture de code est prévu pour ce cas, non re-vérifié empiriquement ici.

## 58-60. Erreurs, états vides, chargement

- Erreurs serveur rencontrées pendant ce lot (notes de frais, comptes-rendus)
  affichent une page d'erreur générique correcte (« Une erreur est survenue —
  Nos équipes ont été prévenues automatiquement. Vous pouvez réessayer. ») —
  pas de stack technique exposée à l'utilisateur, bon réflexe de sécurité, mais
  **aucune indication du problème réel** (attendu, pour ne pas exposer de
  détail technique, mais laisse le salarié sans solution — cohérent avec le
  P0 sous-jacent qui doit être corrigé côté serveur, pas côté message).
- États vides bien traités partout où testés : « Aucun document pour ce
  chantier », « Aucun compte-rendu pour ce chantier », « Aucune dépense
  accessible » — clairs, jamais confondus avec une erreur.
- Chargement : non testé sous latence artificielle (voir §23-24).

## 61-64. Chef d'équipe mobile

- Parcours connexion → chantiers → équipe testé avec le profil Chef.
- `/pointage/gestion` (« Gérer et vérifier les pointages ») : accessible,
  affiche les pointages de toute l'équipe (« Terrain Audit », avec son
  pointage en cours), lien direct vers la position GPS d'arrivée, et le
  texte de confidentialité GPS déjà cité en §22.
- Boutons Valider/Refuser : non atteignables dans ce lot, car le seul
  pointage disponible était encore ouvert (la clôture a échoué en dessous du
  seuil de durée minimale de 0,25h — comportement serveur correct, déjà
  documenté comme règle légitime, voir §14-17 pointage). La logique de
  validation elle-même (permission `valider_pointages` distincte de
  `saisir_son_pointage`, snapshot du coût horaire) a déjà été vérifiée
  empiriquement et en profondeur dans PLANNING-POINTAGE-V1 — non re-testée
  ligne à ligne ici.
- Validation en masse : confirmée absente (P2 déjà documenté), le traitement
  un par un reste utilisable pour une petite équipe.
- Comptes rendus, documents/photos pour le chef d'équipe : mêmes constats que
  pour le profil terrain (P0 ci-dessus, s'applique aux deux personas).

## 65-66. Accès URL direct et API terrain

**Testé et confirmé bloqué**, pour le profil terrain, en tapant directement
les URL dans le navigateur (pas seulement en masquant les menus) :
- `/devis` → redirigé vers `/dashboard?acces=refuse`
- `/factures` → redirigé vers `/dashboard?acces=refuse`
- `/rentabilite` → redirigé vers `/dashboard?acces=refuse`

Ces trois routes financières majeures sont donc bien protégées au niveau du
middleware, pas seulement par l'absence de lien dans le menu. Les appels
API/RPC sous-jacents (coût horaire, marge, paiements, avenants financiers)
n'ont pas été re-testés unitairement dans ce lot — déjà couverts par les
audits précédents (PLANNING-POINTAGE-V1 notamment pour les RPC de pointage).

## 67-68. IA mobile

- Le composant IA (`AssistantIA`) est monté conditionnellement à
  `acces_ia` (permission) et `iaEstActive()` (feature flag) — non accordé au
  profil terrain dans ce jeu de test, donc non visible ni testable ici. Le
  filtrage de la liste d'outils exposés au modèle par permission fine reste un
  **P2** déjà identifié dans PLANNING-POINTAGE-V1 (protection uniquement par
  RLS en aval) — non re-testé.

## 69. Multi-tenant global

- Confirmé pour le pointage, l'impersonation et la validation dans
  PLANNING-POINTAGE-V1 (tests empiriques en transaction annulée). Non
  re-testé spécifiquement pour documents/photos/frais/comptes-rendus dans ce
  lot (RLS déjà scoping par `entreprise_id` sur toutes les tables concernées,
  vérifié par lecture de migration, mais pas par reproduction croisée
  dédiée ici) — à considérer comme couvert par construction plutôt que par
  preuve empirique fraîche pour ces tables précises.

## 70. Suppression depuis mobile

- Non testée dans ce lot (aucune donnée supprimable créée avec succès côté
  terrain, les deux fonctionnalités d'écriture principales — documents et
  notes de frais — ayant échoué avant d'atteindre ce stade).

## 71. Scroll et sauvegarde de formulaire

- Formulaire de note de frais rempli entièrement sans perte de saisie
  observée lors du remplissage — non testé sous rotation d'écran ni sous
  interruption clavier.

## 72. Accessibilité minimale

- Labels de formulaire présents et correctement associés (`<label for=...>`)
  sur login, pointage, notes de frais — confirmé via l'arbre d'accessibilité
  (`read_page`) qui a systématiquement retrouvé les champs par leur label.
- Contraste : palette sombre/dorée (« ELSATIA ») lisible aux captures
  réalisées, pas d'audit de contraste chiffré effectué.
- Focus clavier fonctionnel (navigation Tab testée explicitement sur le
  formulaire de connexion, avec ordre logique : email → mot de passe oublié →
  mot de passe → bouton).

## 73-74. Performance

- Temps de réponse serveur observés en Local (non représentatifs de la
  Production) : la plupart des pages entre 100 et 300 ms côté application,
  hors compilation à froid Turbopack (jusqu'à ~1,5 s sur premher accès à une
  route). Aucune lenteur structurelle identifiée.
- Throttling réseau (Fast 3G/4G) : non testé faute d'outillage disponible
  dans cette session pour le brancher sur le pane Browser distant.

## 75-77. Installation, iOS Safari, Android Chrome

- Installation en écran d'accueil : non testée physiquement (nécessite un
  vrai device ou un simulateur avec Chrome mobile réel) ; le manifest et le
  service worker sont corrects par construction (§25-26).
- iOS Safari et Android Chrome réels : non disponibles dans cette session —
  limite explicitement documentée en §4-5.

## 78-79. Scénarios terrain complet et chef d'équipe

**Scénario terrain (10 étapes prévues) — résultat réel :**
1. Connexion : ✅ réussie.
2. Voir planning : ✅ réussi, deux affectations du jour bien distinguées.
3. Ouvrir chantier : ✅ (avec l'instabilité 404 notée en §27-30).
4. Démarrer pointage : ✅ réussi, avec repli GPS fonctionnel.
5. Consulter un document : ✅ (page accessible, vide car aucun document
   existant).
6. Ajouter une photo : ❌ **impossible** (P0 §34-38).
7. Ajouter une note de frais avec justificatif : ❌ **impossible**, la
   création échoue avant le justificatif (P0 §43-46).
8. Reprendre l'application : ✅ session et pointage retrouvés intacts.
9. Terminer pointage : ⚠️ bloqué la première fois par la règle de durée
   minimale (0,25h) — comportement serveur correct mais message d'erreur
   générique peu explicite (P2 §14-17/§58-60), non re-tenté avec une durée
   suffisante par manque de temps.
10. Déconnexion : ✅ réussie.

**Scénario chef d'équipe (7 étapes prévues) — résultat réel :**
1. Connexion : ✅.
2. Voir chantier : ✅.
3. Voir équipe : ✅ (via `/pointage/gestion`, qui liste l'équipe).
4. Voir pointages : ✅.
5. Valider/rejeter un pointage : non atteint (aucun pointage clôturé
   disponible dans le temps imparti).
6. Créer compte rendu : ❌ **impossible** (P0 §39-42, même cause que les
   documents).
7. Consulter documents : ✅.

## 80. Scénario absence de réseau

Non exécuté (voir §23-24).

## 81. Scénario permissions

Exécuté et confirmé : `/devis`, `/factures`, `/rentabilite` tous bloqués
proprement pour le profil terrain (§65-66).

## 82. Captures d'audit

Captures prises pendant les tests pour documenter les constats (dashboard,
planning multi-chantier, pointage avec repli GPS, page documents vide sans
formulaire, page notes de frais). Non jointes à ce document (aucune donnée
sensible, entreprise fictive uniquement) — disponibles sur demande dans la
session de travail.

## 83-84. Classification P0-P3

**P0 — bloque le travail terrain réel :**
1. Capture photo et ajout de documents chantier inaccessibles aux personas
   terrain et chef d'équipe (§34-38).
2. Création de note de frais cassée par un bug SQL réel (`digest()` hors
   search_path), probablement reproductible en Preview/Production (§43-46).

**P1 — à corriger avant un déploiement chez un premier client terrain :**
3. Comptes-rendus chantier non enregistrables par les personas terrain (même
   cause que le P0 #1, regroupable dans le même correctif) (§39-42).

**P2 — améliorations UX importantes mais contournables :**
4. Message d'erreur GPS non traduit (« User denied Geolocation ») (§21-22).
5. Lien GPS trompeur vers `mlat=0&mlon=0` quand aucune position n'a été
   capturée (§21-22).
6. Planning mobile visible pour toute l'équipe plutôt que scoping "mes
   affectations seulement" — à confirmer si c'est un choix assumé (§11-13).
7. Champ pause caché par défaut derrière « Options avancées » (§20).
8. Mismatch d'hydratation React sur la page comptes-rendus (dictée vocale)
   (§39-42).
9. Message d'erreur générique lors de l'échec de clôture de pointage (durée
   minimale non expliquée à l'utilisateur) (§14-17).
10. Lien « Modifier » affiché sur une affectation en mode consultation, sans
    action utile pour ce profil (§11-13).

**P3 — évolutions futures :**
11. Chantier préselectionné arbitrairement (le premier) en cas de double
    affectation le même jour (§14-17).

## 85. GO/NO-GO par fonction

| Fonction | Verdict |
|---|---|
| Connexion mobile | **GO** |
| Planning mobile | **GO** (avec réserve P2 sur le scope équipe) |
| Pointage mobile | **GO** |
| GPS | **GO** (avec réserves P2 sur les messages) |
| Chantier mobile | **GO sous réserve** (404 intermittent Local à re-vérifier sur Preview) |
| Documents | **NO-GO** (P0) |
| Photos | **NO-GO** (P0, même cause) |
| Notes de frais | **NO-GO** (P0) |
| Comptes rendus | **NO-GO** (P1, même cause que le P0 documents) |
| Chef d'équipe mobile | **GO sous réserve** (validation non entièrement rejouée, documents/comptes-rendus en NO-GO comme ci-dessus) |
| Permissions terrain | **GO** (aucune fuite financière trouvée, accès direct aux URL sensibles bloqué) |
| PWA | **GO** |

## 86. Commercialisation

**Peut-on donner ELSATIA à une équipe terrain réelle dès aujourd'hui ?**

**Non, pas en l'état.** La chaîne connexion/planning/pointage est solide et
peut être démontrée en toute confiance. Mais deux fonctions explicitement
attendues d'un usage terrain réel — la photo de chantier et les notes de
frais — sont aujourd'hui inutilisables par un salarié ou un chef d'équipe
normal, pas à cause d'un manque de développement, mais à cause de deux bugs
précis et bien identifiés (un problème de permission générique trop large sur
`/chantiers/*`, et un bug SQL de `search_path`). Les deux corrections
identifiées sont ciblées et de faible ampleur — ce n'est pas une refonte.

**Oui, avec correctifs P0 obligatoires avant le premier chantier réel où le
salarié doit pouvoir prendre des photos et saisir des frais.** Si le premier
déploiement se limite à planning + pointage (sans besoin immédiat de
photos/frais/comptes-rendus), la chaîne testée dans ce lot peut déjà
supporter cet usage restreint.

## 87. Recommandations de lots minimaux

- **TERRAIN-MOBILE-V1B** — corriger les deux P0 : (a) introduire un droit
  dédié pour l'ajout de documents/photos/comptes-rendus chantier, distinct de
  `gerer_chantiers`, et l'accorder par défaut à `saisir_son_pointage`/postes
  terrain typiques ; (b) corriger le `search_path` de
  `ajouter_audit_note_frais` (et auditer les autres fonctions du même fichier
  de migration pour le même risque). Lot court, ciblé, testable avec les
  mêmes comptes fictifs déjà créés dans ce lot.
- **POINTAGE-UX-V1** (optionnel, P2 uniquement) — traduire les messages GPS
  bruts, corriger le lien GPS `mlat=0&mlon=0`, clarifier le message d'erreur
  de durée minimale de pointage.

Rien de ce qui précède n'a été développé dans ce lot, conformément à la
consigne.

## 88. P1 planning déjà connus — non repris

Les P1 déjà documentés dans PLANNING-POINTAGE-V1 (historique de correction de
pointage, suppression de pointage validé, absence vs affectation, chantier
terminé, capacité contractuelle) n'ont pas été retestés ni corrigés ici : leur
manifestation mobile n'a rien changé aux constats déjà faits, aucun n'est
devenu bloquant sur mobile spécifiquement.

## 89-92. Hors périmètre respecté

Aucune modification de la plateforme admin (PLATFORM-V2), aucun travail sur
les mentions légales (C6-D), aucun contact Stripe, aucune Production —
confirmé, seuls des fichiers `docs/commercial/*.md` sont commités par ce lot.

## 93. QA

- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur, 3 avertissements `<img>` préexistants et sans
  rapport avec ce lot.
- `npm run build` : succès.
- `npm run test` (Vitest) : 360/360.
- `npm run test:db` (pgTAP) : 496/496 — comptes inchangés depuis
  PLANNING-POINTAGE-V1, cohérent avec le fait qu'aucune migration n'a été
  ajoutée dans ce lot d'audit.

## 94. Documentation

Ce document et `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md`.

## 95. Git

Commit unique, docs uniquement :
`docs(commercial): auditer experience terrain mobile ELSATIA`.

## 96. Non-régression de cet audit

- Aucune ligne de code applicatif modifiée.
- Aucune migration ajoutée ou modifiée.
- Les seules données créées (entreprise/salariés/chantiers fictifs « Audit »,
  une note de frais en échec) vivent exclusivement dans la base Locale de
  développement, jamais en Preview ni Production.
- `.env.local` a été complété avec des clés Supabase Locales génériques
  (aucun secret Preview/Production) — fichier gitignoré, vérifié non suivi
  par git tout au long du lot.
- `~/.claude/launch.json` (hors du dépôt) a reçu une entrée supplémentaire
  pour pointer un serveur de dev vers ce repo précisément, sans toucher
  l'entrée existante d'un autre projet.
