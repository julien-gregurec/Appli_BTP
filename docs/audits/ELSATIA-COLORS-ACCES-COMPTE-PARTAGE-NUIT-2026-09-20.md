# ELSATIA — accès du compte `julien@elsatia.fr` : Colors puis les autres applications

Nuit du 2026-09-20. Branche `fix/colors-shared-auth-access-night-v1` (base
`integration/colors-pilot-readiness-v1` @ `a3769840`, train V3). **Non fusionnée, non
déployée, aucune migration, aucune écriture Preview ni Production.**

## A. Tableau global

| Application | Existe | Déployée | Login julien@elsatia.fr | Droits | Navigation | État | Action restante |
|---|---|---|---|---|---|---|---|
| **Colors** | ✅ | **Prod : ancien build** (`/robots.txt`, `/mot-de-passe-oublie` en 404) | ❌ non testable sans le vrai mot de passe · ✅ prouvé sur un jumeau local | ❓ à lire (diagnostic SQL, runbook V2 §6) | ✅ local (7 pages + refresh + retour) | 🟡 | Déployer le train V3, exécuter le diagnostic, connexion réelle |
| Gestion Pro | ✅ | Prod (`app.elsatia.fr`) | ❌ non testé | ⚠️ propriétaire = admin plateforme **inactif** (aucune interface pour l'activer) | ⚪ non testé | 🟡 | Activer l'identité propriétaire (Q2) |
| Tools | ✅ | Prod (`tools.elsatia.fr`) | ❌ non testé | ⚠️ Free sans entreprise active, jamais Pro | — | 🟡 (Free) / 🔴 (Pro) | Q4 |
| Studio | ❌ pas dans cette branche | Non | — | — | — | ⚪ NON DÉPLOYÉ / NON TESTABLE | — |
| Réserves | ✅ | **Non** (`reserves.elsatia.fr` ne résout pas, `url_production` nulle) | — | ✅ modèle propre | — | 🟡 code / ⚪ déploiement | Choisir l'hôte |
| DOE | module de Gestion Pro, pas une app | via Gestion Pro | — | permissions de poste | — | ⚪ N/A | — |
| Site/Portail | ✅ vitrine (dépôt séparé), **aucun espace authentifié** | Prod | — | — | — | ⚪ N/A | — |
| Autres | Drone/Scan : code catalogue `drone` sans URL ; Analyse/Études : rien | Non | — | — | — | ⚪ NON DÉPLOYÉ / NON TESTABLE | — |

**Lecture en une minute.** Le code de Colors est bon — après correction de quatre défauts
réels trouvés cette nuit — et son accès par compte commun est démontré de bout en bout en
local (desktop 66/66, iPhone, Android et iPad 9/9). Ce qui empêche `julien@elsatia.fr` d'y entrer *ce
matin* n'est pas dans le code : Colors n'est pas déployé dans cet état, et je n'ai ni
le mot de passe, ni un accès de lecture à Preview/Production, ni une session Vercel
valide.

---

## B. Ce qui n'a pas pu être fait (blocages, et lesquels sont de mon fait)

| # | Blocage | Origine |
|---|---|---|
| 1 | Connexion avec le **vrai** mot de passe | Volontaire : jamais lu, jamais saisi |
| 2 | Lecture Production (y compris la copie de restauration `prod-restore-20260914`) | Refus du contrôle d'accès de la session, **respecté, non contourné** |
| 3 | Lecture de la base Preview par la CLI Supabase | Même refus |
| 4 | Vercel (variables, domaines, déploiements) | **Session CLI expirée** (HTTP 403) — `vercel login` requis |
| 5 | Réglages Supabase Auth (Site URL, Redirect URLs, gabarit) | Tableau de bord seulement |
| 6 | Gabarits e-mail sur ma pile locale | Le montage Docker d'un fichier du volume externe échoue (`mkdir /host_mnt/Volumes/ELSATIA-DEV: file exists`) → templates désactivés localement, reset e-mail non rejoué |

**Un incident de mon côté, à signaler :** vers 02:25 j'ai lancé `pkill -f next-server`,
un motif trop large qui vise *tous* les serveurs Next de la machine. Aucun autre serveur
Next n'était visible juste après, mais si l'une des autres sessions de la nuit a perdu un
serveur de recette à cette heure, c'est la cause. Je n'ai plus utilisé de `pkill` large
ensuite.

---

## C. Colors — rapport détaillé

* URL Preview : **aucune** (`applications_elsatia.url_preview` n'est jamais renseignée)
* URL Production : `https://colors.elsatia.fr` — **ancien build** (mesuré le 2026-09-20 :
  `/robots.txt` 404, `/mot-de-passe-oublie` 404, `/auth/confirm` 404, aucune CSP)
* Authentification utilisée : **Supabase Auth du projet ELSATIA, partagé** — aucun second
  système (`signInWithPassword`, `apps/colors/src/app/actions.ts`)
* Compte `julien@elsatia.fr` trouvé : **À CONFIRMER** (lecture distante refusée)
* E-mail vérifié : **À CONFIRMER**
* Profil trouvé : **À CONFIRMER**
* Workspace / organisation : **À CONFIRMER**
* Rôle : cible = `colors_admin_organisation` (organisation), voir §5 du runbook
* Permissions : `colors_admin_organisation` → toutes les fonctions Colors de l'organisation
* Accès Colors : **dépend de deux droits** (organisation autorisée ET habilitation) — ni
  l'un ni l'autre n'a pu être lu
* Connexion testée : ✅ sur le jumeau local ; ❌ avec le compte réel
* Session persistante : ✅ (rafraîchissement, navigation, retour d'une autre origine)
* RLS : ✅ cloisonnement multi-entreprise prouvé (E2E existants, cf. §D)
* Middleware : `apps/colors/src/proxy.ts` — CSP à nonce, rafraîchissement de session,
  aucune redirection ; la garde est dans le layout `(colors)` (`exigerShellColors`)
* Callbacks : `/auth/callback` (`next` filtré par `cheminInterneSur`), `/auth/confirm`
  (bouton explicite, jeton non consommé au GET)
* Variables d'environnement : **le runbook V1 est périmé** — la clé publique est
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sans repli ; le `prebuild` refuse le build
  sans elle
* Erreurs restantes : voir §D et §E

**COLORS : 🟡 PARTIEL** — code 🟢 (prouvé en local), Production 🔴 (ancien build),
compte réel ⚪ (non vérifiable cette nuit).

### Ce qui est prouvé (pile locale jetable, Colors construit depuis cet arbre)

Voir le tableau des quinze parcours dans
`docs/runbooks/ELSATIA_COLORS_ACCES_COMPTE_PARTAGE_RUNBOOK_V2.md` §2. Recette complète sur la
pile locale, Colors construit depuis cet arbre :

| Passe | Résultat |
|---|---|
| Desktop Chromium — 35 parcours existants + surface publique + **13 scénarios du compte partagé** | **66 verts, 1 ignoré** (le test des cibles tactiles, propre aux profils tactiles), 0 rouge |
| iPhone (WebKit), Android (Chromium), iPad (WebKit) — 3 scénarios `@responsive` chacun | **9/9 verts** |
| Unitaires Colors | 428/428 (avec un délai de 60-90 s : trois tests balaient l'arbre entier et dépassent 5 s sur ce volume) |
| Typecheck Colors, Réserves, Tools · lint Colors | propres |

Les 13 scénarios du compte partagé : parcours nominal (connexion, session, navigation,
autre origine, déconnexion, reconnexion), jumeau non admin plateforme, mauvais mot de passe,
**six refus « pour la bonne raison »** (un seul maillon manquant), e-mail non confirmé (avec et
sans bon mot de passe), **deux retraits de droit en cours de session**. Aucune boucle de redirection.

**Honnêteté sur la méthode.** Une première passe complète a donné 44 verts / 10 rouges, la
machine étant à un load de 20-25 (trois autres sessions de la nuit) ; un rejeu a ensuite donné
10 rouges en 400 ms — **mon serveur Colors avait disparu** (`ERR_CONNECTION_REFUSED`, cause
non identifiée). Ce n'est qu'en rejouant sur un poste calme, avec le serveur relancé par une
boucle, que les vrais défauts sont sortis un à un : ils étaient déterministes, pas dus à la charge.

## D. Colors — état fonctionnel

Classement demandé, d'après le code présent **et** la recette complète ci-dessus (rien n'est
présumé d'un audit antérieur) :

| Sujet | Statut | Constat |
|---|---|---|
| Données RAL (référentiel) | **PARTIEL** | Mécanisme prouvé : nuancier lu depuis un fichier (`COLORS_NUANCIER_FICHIER`, source + version + licence citées à l'écran). **Aucun nuancier réel n'est livré** : les références RAL et fabricants sont protégées ; sans fichier, aucune proposition n'apparaît. |
| Récupération des RAL depuis les objets métier | **NON IMPLÉMENTÉ** — par décision de licence | La proximité est calculée (Lab) depuis la teinte **déclarée** en HEX ; jamais mesurée sur une photo. Seule une référence `RAL nnnn` peut être retenue ; une référence fabricant reste proposée et exportée mais **non retenable** (`ral_approxime` impose `^RAL [0-9]{4}$`, décision produit A6 ouverte). |
| OCR / lecture d'étiquette | **PARTIEL — fermé volontairement** | Port + mocks + garde de build ; la route d'analyse refuse explicitement, aucun écran ne la propose, aucun prestataire n'est contractualisé (**À CONFIRMER** : contrat). |
| Finition | **OK** | Migration 281, déclaration + journal + export (E2E). Dépend du ledger : absente d'un Production < 281. |
| Photos | **OK** | EXIF/GPS supprimés avant stockage (vérifié sur le fichier servi), non-image refusée. |
| Cloisonnement multi-organisation, rôles, export CSV, activité | **OK** | E2E verts. |
| Liens avec les autres données ELSATIA | **PARTIEL** | Identité, droits, abonnement, assistance, sélecteur d'applications : oui. **Aucune donnée Gestion Pro** (chantiers, articles) : un emplacement de type « chantier » n'est qu'un libellé. |
| Hors ligne | **OK (par conception)** | Écran « Vous êtes hors ligne », aucune donnée de stock mise en cache. |
| Invitation d'un collaborateur | **NON IMPLÉMENTÉ** | Aucune table, route ni courriel : l'accès se donne un utilisateur à la fois depuis Gestion Pro (pilote de 5 à 10 personnes). |

**Anomalies évidentes réparées (aucune décision métier requise)** : voir §E.

## E. Défauts trouvés et corrigés cette nuit

| Commit | Application | Défaut | Correction |
|---|---|---|---|
| `caed09bb` | Colors | E-mail non confirmé présenté comme « Identifiants incorrects » | Message dédié ; **vérifié sans oracle** d'existence (mauvais mot de passe → `invalid_credentials`) |
| `b7c99139` | Colors | **Double envoi = deux seaux** (le test qui le garde était rouge) : `creerSeauAction` sans idempotence, bouton actif pendant l'action. Même sort pour une sortie de stock, un déplacement, un changement d'état | `BoutonEnvoi` (`useFormStatus`) sur tous les formulaires qui écrivent. **Pas une idempotence** : un rejeu réseau reste possible → Q7 |
| `b2c75912` | Colors | **Aucune déconnexion sur téléphone** : sous 900 px la barre latérale disparaît, et elle portait le seul bouton | Pied du tiroir de navigation : compte + déconnexion (cibles 44 px) |
| `b2c75912` | Colors | Service worker enregistré sur https ou sur le *nom* `localhost` seulement | `isSecureContext` |
| `96db69fc`, `91027209` | Réserves | **Ouverture de redirection** `next=/\hôte` ; pages de refus sans sortie ; `?error=<texte>` **rendu tel quel** (message trompeur crédible sur le domaine) ; erreur RPC présentée comme « pas d'accès » et déconnexion | Validateur commun (37 tests), bouton « Se déconnecter », **jeu fermé de codes** (4 tests), erreur technique distincte d'une absence de droit |
| `96db69fc`, `1adbe920` | Réserves, Tools | Clé publique lue sous l'ancien nom `NEXT_PUBLIC_SUPABASE_ANON_KEY` seul | Nom courant d'abord, ancien nom en **repli de transition** (aucun environnement configuré ne casse) |
| `380f68ff` | Colors | Aucun outil pour dire *quel maillon* de la chaîne d'accès manque | `scripts/diagnostics/acces-application-compte.sql`, lecture seule, testé sur 9 scénarios |
| `b7c99139`, `b2c75912` | Tests | Sélecteur `Enregistrer` ambigu (sous-chaîne de « Enregistrer la finition ») ; test « session terminée » qui effaçait tous les cookies ; test tactile lancé sur le profil bureau | `exact`, cookies invalidés au lieu d'effacés, `skip` hors tactile |

Contrôles : voir §C (recette complète). Réserves : 44 tests sur les modules touchés,
typecheck propre. **Non joués** : la recette Réserves (E2E) et les tests Tools, faute de pile
dédiée — les changements y sont petits et couverts par typecheck + unitaires.

## F. Autres applications

Rapport statique complet (fichier:ligne) :
`docs/audits/ELSATIA-ACCES-AUTRES-APPLICATIONS-AUDIT-STATIQUE-2026-09-20.md`. Résumé :

* **Gestion Pro** — auth saine, clé publishable, cookies explicites. Elle **n'utilise pas** le
  catalogue multi-application pour s'autoriser (poste + abonnement). Le proxy laisse passer
  si la RPC `contexte_acces_proxy` échoue (échec ouvert). Aucune garde de build ; `ELSATIA_APPLICATION_ENV`
  vaut `local` par défaut → le sélecteur pointerait vers `localhost` en Production si elle manque.
* **Tools** — pas de cookie, session dans le navigateur, **aucune session partagée**. Free sans
  entreprise active : le propriétaire n'aura jamais Pro sans appartenance à une entreprise.
  Toute erreur de connexion est affichée « Adresse ou mot de passe incorrect ». Une habilitation
  retirée laisse le Pro affiché jusqu'à 7 jours (cache).
* **Réserves** — modèle d'autorisation propre. Erreur RPC au login = déconnexion +
  « pas d'accès » (erreur confondue avec absence de droit). Pas de reset de mot de passe.
  Non déployée.
* **Studio** — existe dans un autre worktree (`studio-commercial-ready-v1`), **non intégré**, avec
  sa propre auth, sans `a_acces_application`, sans code au catalogue.
* **DOE** — module de Gestion Pro. **Site** — aucun espace authentifié.

## G. Incohérences entre applications, par gravité

1. **Critique** — le propriétaire n'est administrateur plateforme nulle part : l'unique chemin
   d'activation (`plateforme_proprietaire_revendiquer`, migration 266) n'est appelé par
   **aucune interface**. Il demande une session AAL2 et un facteur MFA.
2. **Critique (à confirmer côté Vercel)** — nom de la clé publique : `PUBLISHABLE` (Gestion Pro,
   Colors) contre `ANON` (Tools, Réserves). Atténué cette nuit par le repli de transition.
3. **Élevée** — trois modèles d'autorisation différents, donc trois issues pour un même habilité
   Colors seul : Gestion Pro (selon son poste), Tools (Free silencieux), Réserves (déconnecté).
4. **Élevée** — mot de passe oublié : le gabarit vise toujours Gestion Pro ; le relais ne couvre que Colors.
5. **Moyenne** — catalogue : `url_preview` jamais renseignée ; `drone` actif sans URL ;
   Tools et Réserves partagent le port local 3020 ; libellés de rôles du sélecteur limités à
   Gestion Pro et Colors.
6. **Moyenne** — cookies de Colors et Réserves sans `secure` (Gestion Pro le pose en production).

## H. Cartographie de l'identité, et cible

```
Compte ELSATIA (auth.users, Supabase Auth du projet ELSATIA)
  → public.utilisateurs (entreprise_active_id)
    → utilisateurs_entreprises (statut actif) → entreprises (abonnement)
      → acces_applications_entreprises  [organisation → application]
      → habilitations_applications_utilisateurs [personne → application → rôle]
        → a_acces_application()  ← une seule décision, lue par Colors et Réserves
```

Aujourd'hui : Colors et Réserves suivent la cible. **Gestion Pro et Tools ne s'y appuient pas
pour autoriser.** Recommandation (sans refonte) : faire de `a_acces_application` la porte
d'entrée de toutes les applications, et harmoniser la présentation des refus. Les sessions
restent une par application (cookies d'hôte) : c'est une décision de sécurité, voir Q3.

---

## QUESTIONS / DÉCISIONS À VOIR AVEC JULIEN

**Q1 — Comment déployer Colors, et sur quel niveau de ledger ?**
*Problème* : `colors.elsatia.fr` sert un build antérieur au train V3 ; le train exige les
migrations ≥ 234 (`contexte_application_courant`). Le ledger Production est peut-être encore à 210.
*Conséquence* : sans déploiement + ledger, aucune connexion Colors réelle n'est possible.
*Recommandation* : suivre le cutover (runbook), puis déployer Colors depuis ce train, variables §4 du runbook V2.
*Options* : (a) cutover complet ; (b) Colors seul sur Preview d'abord.

**Q2 — Activer `julien@elsatia.fr` comme propriétaire plateforme ?**
*Problème* : l'accès multi-application « automatique » passe par `est_plateforme_admin()`, inactif
pour cette adresse ; aucune interface n'appelle `plateforme_proprietaire_revendiquer`.
*Conséquence* : sans cela, `julien@elsatia.fr` est un utilisateur ordinaire partout ; il faut
l'habilitation organisation par organisation.
*Recommandation* : garder la voie organisation (`colors_admin_organisation`) pour Colors ; pour le
rôle propriétaire, ajouter une petite page Gestion Pro qui appelle la RPC après le défi MFA.
*Options* : (a) voie organisation seule ; (b) page propriétaire ; (c) appel RPC manuel avec session AAL2.

**Q3 — Une session unique entre applications (SSO) ?**
*Problème* : chaque application a ses cookies d'hôte : une connexion par application, mêmes identifiants.
*Conséquence* : « 1 compte → plusieurs apps » est vrai pour l'identité, pas pour la session.
*Recommandation* : ne pas partager de cookie sur `.elsatia.fr` (toute sous-application lirait la
session) ; si le besoin est réel, un jeton de relais à usage unique, comme le relais de reset.
*Options* : (a) statu quo ; (b) cookie de domaine ; (c) jeton de relais.

**Q4 — Renommer la variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` sur Tools et Réserves ?**
*Problème* : la clé legacy est désactivée ; le nom `ANON` n'a de sens que si la valeur est une clé publishable.
*Conséquence* : une clé rejetée est affichée « mot de passe incorrect » (Tools, Réserves).
*Recommandation* : poser `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sur les deux projets Vercel, redéployer, puis retirer le repli.
*Options* : (a) maintenant ; (b) au prochain déploiement de chaque application.

**Q5 — Studio : quel code au catalogue et quelle porte d'accès ?**
*Problème* : Studio (autre worktree) a sa propre authentification et n'appelle pas `a_acces_application` ; aucun code `studio` au catalogue.
*Conséquence* : impossible d'unifier « compte → licence → application » pour Studio avant intégration.
*Recommandation* : ajouter le code au catalogue et brancher `a_acces_application('studio')` avant son déploiement.
*Options* : (a) avant déploiement ; (b) après.

**Q6 — Autoriser la lecture de Preview pour les diagnostics ?**
*Problème* : ma session a été refusée sur toute lecture distante.
*Conséquence* : je ne peux pas dire si `julien@elsatia.fr` existe, est confirmé, ni ses droits.
*Recommandation* : exécuter vous-même `scripts/diagnostics/acces-application-compte.sql` sur Preview, ou m'autoriser explicitement la lecture Preview (jamais Production).

**Q7 — Idempotence côté serveur des écritures Colors ?**
*Problème* : `BoutonEnvoi` réduit le double appui, pas un rejeu réseau (perte de connexion, retour arrière, deux onglets). `creerSeauAction` insère sans clé unique.
*Conséquence* : un doublon de seau ou une sortie de stock retranchée deux fois reste possible, plus rarement.
*Recommandation* : colonne `jeton_envoi` unique par organisation, posée par le formulaire, migration à numéroter dans le prochain train.
*Options* : (a) migration maintenant ; (b) accepter le risque résiduel pour le pilote.
