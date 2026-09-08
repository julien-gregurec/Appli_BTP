# ELSATIA — Accès d'assistance interapplications et centre de communications (V1)

| | |
|---|---|
| Lot | `ELSATIA-PLATFORM-CROSS-APP-SUPPORT-ACCESS-AND-COMMUNICATIONS-V1` |
| Branche | `feat/platform-cross-app-support-access-communications-v1` |
| Base | `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` @ `1fc1331842cdf5980b374169994587813bdee7b6` |
| Worktree isolé | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/platform-support-comms-v1` |
| SHA du contenu du lot | `dfb00f62978665f0a5e652e36b3b1c2f31755b67` — poussé sur `origin` |
| Migration canonique créée | **aucune** — ledger inchangé à **272 fichiers**, numéro fonctionnel maximal **274** |
| Production / Stripe Live | **non touchés** |
| Fusion / déploiement | **aucun** |

---

## 1. Verdict

**Le socle d'accès global est déjà en place et correct ; l'assistance et les
communications ne l'étaient pas, et sont livrées ici sous forme d'un contrat
transverse testé, d'un SQL proposé complet et vérifié sur base réelle, et des écrans
plateforme.**

Trois conclusions, dans l'ordre d'importance :

1. **Le lot Global Owner est intégré au train, en entier et correctement.** La
   migration `20260906000266_platform_global_owner_all_apps_v1.sql` est présente au
   ledger, ainsi que les modifications applicatives associées. `julien@elsatia.fr`
   accède à toute application ACTIVE du catalogue sans entitlement manuel, et
   l'autorisation passe par `auth.uid()` — jamais par une comparaison d'e-mail.
   *Rien n'était à refaire de ce côté ; la demande §2 est déjà satisfaite.*

2. **Trois P0 de sécurité ont été trouvés dans le mécanisme de support existant** —
   absence de portée par application, absence de moindre privilège, absence totale de
   notification du client. Ils sont détaillés au §3 et corrigés par ce lot.

3. **Le centre de communications n'existait pas du tout.** `notifications_utilisateurs`
   est un centre de notifications *interne à Gestion Pro*, ciblé par permission de
   poste, sans programmation, sans acquittement, sans consentement, sans image et sans
   notion d'application. Tout le §9 au §16 est nouveau.

**Ce qui est utilisable immédiatement** : le contrat transverse
`@elsatia/platform-support-comms` (166 tests), les écrans plateforme, le bandeau dans
Gestion Pro, Colors et Réserves.
**Ce qui attend le Train V3** : les tables et fonctions, livrées en `.sql.proposed`
sans numéro de ledger réservé, conformément à la consigne.

---

## 2. Audit de l'existant

### 2.1 Dépôts et périmètre réel

Un seul dépôt applicatif est concerné : `julien-gregurec/Appli_BTP` (`elsatia-main`),
qui héberge Gestion Pro (racine) et les applications `apps/colors`, `apps/reserves`,
`apps/tools`, ainsi que les paquets partagés `packages/*`. Le site vitrine
(`elsatia-site`) et le noyau Drone (`packages/drone-core`, branche
`feat/drone-core-contracts-v1`) ne portent aucune de ces fonctions.

Trains et SHA vérifiés :

| Élément | Valeur |
|---|---|
| Train canonique | `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` @ `1fc1331` |
| Ledger | 272 fichiers, numéro fonctionnel maximal 274 |
| Global Owner (référence historique) | `feat/gp-global-owner-all-apps-access-v1` @ `90b636f2` |
| Migration Global Owner | `20260906000266_platform_global_owner_all_apps_v1.sql` |

**60 worktrees actifs ont été recensés et aucun n'a été modifié.** Ce lot travaille
dans un worktree neuf créé pour lui. Aucun stash, aucun WIP, aucune branche existante
n'a été touchée.

### 2.2 Intégration réelle du Global Owner

Comparaison fichier par fichier entre le commit historique `90b636f2` et le train :

| Fichier | État dans le train |
|---|---|
| `supabase/migrations/20260906000266_platform_global_owner_all_apps_v1.sql` | présent, identique |
| `apps/tools/src/lib/access.ts` | identique |
| `apps/tools/src/components/MonetizationPanel.tsx` | identique |
| `docs/audits/ELSATIA_GLOBAL_OWNER_ALL_APPS_ACCESS_V1.md` | identique |
| `src/app/(app)/plateforme/page.tsx` | présent, **enrichi depuis** (lots ultérieurs) |
| `supabase/tests/platform_global_owner_all_apps_v1.test.sql` | présent, **enrichi depuis** |

**Conclusion : la branche historique n'est plus la base canonique — le train l'est —
mais son contenu y est intégralement intégré.** Aucune reprise n'était nécessaire.

Ce que la migration 266 apporte réellement, et qui reste valable :

* colonne `plateforme_admins.proprietaire`, avec index unique (un seul propriétaire) et
  contrainte « propriétaire ⇒ rôle total » ;
* `est_plateforme_proprietaire()` et `plateforme_est_superuser()`, résolues par
  `auth.uid()` et revalidant l'état Auth (e-mail confirmé, compte ni banni ni supprimé)
  **à chaque appel** — un JWT encore valide ne survit donc pas à une suspension ;
* `plateforme_proprietaire_revendiquer()`, chemin d'activation unique, borné, exigeant
  AAL2 **et** un facteur MFA vérifié, et audité ;
* protection du propriétaire contre la révocation et la dégradation par un délégué ;
* `tools_resoudre_entitlements()` renvoie `pro` / `source: plateforme` à un superuser,
  **sans créer de ligne d'entitlement** — la facturation n'est donc pas faussée.

### 2.3 Ce qui existait déjà et n'a pas été réinventé

| Fonction | Rôle | Migration |
|---|---|---|
| `applications_elsatia` | catalogue des applications | 00234 |
| `a_acces_application()` / `applications_autorisees()` | accès générique, catalogue-driven | 00234 |
| `acces_applications_entreprises` | droit d'usage d'une organisation | 00234 |
| `habilitations_applications_utilisateurs` | rôle applicatif d'une personne | 00234 |
| `plateforme_admins` + cycle d'identité | admin plateforme par UID | 00235–00237 |
| `plateforme_exiger_session_aal2()` | AAL2 depuis le claim JWT | 00237 |
| `plateforme_acces_entreprises` + `est_acces_support_actif()` | session support | 00075 / 00236 / 00237 |
| `historique_mutations_plateforme` | audit des mutations plateforme | 00239 |
| `plateforme_journal_actions` | journal des actions plateforme | 00202 |
| `notifications_utilisateurs` | centre de notifications Gestion Pro | 00081 |
| `modeles_roles_predefinis` | 9 modèles de poste BTP | 00104 |

### 2.4 Écarts trouvés (les P0)

**P0-1 — Une session support n'a pas de portée par application.**
`colors_action_autorisee()` et `reserves_action_autorisee()` accordent tous deux la
lecture dès que `est_acces_support_actif(entreprise)` est vraie. Une session ouverte
pour dépanner Gestion Pro ouvre donc **aussi** Colors et Réserves, ce que le §8
interdit explicitement.

**P0-2 — Une session support donne tous les droits dans Gestion Pro.**
`src/lib/permissions.ts` renvoyait `null` — la convention interne pour « accès
complet » — dès que la session est active. Ni moindre privilège, ni lecture seule, ni
notion de périmètre : un accès ouvert pour lire une configuration pouvait modifier un
devis, une fiche salarié ou un export.

**P0-3 — L'entreprise n'est jamais prévenue.** Aucune notification, aucun historique
consultable, aucun centre de sécurité côté client. Le §7 n'était couvert d'aucune
façon.

**P1-1** — durée fixe de 4 h non choisie ; **P1-2** — pas de révocation par un tiers
(seule la révocation de l'administrateur lui-même ferme ses sessions) ; **P1-3** — pas
de fermeture sur inactivité ; **P1-4** — motif = texte libre de 5 caractères, sans
catégorie, donc impubliable au client ; **P1-5** — pas de référence de ticket ;
**P1-6** — `plateforme_entrer_entreprise` écrit `utilisateurs.entreprise_active_id`,
ce qui fait de l'opérateur un « membre actif » du tenant au sens de
`est_membre_actif()`.

**P2** — pas de détection d'anomalie, pas d'export d'audit, pas de politique de
rétention.

---

## 3. Architecture livrée

### 3.1 Le contrat transverse `@elsatia/platform-support-comms`

Un paquet **pur** (aucun accès réseau, aucun `server-only`, aucune dépendance
Supabase), importable tel quel par Gestion Pro, Colors, Réserves, Tools, la future
application Drone / Scan et toute application future.

| Module | Décide |
|---|---|
| `applications` | quelles applications sont assistables (portée « entreprise ») ou ciblables |
| `motifs` | catégories de motif, libellé **public** vs **interne**, validation |
| `perimetres` | matrice périmètre × famille d'action × domaine sensible, durées, interdits absolus |
| `session` | validité d'une session, bandeau, contrôles d'ouverture, non-réutilisabilité |
| `audit` | forme normalisée d'un événement, détection d'anomalies |
| `notifications-assistance` | textes de notification client, destinataires, historique |
| `texte` / `liens` / `image` | assainissement : HTML, caractères invisibles, URL, MIME réel |
| `consentement` | nature service / produit / commerciale, opt-in, types non refusables |
| `affichage` | modes, fréquence, états de lecture, règle « une publicité ne bloque jamais » |
| `communications` | modèle de message, validation complète, cycle de vie |
| `ciblage` | audience : applications, entreprises, segments, postes et rôles |
| `offline` | réconciliation du cache local, idempotence des accusés |

**L'autorité reste la base.** Chaque règle du paquet est le miroir testable d'un
contrôle serveur. Un appelant qui ne l'utilise pas ne gagne aucun droit ; un appelant
qui l'utilise ne contourne rien.

### 3.2 Session d'assistance — et non connexion au compte du client

Le point structurant : **`acteur_id` est l'identité Auth réelle de l'administrateur
plateforme, du début à la fin.** Aucune colonne, aucune fonction ne permet de
« devenir » un utilisateur client. `utilisateur_assiste_id` décrit la personne
accompagnée ; il n'est jamais l'auteur d'une écriture.

Séquence d'ouverture (§3 de la demande) :

1. recherche d'entreprise → 2. applications auxquelles elle est abonnée →
3. sélection explicite (une, plusieurs, ou toutes sous incident global) →
4. **motif obligatoire** (catégorie + détail si la catégorie l'exige) →
5. ticket facultatif → 6. périmètre → 7. durée bornée → 8. **AAL2 vérifié côté
serveur** → 9. ouverture, notification du client, journal → 10. sortie explicite.

Ordre des contrôles à chaque action, volontairement figé : état de la session
(révoquée → terminée → expirée → inactive), puis tenant, puis **application**, puis
interdits absolus, puis périmètre.

### 3.3 Justification, durée, périmètres

Sept catégories de motif, chacune avec **deux textes** : le libellé interne, et le
libellé public montré au client. Pour `securite` et `controle_signalement`, le libellé
public est délibérément neutre (« un contrôle de sécurité de la plateforme ») et le
détail libre est marqué *strictement interne* — **on ne prévient pas la personne
contrôlée qu'elle l'est, tout en respectant l'obligation de l'informer d'un accès.**

| Périmètre | Familles d'actions | Durée max | Confirmation renforcée |
|---|---|---|---|
| Lecture seule | lire | 240 min | non |
| Diagnostic | + diagnostiquer | 240 min | non |
| Configuration | + configurer | 120 min | non |
| Correction limitée | + corriger | 60 min | non |
| Assistance étendue | + exporter, supprimer | 60 min | **oui** |

Durées proposées : 15, 30, 60 min, plus une durée personnalisée bornée par le
périmètre. **La durée maximale décroît quand le périmètre s'élargit** — c'est testé.

`administrer_roles` et `modifier_abonnement` n'appartiennent à **aucun** périmètre :
ces actions relèvent de l'administration plateforme sur son propre écran, avec AAL2 et
journal dédié, jamais d'une session ouverte « dans » l'espace du client.

Fermeture automatique : expiration, déconnexion, changement de compte, révocation,
inactivité (15 min), retrait du rôle plateforme. **Une session close ne se rouvre
jamais et ne se prolonge jamais** — un trigger refuse toute augmentation d'`expire_at`.

### 3.4 Accès sensible

Treize domaines sensibles, chacun avec un périmètre minimal de lecture, un périmètre
minimal d'écriture (ou `NULL` = jamais), et une confirmation renforcée obligatoire.

Écriture **toujours refusée**, quel que soit le périmètre : `factures`, `paiements`,
`donnees_salaries`, `abonnement`, `remises`, `roles`, `securite`.

Sept actions **absolument interdites**, hors de toute matrice : afficher un secret,
récupérer un mot de passe, désactiver l'audit, supprimer son propre historique,
modifier une facture émise, contourner une RLS, accéder à une autre entreprise.

### 3.5 Notification de l'entreprise

À chaque ouverture, les **propriétaires et administrateurs** de l'entreprise reçoivent :

> L'assistance ELSATIA a accédé à votre espace *[applications]* le *[date et heure]*
> dans le cadre de : *[catégorie publique du motif]*.

À la fermeture :

> La session d'assistance ELSATIA ouverte le *[date]* s'est terminée le *[date]*.

La notification de fermeture va **exactement aux mêmes destinataires** que l'ouverture :
un changement de poste entre-temps ne doit ni ajouter ni retirer quelqu'un.

Le client consulte ensuite son historique : applications, début, fin, statut, catégorie
publique du motif, intervenant (« Assistance ELSATIA — *nom* », jamais l'e-mail interne
ni l'UID), nombre d'actions sensibles. **Il ne peut pas le modifier** — ni lui, ni la
plateforme : `assistance_evenements` refuse `UPDATE` et `DELETE` par trigger, pour tout
le monde.

Le modèle Gestion Pro n'a pas de rôle « propriétaire » : la qualité est déduite des
permissions réelles (`gerer_parametres` → propriétaire, `gerer_utilisateurs` →
administrateur), jamais d'un nom de poste, qui est libre.

### 3.6 Centre de communications

Onze types, trois natures (service / produit / commerciale), cinq modes d'affichage,
quatre fréquences, trois canaux, sept statuts avec transitions vérifiées.

Ciblage sur quatre axes combinables : **applications**, **entreprises** (unitaires ou
par segment pilote / essai / actif / expiré), **postes et rôles**, plus un ciblage libre
par permission ou rôle applicatif.

### 3.7 Ciblage par poste — écarts documentés

**Le modèle réel ne correspond pas à la liste demandée, et le forcer aurait produit un
ciblage faux.** Gestion Pro n'a pas de rôles fixes : une entreprise crée ses `postes`
(nom **libre**) et leur attribue des `permissions_poste`. Les neuf
`modeles_roles_predefinis` ne sont qu'un point de départ renommable et supprimable.
Colors et Réserves, eux, ont des rôles applicatifs fixes.

Le ciblage combine donc trois chemins (OU) : modèle de poste d'origine, permission,
rôle applicatif.

| Demandé | Correspondance réelle | Écart |
|---|---|---|
| Propriétaire | modèle `gerant` | — |
| Administrateur | `gerant`, `administration`, permission `gerer_utilisateurs` | — |
| Administratif | modèle `administration` | — |
| Conducteur de travaux | `conducteur_travaux`, `directeur_travaux` | — |
| Chef de chantier | modèle `chef_chantier` | — |
| Chef d'équipe | modèle `chef_equipe` | — |
| Salarié terrain | modèle `ouvrier` | — |
| RH | modèle `rh` | — |
| Comptabilité | modèle `comptable` | — |
| **Gestionnaire de stock** | permission `gerer_stock`, rôle `colors_gestionnaire_stock` | **aucun modèle de poste Gestion Pro** |
| **Responsable matériel** | permissions `gerer_outillage` / `gerer_flotte` | **aucun modèle de poste Gestion Pro** |
| Utilisateur personnalisé | ciblage libre par permission ou rôle applicatif | — |

Le modèle `directeur_travaux` existe mais n'était pas dans la liste demandée : il est
rattaché à « conducteur de travaux ». **Un message destiné aux responsables de chantier
ne s'affiche pas aux salariés terrain** — c'est le cas de test central du ciblage.

### 3.8 Images

Jamais obligatoires. Quand il y en a une : **type MIME déduit des octets** (le nom de
fichier et le `Content-Type` du navigateur sont des affirmations du client, pas des
preuves), taille ≤ 2 Mo, dimensions bornées (recommandé 1200 × 675), **texte alternatif
obligatoire**, recadrage borné à la source, stockage dans un bucket **privé**, aucune
URL distante.

**Le SVG est refusé sans exception.** Un SVG est un document capable de porter du script
et des références externes ; « assainir un SVG » est un problème ouvert, ne pas en
accepter n'en est pas un. Un SVG déguisé en PNG est détecté sur ses octets — c'est
testé.

### 3.9 Affichage à la connexion et consentement

Le mode **bloquant** est réservé à quatre types : sécurité, conditions, interruption
planifiée, action requise. **Une publicité bloquante est refusée par la base**, pas
seulement par l'interface — une contrainte `check` la rejette.

Fréquences : une seule fois (s'arrête au premier affichage — c'est la réponse à « ne pas
afficher la même publicité à chaque navigation »), rappel périodique (24 h), jusqu'à
acquittement, permanent. États suivis : non vu, vu, ignoré, acquitté, cliqué, avec date,
utilisateur et appareil. **Un acquittement ne se défait pas.**

Consentement : les types de service (sécurité, incident, maintenance, interruption,
conditions, action requise) ne sont **jamais** refusables. Le commercial est en
**opt-in explicite** (l'absence de choix n'est pas un consentement) ; l'information
produit se refuse séparément. `coherenceTypeEtNature()` empêche de faire passer une
publicité pour un message de service — c'est le piège nommé au §13 de la demande.

### 3.10 Hors-ligne

Un message reçu reste consultable ; un message expiré est **purgé** localement (et non
masqué, pour qu'une resynchronisation partielle ne le ressuscite pas) ; les messages
critiques sont resynchronisés en premier ; les accusés hors-ligne sont dédupliqués par
une clé `(communication, utilisateur, événement)` **qui ne contient ni horodatage ni
appareil** — deux acquittements du même message par la même personne sur deux appareils
sont le même fait, et c'est la date la plus ancienne qui fait foi.

**Une session d'assistance ne fonctionne jamais hors-ligne** : `evaluerSessionAssistance`
refuse dès `enLigne === false`, avant tout autre contrôle.

---

## 4. Sécurité des communications

| Risque (§15) | Traitement |
|---|---|
| XSS / HTML arbitraire | le contenu est du **texte**, jamais du HTML ; balises refusées à la saisie *et* par contrainte `check` ; rendu par JSX échappé, aucun `dangerouslySetInnerHTML` |
| Caractères invisibles | plages Unicode refusées (largeurs nulles, marques bidirectionnelles) |
| URL malveillante | https seul, domaines ELSATIA seuls, identifiants incorporés refusés |
| Redirection ouverte | `//hôte` refusé ; paramètre de redirection vers un domaine externe refusé |
| Ciblage hors tenant | la diffusion passe **exclusivement** par `communications_pour_utilisateur()` ; aucune politique RLS n'ouvre la table aux lecteurs |
| Publication sans autorisation | `communications_creer` et `communications_changer_statut` exigent rôle `total` + AAL2 |
| Modification silencieuse | contenu **et** ciblage figés après publication, par trigger ; correction = duplication tracée |
| Image dangereuse | MIME réel, SVG refusé, bucket privé |
| Fuite entre entreprises | `statistiquesLisiblesPar()` + agrégats réservés à la plateforme |

Journalisation : création, modification, publication, dépublication, pause, reprise,
annulation, archivage, ciblage, image, duplication — avec auteur, avant/après, résultat.
Le journal est **append-only**.

---

## 5. SQL proposé

`docs/migrations-proposees/platform-support-access-communications-v1.sql.proposed`
— 1 820 lignes, **aucun numéro de ledger réservé**, extension non exécutable.

Structures : `assistance_motifs`, `assistance_perimetres`,
`assistance_domaines_sensibles`, `assistance_actions_interdites`,
`assistance_roles_correspondance`, `assistance_sessions`,
`assistance_sessions_applications`, `assistance_evenements`,
`assistance_notifications`, `communications`, `communications_audiences`,
`communications_pieces_jointes`, `communications_lectures`,
`communications_preferences`, `communications_journal`, plus la colonne
`applications_elsatia.portee_donnees` et le bucket privé `communications-elsatia`.

Exigences demandées, et où elles sont tenues :

| Exigence | Traitement |
|---|---|
| RLS | activée sur les 15 tables ; 18 politiques explicites |
| Tenant | aucune lecture directe des communications ; sessions et audit filtrés par appartenance active |
| Immutabilité de l'audit | `assistance_evenements` et `communications_journal` refusent `UPDATE`/`DELETE` par trigger |
| Fonctions serveur | 32 définitions `security definer` + `set search_path = public`, `revoke` puis `grant` ciblé |
| Expiration | `expire_at` non prolongeable (trigger), balayage `assistance_fermer_sessions_echues()` |
| Révocation | `assistance_revoquer()` réservée au rôle `total` sous AAL2, motif obligatoire |
| Idempotence | balayage, notifications (unicité `session × destinataire × type`), accusés (`on conflict do update`) |
| Index | 18 index, dont trois partiels (sessions ouvertes, refus d'audit, actions sensibles) |
| Rétention | `assistance_purger_retention()` — 36 mois audit, 24 mois notifications, 18 mois lectures |
| pgTAP proposé | `…-v1.pgtap.sql.proposed`, **96 assertions** |

**Bascule.** `plateforme_acces_entreprises` n'est pas supprimée : `est_acces_support_actif(uuid)`
reste inchangée (≈ 40 appels), et une **surcharge** `est_acces_support_actif(uuid, text)`
est ajoutée. `colors_action_autorisee()` et `reserves_action_autorisee()` basculent sur
cette surcharge, conservant leur règle métier (lecture seule pour la plateforme) mais
exigeant désormais que **l'application ait été sélectionnée**. Le retrait de l'ancien
mécanisme fait l'objet d'un lot ultérieur.

---

## 6. Tests exécutés

### 6.1 Tests unitaires et de contrat

| Suite | Résultat |
|---|---|
| `packages/platform-support-comms` (12 fichiers) | **166 assertions — PASS** |
| `src/app/actions/plateforme-assistance.test.ts` | **10 assertions — PASS** |
| `src/lib/assistance-server.test.ts` (posture d'environnement) | **6 assertions — PASS** |
| `src/lib/permissions-assistance.test.ts` (intégration du P0) | **6 assertions — PASS** |
| Suite complète du dépôt (`vitest run`) | **1 428 tests PASS** ; 2 échecs par *dépassement du délai de 5 s*, non par assertion — voir §6.4 |

Couverture demandée au §17, et où elle est prouvée :

* **Global Owner** — accès GP / Tools / Colors / Réserves / application future ajoutée
  au catalogue, absence d'entitlement manuel, isolation préservée : pgTAP A1–A12.
* **Assistance** — motif obligatoire, AAL2, durée, expiration, révocation, application
  sélectionnée, mauvais tenant, autre application refusée, lecture seule, écriture
  autorisée, action interdite, bandeau, acteur réel, audit, notification client,
  clôture, historique immuable : pgTAP B1–E19 et `session.test.ts` / `perimetres.test.ts`.
* **Communications** — texte seul, image, lien, application ciblée, entreprise ciblée,
  rôle ciblé, message global, programmation, expiration, affichage unique,
  acquittement, publicité non bloquante, sécurité bloquante, consentement, hors-ligne,
  absence de duplication, XSS, fichier malveillant, accessibilité (texte alternatif
  obligatoire), responsive (aperçu trois formats) : pgTAP F1–F21 et
  `communications.test.ts` / `securite-contenu.test.ts` / `affichage.test.ts` /
  `offline.test.ts` / `ciblage.test.ts`.

### 6.2 Tests de base réelle

Le CLI Supabase est inutilisable sur cette machine ; la recette passe donc par un
conteneur Postgres jetable (`public.ecr.aws/supabase/postgres:17.6.1.143`) avec le
prélude `storage` — même méthode que les lots précédents. **La base locale de
développement n'a jamais été touchée.**

| Étape | Résultat |
|---|---|
| Train complet (272 migrations) | **272 appliquées, aucune erreur** |
| SQL proposé par-dessus | **appliqué sans erreur** |
| pgTAP du lot | **plan 96, 96 ok, 0 not ok, 0 erreur — PASS** |
| pgTAP existantes du dépôt (68 fichiers) | après correction : **67 fichiers PASS, 1 870 assertions** ; 1 fichier à 91/92, dont l'unique échec est **identique sur le témoin sans ce lot** — voir §6.4 |
| Conteneur témoin (train **sans** le SQL proposé) | monté pour trancher l'origine des échecs |

Harnais : `/Volumes/ELSATIA-DEV/ELSATIA-STACKS/support-comms-dbtest/` (hors dépôt).

### 6.3 Vérifications transverses

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` (racine, Colors, Réserves) | **0 erreur** |
| `eslint` (racine, Colors, Réserves) | **0 erreur**, 4 avertissements préexistants (aucun sur les fichiers du lot) |
| `next build` racine | **succès** — `/plateforme/assistance` et `/plateforme/communications` présentes dans le manifeste |
| `next build` Colors et Réserves | **succès** |
| Tests Colors / Réserves | **27 PASS** / **106 PASS** |
| `verify:migrations` | **272 migrations valides** — le ledger n'a pas bougé |
| `verify:secrets` | **1 559 fichiers contrôlés, aucun secret** |
| `git diff --check` | **propre** |

### 6.4 Échecs constatés, et leur cause

**Deux tests Vitest dépassent le délai de 5 s** :
`src/lib/stripe-discount-legacy-surface.test.ts` et `src/lib/xlsx.test.ts`. Tous deux
parcourent le système de fichiers. Relancés avec `--testTimeout=120000`, **ils
passent** : la cause est la lenteur du volume externe sur lequel ce worktree est
placé, pas le contenu du lot. Aucune assertion n'échoue.

**Une régression a été trouvée, puis corrigée, grâce au conteneur témoin.**

Premier passage : `reserves_v2_terrain_capture.test.sql` échouait sur **14 assertions**
(la 26, puis les 63 à 81). Un conteneur témoin — même train, **sans** le SQL proposé — a
été monté pour trancher : il n'en échouait qu'**une seule**, la 26.

Les treize autres étaient donc bien causées par ce lot. Cause exacte : le SQL proposé
redéfinit `reserves_action_autorisee()` pour lui ajouter la portée par application, et
le corps avait été repris de la migration **00268** alors que la définition en vigueur
est celle de la **00269**, qui avait ajouté l'action `gerer_membres`. La redéfinition
retirait donc silencieusement ce droit, et toute l'administration des membres Réserves
tombait. **Corrigé** : le corps repart de la 00269, et un avertissement est inscrit dans
le SQL proposé pour la reprise après le Train V3.

Après correction, sur un conteneur reconstruit de zéro : **67 fichiers PASS et
1 870 assertions**, et le dernier fichier passe de 78/92 à **91/92**. Les treize
assertions régressées sont revenues au vert ; aucune régression ne subsiste.

Reste l'assertion 26 (« aucune photo ne peut être effacée du stockage depuis
l'application »), qui échoue **à l'identique sur le témoin sans ce lot** : c'est un
artefact du harnais — le prélude reproduit la forme de `storage.objects` mais pas les
privilèges que `storage-api` pose sur une pile Supabase complète. **Préexistant, sans
rapport avec ce lot**, à confirmer sur une pile complète lors de la recette.

---

## 7. Ce que ce lot NE fait pas

* **Aucune migration canonique**, aucun numéro réservé.
* **Aucun worktree partagé modifié** ; 60 worktrees actifs préservés.
* **Aucune fusion, aucun déploiement**, Production et Stripe Live intacts.
* **Tools n'est pas assistable** : ses `tools_projects` appartiennent à une personne,
  pas à une entreprise. Le catalogue le déclare `portee_donnees = 'compte'` et le
  contrat l'exclut par construction — pas par une exception codée sur son nom. Tools
  reste **ciblable** par une communication.
* **Drone / Scan** est inscrite au catalogue en statut `bientot` : elle héritera de
  l'assistance et des communications sans une ligne de code supplémentaire.
* **Les canaux e-mail et push** sont modélisés (colonne `canaux`) mais leur envoi n'est
  pas branché : seul `in_app` est effectif en V1.
* **L'export d'audit** est possible en lecture (`assistance_evenements`) mais aucun
  bouton d'export CSV n'est livré.

---

## 8. Posture d'assistance : stricte par défaut

**Correction P0 appliquée après la première livraison.** La version initiale conservait
« tous les droits » quand `ELSATIA_ASSISTANCE_STRICTE` était absente. La règle est
désormais inversée : **tout ce qui n'est pas une demande explicite et valide de mode
hérité donne le mode strict.**

| `ELSATIA_ASSISTANCE_STRICTE` | Hors Production | En Production |
|---|---|---|
| absente | **strict** | **strict** |
| `1` / `true` | **strict** | **strict** |
| valeur inconnue, vide, mal orthographiée | **strict** + avertissement | **strict** + avertissement |
| `0` / `false` | hérité + **avertissement de sécurité** | **strict imposé** + avertissement de refus |

La Production est détectée par un **OU** sur `NODE_ENV`, `VERCEL_ENV` et `ELSATIA_ENV` :
se tromper en croyant y être ne coûte rien — la posture reste stricte, ce qui est le
comportement voulu partout ; se tromper dans l'autre sens ouvrirait tous les droits sur
un déploiement réel.

Ordre de décision de `permissionsUtilisateur()` sous session support :

1. le contrat existe en base → **ses droits font foi**, et l'environnement ne peut pas
   les rouvrir — même une réponse vide reste une réponse ;
2. contrat absent, posture stricte → **lecture seule** (`acces_*` et `voir_*` seulement) ;
3. contrat absent, mode hérité explicitement demandé **hors Production** → comportement
   historique, avec un avertissement journalisé à chaque résolution pour qu'un
   environnement laissé dans cet état finisse par se faire remarquer.

Le mode hérité ne subsiste que pour reproduire hors Production le comportement d'une base
où le contrat n'est pas encore appliqué. **Le P0-2 est refermé : il n'existe plus de
chemin, en Production, par lequel une session d'assistance obtienne tous les droits.**

### Refus par défaut

Côté contrat comme côté base, l'accès est **refusé** tant que ne sont pas simultanément
réunis : une session vivante (ni terminée, ni révoquée, ni expirée, ni inactive), une
**justification exploitable** (catégorie connue, détail présent quand elle l'exige), une
**fenêtre de durée valide**, l'entreprise exacte, l'**application explicitement
sélectionnée**, et une famille d'action dans le périmètre. La justification et la fenêtre
sont revérifiées **à chaque action**, pas seulement à l'ouverture — une session dont le
motif serait vidé après coup n'autorise plus rien.

**Aucune application future n'hérite d'un droit support global** : le contrat ne connaît
aucune liste d'applications, il compare à ce qui a été coché à l'ouverture. Une
application ajoutée au catalogue pendant qu'une session est ouverte reste fermée — c'est
prouvé par une assertion pgTAP qui l'ajoute en cours de test.

---

## 9. Priorisation

### P0 — avant toute commercialisation

| # | Sujet | État |
|---|---|---|
| P0-1 | Portée par application d'une session support | **corrigé** (SQL proposé + contrat) |
| P0-2 | Moindre privilège dans Gestion Pro | **corrigé et refermé** — posture stricte par défaut, verrouillée en Production (§8) |
| P0-3 | Notification et historique client | **corrigé** (SQL proposé) |
| P0-4 | Régression `reserves_action_autorisee` (perte de `gerer_membres`) | **trouvée et corrigée** — voir §6.4 |

### P1 — avant ouverture large

| # | Sujet | État |
|---|---|---|
| P1-1 | Durée choisie, révocation par un tiers, inactivité | **corrigé** |
| P1-2 | Motif catégorisé, public vs interne, ticket | **corrigé** |
| P1-3 | Retrait de `plateforme_acces_entreprises` et de l'écriture de `entreprise_active_id` | **à faire** (lot de bascule) |
| P1-4 | Envoi e-mail des notifications d'assistance | **à faire** |
| P1-5 | Centre de sécurité côté client (écran de l'historique) | **à faire** — la RPC existe, l'écran non |

### P2 — après mise en service

| # | Sujet |
|---|---|
| P2-1 | Export CSV de l'audit d'assistance |
| P2-2 | Alertes automatiques sur anomalies (la détection est écrite et testée, le déclencheur non) |
| P2-3 | Canal push pour les communications critiques |
| P2-4 | Statistiques détaillées par audience |

---

## 10. Dépendance au Train V3

Ce lot **ne peut pas être intégré avant le Train V3**, pour une raison unique et
mécanique : il a besoin d'un numéro de migration, et en réserver un maintenant
provoquerait une collision avec le Train V3 et le chantier Pricing/Abonnements qui
avancent en parallèle sur le même ledger.

Points de contact à surveiller au moment de l'intégration :

* **Pricing/Abonnements** — `communications_pour_utilisateur()` lit
  `entreprises.abonnement_statut` pour calculer le segment (pilote / essai / actif /
  expiré). Si le chantier Pricing déplace ce statut, cette lecture est à réaligner.
  C'est le seul couplage.
* **Train V3** — si `applications_elsatia` gagne des colonnes, l'`insert … on conflict`
  du §1 du SQL proposé est à revérifier.
* **Réserves / Colors** — `colors_action_autorisee()` et `reserves_action_autorisee()`
  sont redéfinies. Si un lot ultérieur les modifie, la redéfinition doit être rejouée
  sur la dernière version, pas sur celle capturée ici.

---

## 11. Ordre d'intégration recommandé

1. **Train V3** livré et stabilisé.
2. Rebaser cette branche sur le train résultant.
3. Attribuer le numéro de migration (`<horodatage>_platform_support_access_communications_v1.sql`)
   et déplacer le `.sql.proposed` tel quel dans `supabase/migrations/`.
4. Déplacer le `.pgtap.sql.proposed` dans `supabase/tests/`, sans modification.
5. Rejouer la recette conteneur : train + migration + les **96** assertions du lot +
   les **68** suites existantes.
6. Vérifier le point de contact Pricing (segment d'abonnement).
7. `npm run verify` complet.
8. Recette humaine (§12).
9. Déploiement Preview, puis Production.
10. Lot de bascule : retrait de `plateforme_acces_entreprises` et de l'écriture de
    `utilisateurs.entreprise_active_id`.

---

## 12. Recette humaine

**Assistance** — deux comptes plateforme (un `total`, un `support`), une entreprise de
test abonnée à Gestion Pro et Colors, un gérant et un ouvrier :

1. ouvrir une session sans motif → refus ; avec motif `securite` sans détail → refus ;
2. ouvrir en AAL1 → refus ; en AAL2 → succès ;
3. **vérifier que le gérant reçoit la notification et que l'ouvrier ne la reçoit pas** ;
4. **vérifier que la notification ne contient pas le détail interne du motif** ;
5. ouvrir Colors depuis une session Gestion Pro → refus, bandeau absent ;
6. en lecture seule, tenter une modification → refus ; en correction limitée → succès ;
7. tenter de modifier une facture émise → refus quel que soit le périmètre ;
8. laisser la session inactive 15 min → fermeture automatique, notification de fin ;
9. rouvrir, puis faire révoquer par le second administrateur → coupure immédiate ;
10. côté client, ouvrir l'historique : dates, statut, catégorie publique, intervenant ;
    **tenter de le modifier → impossible** ;
11. vérifier que chaque écriture porte l'e-mail de l'opérateur, **jamais le client**.

**Communications** :

12. message texte seul ciblé « chef de chantier » → visible du chef, **invisible du
    salarié terrain** ;
13. publicité en mode bloquant → refusée à la saisie ;
14. message de sécurité bloquant → accepté, affiché, bloquant jusqu'à acquittement ;
15. téléverser un SVG renommé `.png` → refusé ;
16. image sans texte alternatif → refusée ;
17. lien vers un domaine externe → refusé ; lien avec `?next=https://externe` → refusé ;
18. refuser les communications commerciales → la publicité disparaît, **le message de
    sécurité reste** ;
19. acquitter un message → il ne réapparaît pas ; le rejouer hors-ligne → aucun doublon ;
20. modifier un message publié → refusé ;
21. aperçu ordinateur / tablette / téléphone → lisible dans les trois.

**Non-régression** :

22. un dépannage support classique reste possible pendant la bascule ;
23. sans variable d'environnement, un dépannage support est **déjà** en lecture seule ;
24. poser `ELSATIA_ASSISTANCE_STRICTE=0` sur un environnement de Production → refusé,
    avertissement de sécurité dans les journaux, lecture seule maintenue ;
25. poser une valeur farfelue (`oui`, `strict`, `2`) → lecture seule, avertissement.

---

## 13. Plan de mise en production rapide mais sûr

| Étape | Contenu | Réversible |
|---|---|---|
| J0 | Rebase sur Train V3, numéro attribué, recette conteneur complète | oui |
| J0 | Rien à poser : la posture stricte est le défaut et est verrouillée en Production. Vérifier seulement qu'aucun environnement de Production ne porte `ELSATIA_ASSISTANCE_STRICTE=0` — ce serait refusé, mais l'avertissement doit être traité | sans objet |
| J1 | Migration en Preview, recette humaine §12 intégrale | oui (base Preview jetable) |
| J1 | Sauvegarde datée de la base Production, vérifiée restaurable | — |
| J2 | Migration en Production, hors heures de chantier | **la migration est additive** : aucune table existante n'est supprimée ni réécrite ; le repli est le retrait des nouvelles fonctions |
| J2 | Vérifier immédiatement : ouverture d'une session réelle, notification reçue, bandeau visible, sortie propre | oui (`assistance_revoquer`) |
| J2+7 | Première communication réelle, en bannière non bloquante, sur une seule entreprise pilote | oui (pause / annulation) |
| J2+14 | Élargissement du ciblage après lecture des statistiques | oui |
| J+30 | Lot de bascule : retrait de `plateforme_acces_entreprises` | non — à ne lancer qu'après 30 jours sans incident |

**Le point de non-retour est le lot de bascule (J+30), pas la migration.** Tout ce qui
précède est additif et se replie.

---

## 14. Traçabilité

### 14.1 Fichiers livrés

**Contrat transverse** — `packages/platform-support-comms/` : 15 modules (dont `index.ts`), 11 fichiers de
tests, `README.md`.

**SQL proposé** — `docs/migrations-proposees/` :
`platform-support-access-communications-v1.sql.proposed` (1 820 lignes) et
`platform-support-access-communications-v1.pgtap.sql.proposed` (96 assertions).

**Gestion Pro** — écrans `/plateforme/assistance` et `/plateforme/communications`,
actions serveur `plateforme-assistance.ts` / `plateforme-communications.ts`, composants
`AssistanceOuvertureForm`, `CommunicationRedaction`, `CompteARebours`,
`SupportAccessBanner` (enrichi), `src/lib/assistance-server.ts`,
`src/lib/permissions.ts` (moindre privilège).

**Colors et Réserves** — `src/lib/assistance.ts` et `BandeauAssistanceElsatia`, branchés
dans la coquille de chaque application.

**Hors dépôt** — harnais de recette
`/Volumes/ELSATIA-DEV/ELSATIA-STACKS/support-comms-dbtest/` (`harness.sh`,
`harness-train-only.sh`, `pgtap.sh`, `pgtap-train.sh`, `prelude.sql`).

### 14.2 Ce qu'il faut retenir avant de reprendre ce lot

1. **Ne pas réserver de numéro de migration** tant que le Train V3 n'est pas livré.
2. **Repartir de la dernière définition** de `colors_action_autorisee` et
   `reserves_action_autorisee` au moment de l'intégration — la leçon du §6.4.
3. **Le seul couplage avec le chantier Pricing** est la lecture de
   `entreprises.abonnement_statut` pour le segment d'audience.
4. La posture stricte est le **défaut** et ne se désactive pas en Production. Le mode
   hérité (`ELSATIA_ASSISTANCE_STRICTE=0`) n'existe que hors Production, pour reproduire
   une base sans le contrat, et journalise un avertissement de sécurité.

### 14.3 Commits

| SHA | Objet |
|---|---|
| `dfb00f62978665f0a5e652e36b3b1c2f31755b67` | contrat transverse, SQL proposé, écrans plateforme, bandeaux, rapport |
| le commit suivant | consigne ce SHA dans le rapport, comme le font les lots précédents |
