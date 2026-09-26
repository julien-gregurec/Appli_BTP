# ELSATIA — Annuaire des entreprises clientes et espace de facturation plateforme

**Lot** : ELSATIA-PLATFORM-CLIENT-DIRECTORY-BILLING-WORKSPACE-V1
**Date** : 8 septembre 2026
**Branche** : `feat/platform-client-directory-billing-workspace-v1`
**Base** : `1fc1331842cdf5980b374169994587813bdee7b6` (train canonique `integration/elsatia-ecosystem-train-v2-reserves-gp-v1`)
**SHA livré** : `2c6924a5a3f25d085e210efb14220227b637eee1`
**Worktree** : `/Users/juliengregurec/Projects/.worktrees/platform-client-directory`

Aucune migration canonique. Aucun numéro de ledger réservé. Aucun accès Stripe Live.
Aucun déploiement, aucune fusion, aucune écriture en production.

---

## 1. Verdict

L'annuaire demandé est **livré et fonctionnel**, mais il tourne aujourd'hui en **mode dégradé**,
et ce mode est affiché à l'opérateur au lieu d'être masqué.

La raison est structurelle et vaut d'être énoncée avant tout le reste :

> `public.entreprises` **n'a aucune politique RLS de SELECT pour un administrateur plateforme**.
> Les seules politiques existantes sont « membres voient leur entreprise » (migration
> `20260710000001`) et une politique réservée au rôle interne du moteur de remise
> (`20260827000243`). Un administrateur plateforme ne peut donc lire la liste des entreprises
> **que** par une fonction `SECURITY DEFINER` — et la seule qui existe,
> `plateforme_entreprises()`, renvoie **la table entière**, sans recherche, sans filtre, sans
> tri et sans pagination.

La conséquence est directe : **une recherche serveur réelle exige une migration**. La consigne
de ce lot l'interdisant, l'annuaire a été construit avec deux chemins choisis à l'exécution.
Le SQL du chemin nominal est livré prêt à jouer dans `docs/migrations-proposees/`.

| Exigence | État |
|---|---|
| Liste professionnelle remplaçant les grandes cartes | **Tenue** |
| Colonnes, sélecteur, densité, préférences sauvegardées | **Tenue** |
| Notion de « coût » désambiguïsée | **Tenue** |
| Onglets de suivi avec compteurs | **Tenue**, avec réserves documentées à l'écran |
| Filtres combinables, vue enregistrée, lien partageable | **Tenue** (4 filtres sans donnée source, listés) |
| Tri serveur | **Tenue par le SQL proposé** — aujourd'hui tri dans le processus serveur |
| Recherche serveur multi-champs | **Partielle** — 3 champs sur 10 tant que l'index n'est pas déployé |
| Pagination serveur, requêtes bornées | **Partielle** — le navigateur reçoit au plus 100 lignes, la base est lue sans borne |
| Fiche entreprise à onglets | **Tenue** |
| Remises depuis la fiche, MFA/AAL2, journalisation | **Tenue**, via le moteur canonique existant |
| Export CSV tracé | **Livré mais bloqué** — voir §12, `plateforme_journaliser` n'est exécutable par personne |
| Permissions hors React | **Tenue** |
| 5 000 entreprises | **Tenue par le chemin indexé**, **refusée explicitement** en mode dégradé |

---

## 2. Audit de l'interface actuelle (« avant »)

L'écran remplacé est `src/app/(app)/plateforme/page.tsx`, lignes 275 à 423 de la version de
base. Chaque entreprise y occupait un `<article>` contenant, empilés verticalement :

- un bandeau nom + pastille de statut + badge IA ;
- une ligne de code d'adhésion, référence, membres, date de création ;
- un encart de prix mensuel calculé ;
- **cinq compteurs colorés** (employés, comptes, invitations, connexions 30 j, installations) ;
- un encart d'alerte appareils ;
- un bloc remise (actif ou formulaire dépliable de 6 champs) ;
- un `<details>` « Tarifs par poste » contenant un formulaire par poste ;
- un bloc impayé ou règlement ;
- un formulaire « Accéder comme administrateur » ;
- un formulaire « Réinitialiser un mot de passe » ;
- un formulaire statut / échéance / note.

Mesures faites sur ce code :

| Constat | Mesure |
|---|---|
| Hauteur d'une seule entreprise | ~11 blocs empilés, ~700 px |
| Entreprises visibles sans défiler | moins d'une |
| Recherche | **inexistante** |
| Filtres | **inexistants** |
| Tri | **inexistant** (ordre figé `created_at desc`) |
| Pagination | **inexistante** |
| Lignes chargées | **toutes**, en 6 lectures de tables complètes en mode démonstration |
| Formulaires rendus par entreprise | 6 à 8, soit **~3 500 champs pour 500 clients** |

À 500 clients cette page devenait inutilisable ; à 5 000 elle ne se rendait plus. Le diagnostic
du cahier des charges est confirmé sans réserve.

**Capture « avant » : non réalisable.** L'espace `/plateforme` est protégé par
`exigerAal2Plateforme` (`src/app/(app)/plateforme/layout.tsx`), qui exige une session
authentifiée réelle en AAL2 ; la base locale a par ailleurs fermé l'accès anonyme
(`dev_contexte_entreprise` supprimée par la migration `20260714000078`). Aucune capture de
l'ancien écran n'a donc pu être produite sans saisir des identifiants, ce que je ne fais pas.
Le descriptif ci-dessus est établi par lecture du code, référence de lignes à l'appui.

---

## 3. Captures « après »

Produites contre le **composant de présentation réel** (`AnnuaireEntreprises`), monté par un
harnais temporaire non versionné avec un parc synthétique de 512 entreprises, hors de toute
session. **Aucune garde d'accès n'a été contournée pour les obtenir** : le harnais ne lit ni
base, ni cookie, ni identité, et il a été supprimé avant le commit.

Ce qui a été observé, mesuré dans le DOM :

- **Ordinateur, 8 colonnes par défaut, densité compacte** : 25 lignes tiennent à l'écran,
  en-tête collant, tri par en-tête, menu « Ouvrir » par ligne.
- **Ordinateur, 12 colonnes, densité confortable** : défilement horizontal contenu dans le
  tableau, jamais sur la page.
- **Téléphone (375 px)** : recherche en premier, onglets défilables, 23 lignes compactes
  vérifiées dans le DOM, chacune portant nom, raison sociale, statut, situation de paiement,
  forfait, prix souscrit, échéance, comptes actifs et un bouton « Ouvrir la fiche ».
  **Aucun tableau écrasé.**
- **Accessibilité vérifiée dans le DOM** : `aria-sort` (`descending` sur la colonne triée,
  `none` ailleurs), `aria-current="page"` sur l'onglet courant, `aria-disabled="true"` sur
  l'onglet sans donnée source, `<label>` associé au champ de recherche, `<caption>` du tableau
  annonçant « 512 résultat(s), page 1 sur 21 ».

Un point du cahier des charges a été **corrigé après capture** : le résumé chiffré passait
avant la recherche, ce qui repoussait la barre de recherche à un écran et demi sur téléphone,
contre l'exigence §16 « recherche en premier ». L'ordre est désormais titre → recherche →
onglets → résumé, à toutes les tailles.

Pour régénérer les captures : monter un harnais équivalent rendant `AnnuaireEntreprises` avec
des lignes synthétiques, ou ouvrir `/plateforme/entreprises` avec une session plateforme AAL2
réelle (voir §19, recette humaine).

---

## 4. Architecture

Cinq modules, séparés pour que le cœur soit testable sans base et que la présentation soit
vérifiable sans session.

```
src/lib/plateforme-annuaire.ts               domaine pur : colonnes, onglets, filtres, tri,
                                             analyse ↔ sérialisation d'URL, composition du coût
src/lib/plateforme-annuaire-habilitations.ts rôle plateforme → commandes affichables
src/lib/plateforme-annuaire-serveur.ts       accès aux données, choix du chemin, export
src/lib/plateforme-annuaire-csv.ts           sérialisation CSV
src/lib/plateforme-fiche-entreprise.ts       chargement par section de la fiche

src/components/plateforme/AnnuaireEntreprises.tsx   présentation, ne lit rien
src/components/plateforme/RechercheAnnuaire.tsx     recherche anti-frappe (client)

src/app/(app)/plateforme/entreprises/page.tsx                 habilitation + chargement
src/app/(app)/plateforme/entreprises/[entrepriseId]/page.tsx  fiche à onglets
src/app/(app)/plateforme/entreprises/export/route.ts          export CSV
src/app/actions/plateforme-annuaire.ts                        vue enregistrée
```

### Les deux chemins de lecture

| | **Index serveur** (nominal) | **Dégradé** (aujourd'hui) |
|---|---|---|
| Déclencheur | RPC `plateforme_annuaire_entreprises` présente | RPC absente (`42883` / `PGRST202`) |
| Recherche | 10 champs, en base, indexée | 3 champs, dans le processus serveur |
| Filtres, tri, pagination | en base | dans le processus serveur |
| Lignes lues en base | ≤ 100 | **toutes** |
| Lignes envoyées au navigateur | ≤ 100 | ≤ 100 |
| Au-delà de 2 000 entreprises | sert normalement | **refuse et le dit** |
| Signalé à l'opérateur | non | **bandeau permanent** |

Le mode dégradé n'est pas un mode nominal déguisé : il annonce sa dette, il annonce que la
recherche ne couvre pas le SIRET, la ville ni le contact, et il **refuse de servir** au-delà
de 2 000 entreprises plutôt que de rendre lentement une liste fausse.

### Route retenue

`/plateforme/entreprises` — sous l'espace `/plateforme` existant, donc sous
`exigerAal2Plateforme`. Aucune route concurrente n'a été créée :
`/plateforme/entreprises/[entrepriseId]/applications` préexistait et devient une destination
de la fiche. `/plateforme` conserve ses sections transverses (indicateurs, équipe plateforme,
création d'entreprise, relevé mensuel) et **pointe vers l'annuaire** à la place du bloc de
cartes.

---

## 5. Colonnes

22 colonnes au catalogue, **8 visibles par défaut** — au-delà, un tableau de gestion cesse
d'être lisible.

Par défaut : nom commercial, statut, forfait, comptes actifs, prix souscrit HT, prochaine
échéance, paiement, dernière activité.

Disponibles au sélecteur : raison sociale, SIRET, ville, référence client, contact principal,
e-mail principal, inscription, périodicité, modules, applications, comptes inclus, abonnement
HT public, remise, impayé HT.

- La colonne **nom** est structurellement non masquable : elle porte le lien vers la fiche.
  Sa case est désactivée dans le sélecteur, et une préférence qui l'omettrait la réintroduit.
- **Densité** compacte / confortable, **taille de page** 25 / 50 / 100.
- Les préférences vivent dans l'URL (donc partageables) et, via « Enregistrer cette vue »,
  dans un cookie `httpOnly` limité à `/plateforme`, qui ne contient que des critères
  d'affichage — aucun identifiant d'entreprise, aucune donnée client.
- **Un rôle sans habilitation de facturation ne reçoit jamais les colonnes d'argent**, ni à
  l'écran, ni à l'export : elles sont retirées côté serveur, pas cachées en CSS.

---

## 6. La notion de « coût »

Le mot « coût » n'apparaît nulle part dans l'interface. Sept notions distinctes le remplacent,
chacune nommée sans ambiguïté et pouvant valoir « Non disponible » :

| Libellé | Source | Vaut `null` quand |
|---|---|---|
| Abonnement HT (public) | catalogue canonique `calculerTarifAbonnement` | forfait absent ou sur devis |
| Prix souscrit HT | `abonnements_entreprises.prix_contractuel_ht` | aucun abonnement contractuel |
| Remise | champs remise de `entreprises`, écrits par le moteur canonique | aucune remise |
| Total HT récurrent | prix souscrit après remise déclarée | prix souscrit absent |
| Périodicité | abonnement | non renseignée |
| Revenu mensuel équivalent HT | total récurrent ramené au mois | total récurrent absent |
| Prochaine facture HT | — | **toujours** : Stripe la calcule à l'émission, elle n'est pas répliquée |
| Impayé HT | — | **toujours** : aucun montant d'impayé n'est agrégé en base |

Trois règles sont tenues par le code et vérifiées par les tests :

1. **Le revenu n'est jamais déduit du tarif public.** `composerCout` ne calcule un revenu
   mensuel équivalent que si `prix_contractuel_ht` existe.
2. **Le résumé dit sur quoi il porte.** L'indicateur « Revenu mensuel récurrent HT » affiche
   « sur 472 entreprise(s) — 40 sans prix contractuel », et **« Non disponible »** si aucune
   entreprise ne porte de prix contractuel.
3. **Une remise sans type exploitable n'est pas appliquée.** Elle est affichée, la raison est
   inscrite, et le total reste le prix souscrit nu.

**Aucun second moteur de remise n'est introduit.** `appliquerRemiseAffichage` relit les champs
déjà écrits par le moteur canonique (opérations `plateforme_operations_remise` + coupon
Stripe) pour montrer le prix accordé. La création, la planification et la révocation passent
intégralement par `appliquerRemiseAction` / `retirerRemiseAction` existantes.

---

## 7. Recherche

Dix champs quand l'index est déployé : nom commercial, raison sociale, SIRET, e-mail,
téléphone, contact, ville, code postal, référence client, code d'adhésion.

La **référence d'abonnement Stripe en est volontairement absente** : c'est un identifiant de
système de paiement, jamais un critère d'écran.

- Normalisation identique côté TypeScript et côté SQL proposé : minuscules, diacritiques
  retirés, ponctuation de séparation ramenée à une espace. « Éts. Dupré » rejoint « ets dupre ».
- `.`, `-`, `+` et `@` sont conservés **à l'intérieur** d'un mot (e-mails, références) et
  retirés en fin de mot.
- Le SIRET est comparé en chiffres seuls : « 123 456 789 » trouve `12345678900012`.
- Recherche partielle, insensible à la casse et aux accents.
- **Anti-frappe de 350 ms** ; la navigation passe par le routeur, ce qui **annule la charge
  serveur précédente** quand une nouvelle frappe arrive. État « Recherche… » en `aria-live`.
- L'URL porte la recherche : elle est partageable et le retour arrière rejoue la même liste.
- États couverts : chargement, vide, aucun résultat, erreur, accès refusé.

L'URL est traitée comme une entrée hostile : tri hors liste blanche, taille de page
arbitraire, onglet inexistant, date malformée et page négative sont tous ramenés au défaut.
Aucun élargissement de lecture n'est possible depuis l'URL.

**Limite du mode dégradé** : `plateforme_entreprises()` ne renvoie ni raison sociale, ni
SIRET, ni ville, ni contact. La recherche s'y limite au nom, à la référence client et au code
d'adhésion, et le bandeau le dit mot pour mot.

---

## 8. Onglets de suivi

Le cahier des charges distingue paiement en traitement, en attente, retard, échec, impayé
confirmé, expiration, annulation et suspension. **Le modèle déployé ne porte pas huit états.**
Il porte `abonnements_entreprises.statut` (essai/actif/impaye/suspendu/annule),
`entreprises.suspension_prevue_at`, `entreprises.derniere_facture_statut` (état Stripe de la
dernière facture) et `entreprises.abonnement_echeance`.

Chaque onglet déclare donc sa couverture, et l'écran affiche sa définition et sa réserve.

| Onglet | Couverture | Signal lu | Réserve |
|---|---|---|---|
| Toutes | complète | — | — |
| Actives | complète | statut `actif` sans impayé | — |
| Essais | complète | statut `essai` | — |
| À renouveler | **partielle** | échéance ou fin d'essai ≤ 30 j | **Le seuil de 30 jours est un défaut d'écran, pas une règle contractuelle.** Aucune table ne porte de préavis. À arbitrer avec les CGV. |
| Paiement en attente | **partielle** | facture Stripe `open`/`draft`, échéance non dépassée | Dépend de Stripe. Illisible ⇒ « Paiement inconnu », compté dans aucun onglet de paiement. |
| Retards de paiement | **partielle** | facture non réglée + échéance dépassée | Déduit de `abonnement_echeance` ; aucune règle de relance n'est stockée. |
| Impayés | **partielle** | suspension programmée, statut `impaye`, ou facture `uncollectible` | **« Échec de paiement » et « impayé confirmé » partagent le même signal.** La distinction demandée exige un champ dédié (bloc 5 du SQL). |
| Suspendues | complète | statut `suspendu` | — |
| Résiliées | complète | statut `annule` ou annulation programmée | — |
| **Archivées** | **absente** | — | **Aucun champ d'archivage n'existe.** L'onglet est **désactivé**, pas affiché à zéro : un zéro laisserait croire qu'aucune entreprise n'est archivée, ce qui n'est pas vérifiable. Champ proposé : `entreprises.archivee_at`. |

**Les compteurs portent sur le jeu filtré complet, jamais sur la page affichée.** Un compteur
non calculable affiche `?`, un onglet sans donnée source affiche `—`.

Ordre de priorité de la situation de paiement, identique en TypeScript et dans le SQL proposé :
impayé signalé par la plateforme **> tout état Stripe** ; illisibilité de la facturation
**> conclusion « à jour »**. Une panne ne se lit jamais comme une absence d'impayé.

---

## 9. Filtres, tri, pagination

**Filtres** : forfait, module, application, périodicité, statut d'abonnement, statut de
paiement, ancienneté du retard, remise active / absente, remise expirant sous 60 jours,
période d'inscription, fenêtre d'échéance, ville, comptes actifs (min/max), salariés (min),
option IA, essai. Filtres actifs affichés en pastilles, « Effacer les filtres », « Enregistrer
cette vue », « Oublier la vue enregistrée ».

**Quatre filtres demandés sont absents du panneau, faute de donnée source** — ils sont listés
sous le panneau avec leur raison :

| Filtre | Raison |
|---|---|
| Pays | `entreprises` ne porte que ville et code postal. |
| Client pilote | Aucun marqueur en base. Champ proposé : `entreprises.client_pilote`. |
| Incident support actif | `acces_support_log` journalise les accès, aucun état « incident actif » n'est porté. |
| Stockage | `abonnement_stockage_releves` relève par période, sans agrégat par entreprise. |

**Tri** : nom, inscription, forfait, prix souscrit, prochaine échéance, impayé, dernière
activité, comptes actifs, fin de remise. Liste blanche stricte. **Les valeurs absentes se
rangent toujours en fin de liste, dans les deux sens** — une entreprise sans échéance ne doit
pas occuper la première place d'un tri « prochaine échéance ».

**Pagination** : 25 / 50 / 100, **plafond dur de 100 lignes par requête**, page hors bornes
ramenée à la dernière page réelle, recherche/filtres/tri conservés. Le retour depuis une fiche
rejoue la page, le tri et les filtres d'origine (paramètre `retour`).

---

## 10. Fiche entreprise

`/plateforme/entreprises/[entrepriseId]`, neuf onglets internes. **Chaque section est chargée
indépendamment et porte son état de disponibilité** : une table inaccessible affiche « Non
disponible » avec sa raison sur la seule section concernée — jamais une section vide qui se
lirait comme « rien à signaler ».

| Onglet | Contenu | Source |
|---|---|---|
| Vue d'ensemble | identité, statut, paiement, inscription, activité, contact, comptes, applications, alerte de suspension | annuaire + applications |
| Abonnement et tarification | les 7 notions de coût, abonnement contractuel, options, **statut/échéance/note**, **tarifs par poste** | `abonnements_entreprises`, `options_abonnement_entreprises`, `plateforme_postes_tarifs` |
| Remises | remise active, type, valeur, périmètre, début, fin prévue ; appliquer / révoquer | champs remise + moteur canonique |
| Applications et modules | applications autorisées, validité, source ; modules actifs, origine, expiration | `acces_applications_entreprises`, `modules_entreprises`, `applications_elsatia` |
| Utilisateurs et comptes | salariés, comptes actifs, comptes inclus, postes, permissions | `plateforme_roles_entreprise` |
| Facturation et paiements | factures d'abonnement, période, montant, statut, règlement ; **signaler un impayé / enregistrer un règlement** | `factures_abonnement` |
| Assistance | sessions journalisées ; **accéder comme administrateur**, **réinitialiser un mot de passe** | `acces_support_log` |
| Communications | voie sortante disponible + sections non modélisées | — |
| Historique | actions plateforme journalisées | `plateforme_journal_actions` |

**Ce qui a été déplacé depuis les cartes** : statut/échéance/note, tarifs par poste, remise,
impayé/règlement, accès d'assistance, réinitialisation de mot de passe. Aucune capacité n'a
été perdue ; chaque commande s'applique désormais à un client identifié, pas au milieu d'une
liste.

**Trois sections demandées n'ont aucune source** et le disent :

- **Communications ciblées et acquittements** : aucune table de campagne, d'information ciblée
  ni d'acquittement. Le fil de support est la seule voie sortante.
- **Notes internes** : aucune table de notes. `entreprises.abonnement_note` est un champ libre
  unique, écrasé à chaque modification — ce n'est pas un journal.
- **Tentatives de paiement** : conservées par Stripe, non répliquées.

Une facture d'abonnement absente est explicitement présentée comme **n'étant pas une preuve
d'absence d'impayé**.

---

## 11. Parcours de remise

Recherche → ouverture de la ligne → onglet « Abonnement et tarification » ou « Remises » →
lecture du prix → « Appliquer une remise » → type → durée → motif interne obligatoire (5
caractères minimum) → aperçu du prochain prélèvement (`RemiseConfirmButton`) → confirmation
sous AAL2 → journalisation.

- La remise **ne modifie jamais le prix public du site** : le tarif catalogue et le prix
  souscrit sont deux colonnes distinctes.
- Le motif interne est conservé en base et **n'est jamais montré au client**.
- Durées offertes : une seule échéance, N mois, permanente. La fin prévue d'une remise à durée
  limitée est calculée (date d'application + N mois) ; une remise permanente n'affiche **aucune
  fin devinée**.
- Quand la commande n'est pas offerte, l'écran dit **pourquoi** : mode démonstration, session
  non AAL2, ou rôle non habilité.

---

## 12. Export

`/plateforme/entreprises/export`, CSV point-virgule + BOM UTF-8 (ouverture directe sous Excel
français).

- **Les lignes proviennent d'une relecture serveur du jeu filtré complet**, jamais de la page
  affichée. Plafond de 5 000 lignes, troncature signalée dans les en-têtes de réponse.
- Colonnes = celles de l'écran, **filtrées par les habilitations** côté serveur.
- Injection de formule neutralisée : une valeur commençant par `=`, `+`, `-`, `@`, tabulation
  ou retour chariot est préfixée d'une apostrophe.
- Guillemets échappés, décimales à la française, « Non disponible » plutôt qu'un zéro trompeur.
- **Aucune référence de paiement n'y transite** : le type `LigneAnnuaire` ne porte ni
  `stripe_customer_id`, ni `stripe_subscription_id`, ni identifiant de coupon. C'est garanti
  par construction, et vérifié par test.

### Blocage à lever

L'export **est refusé aujourd'hui hors mode démonstration**, avec un message explicite :

> `plateforme_journaliser` (migration `20260816000202`) voit son exécution **révoquée de
> `public`, `anon` et `authenticated`**, et **aucun `grant execute` ne la réaccorde nulle
> part**. Aucune Server Action ne peut donc journaliser une action plateforme.

J'ai choisi de **refuser l'export plutôt que de le produire sans trace** : une extraction
massive de données clients non traçable est précisément ce que le §15 interdit. Le correctif
est une ligne, livrée au bloc 6 du SQL proposé.

C'est un arbitrage de sécurité, pas une omission — si vous préférez que l'export sorte malgré
l'absence de journal, le point de décision est isolé dans `journaliserExport()`.

---

## 13. Permissions

Le modèle déployé (`plateforme_a_permission`, migration `20260816000202`) connaît **quatre**
rôles. Le §17 en demande six. **Aucun rôle n'a été inventé côté écran.**

| Rôle demandé | Existe | Traitement |
|---|---|---|
| Propriétaire global | oui | c'est `total` + colonne `proprietaire` (migration `20260906000266`) |
| Administrateur plateforme | oui | `total` |
| Support | oui | `support` |
| Facturation | oui | `facturation` |
| **Commercial** | **non** | consigné dans `ROLES_DEMANDES_NON_MODELISES`, proposé au bloc 7 du SQL |
| Lecture seule | oui | `lecture` |

Matrice appliquée, reflet exact de `plateforme_a_permission` :

| | consulter | montants | remise | assistance | intervenir | export |
|---|---|---|---|---|---|---|
| total | ✓ | ✓ | ✓ (AAL2) | ✓ (AAL2) | ✓ (AAL2) | ✓ |
| facturation | ✓ | ✓ | ✓ (AAL2) | — | — | ✓ |
| support | ✓ | — | — | ✓ (AAL2) | ✓ (AAL2) | ✓ |
| lecture | ✓ | — | — | — | — | — |

**Les permissions ne sont pas codées dans React.** Le rôle et la force de session sont lus par
`plateforme_role_courant` et `plateforme_ecriture_autorisee` ; chaque RPC d'écriture rappelle
ensuite `plateforme_exiger_role` et `plateforme_exiger_session_aal2`. L'écran ne fait que
refléter ces prédicats pour expliquer une commande absente : masquer un bouton n'a jamais
protégé une donnée, et une commande affichée par erreur est refusée par la base.

Une session sans rôle plateforme reçoit `notFound()`, pas un 403 : l'existence de cet espace
n'a pas à être révélée.

### Actions volontairement absentes de la liste

Conformément au §14 : suppression définitive, modification de prix sans aperçu, remise sans
motif, accès client silencieux, suspension sans confirmation. Chacune exige la fiche, un
aperçu ou un motif.

---

## 14. Performances

Mesures faites sur parc synthétique, dans les tests (`src/lib/plateforme-annuaire-serveur.test.ts`).

| Scénario | Chemin | Résultat |
|---|---|---|
| 500 entreprises, recherche + tri par montant | dégradé | page composée en **< 250 ms** |
| 500 entreprises | dégradé | 25 lignes servies, 20 pages, compteurs sur le jeu complet |
| 5 000 entreprises | dégradé | **refus explicite** en < 250 ms, plutôt qu'une réponse lente |
| 5 000 entreprises, page 150 | indexé | 25 lignes en **< 100 ms**, table entière jamais lue |

**Requêtes par page** : mode indexé, 1 RPC. Mode dégradé, 1 RPC liste + 1 RPC usage + 3
lectures d'enrichissement (abonnements, modules, applications) — **5 requêtes constantes,
aucun N+1** : les enrichissements sont regroupés en cartes par entreprise, jamais une requête
par ligne.

**Payload navigateur** : borné à 100 lignes dans tous les cas, y compris en mode dégradé.

Le mode dégradé ne satisfait pas l'exigence §8 « éviter les requêtes non bornées » côté base.
C'est assumé, affiché, et le correctif est livré.

---

## 15. États d'interface

Tous couverts, et distingués les uns des autres :

| État | Traitement |
|---|---|
| Chargement | « Recherche… » en `aria-live` pendant la transition |
| Erreur | bandeau `role="alert"` avec le message réel |
| Aucun résultat | message + « Effacer la recherche et les filtres » |
| Aucun client | « Aucune entreprise cliente enregistrée » |
| Onglet vide | « Aucune entreprise dans l'onglet « … » » |
| Accès refusé | `notFound()` |
| Facturation indisponible | bandeau dédié + **« Paiement inconnu »** sur chaque ligne |
| Informations partielles | « Non disponible » avec la raison, jamais « — » |
| Remise expirée | fin prévue affichée ; filtre « expirant sous 60 jours » |
| Entreprise suspendue | statut + alerte de suspension programmée sur la fiche |
| Mode dégradé | bandeau permanent décrivant précisément la dette |

**« — » signale une donnée vide. « Non disponible » signale une donnée que la plateforme ne
sait pas produire.** Les deux ne sont jamais confondus.

Une indisponibilité de facturation **n'est jamais transformée en « aucun impayé »** : l'écran
le dit, et ajoute qu'aucune décision de relance ou de suspension ne doit être prise tant
qu'elle dure.

---

## 16. Tests

**1 327 tests, 121 fichiers, tous au vert.** 85 tests écrits pour ce lot.

| Fichier | Tests | Couvre |
|---|---|---|
| `plateforme-annuaire.test.ts` | 53 | normalisation et accents, SIRET espacé, e-mail, ville, code postal, référence, noms proches, recherche sans résultat ; analyse d'URL hostile (tri injecté, taille arbitraire, onglet absent, date malformée, page négative) et aller-retour fidèle ; colonnes ; situation de paiement (Stripe illisible ≠ à jour, priorité de l'impayé, attente vs retard, essai) ; tranches de retard ; onglets ; filtres ; les 7 notions de coût ; résumé ; tri avec `null` en fin |
| `plateforme-annuaire-serveur.test.ts` | 18 | mode dégradé annoncé, pagination serveur, taille de page, page hors bornes, compteurs sur le jeu complet, onglet sans donnée, filtrage avant pagination, recherche sans résultat, refus au-delà du plafond, facturation illisible propagée ; préférence du chemin indexé ; construction de ligne ; **charge 500 et 5 000** |
| `plateforme-annuaire-habilitations.test.ts` | 7 | matrice des 4 rôles, exigence AAL2 pour la remise, lecture seule, mode démonstration, rôle commercial consigné |
| `plateforme-annuaire-csv.test.ts` | 7 | BOM et en-tête, **injection de formule**, guillemets, colonnes demandées, « Non disponible », décimales françaises, **aucune fuite de référence de paiement** |

Vérifications transverses exécutées :

- `npx tsc --noEmit` — **propre**
- `npx eslint` sur tous les fichiers du lot — **0 erreur, 0 avertissement**
- `npx vitest run` — **1 327 / 1 327**
- `git diff --check` — **propre**
- `npx next build --webpack` — **voir la réserve ci-dessous**

### Réserve de build, préexistante et sans rapport avec ce lot

`npx next build` échoue sur la base `1fc1331` :

```
src/app/api/stripe/abonnement/webhook/route.ts
Type error: "synchroniserAbonnementCoordonne" is not a valid Route export field.
```

Next.js 16 refuse qu'un fichier de route exporte autre chose qu'un handler. Cette fonction est
exportée **uniquement pour son test** (`route.test.ts`). Le fichier est **identique à la base**
(`git diff 1fc1331 -- <fichier>` est vide) et ce lot ne l'importe pas.

Pour prouver que le lot compile, j'ai neutralisé temporairement cet export, lancé le build
complet — **succès, les trois routes du lot compilent** (`/plateforme/entreprises`,
`/plateforme/entreprises/[entrepriseId]`, `/plateforme/entreprises/export`) — puis restauré le
fichier à l'octet près.

**Correctif suggéré, hors périmètre** : déplacer `synchroniserAbonnementCoordonne` dans
`src/lib/stripe-abonnement-webhook.ts` et l'importer depuis la route et depuis le test.

---

## 17. SQL proposé

`docs/migrations-proposees/platform-client-directory-index-v1.sql.proposed` — **411 lignes, non
jouées, aucun numéro de ledger réservé.**

| Bloc | Objet | Lève |
|---|---|---|
| 1 | `elsatia_normaliser_recherche` (IMMUTABLE, indexable) et `elsatia_chiffres_seuls` | recherche accents/SIRET en base |
| 2 | `pg_trgm` + index GIN sur nom, raison sociale, ville ; index SIRET, tri, filtres, jointures | scans complets |
| 3 | **`plateforme_annuaire_entreprises`** — recherche, filtres, onglet, tri, pagination en base ; plafond dur de 100 lignes ; liste blanche de tri | §4, §7, §8, §18 |
| 4 | `plateforme_annuaire_compteurs` — compteurs et MRR agrégés en base (squelette + spécification) | §9 sans rapatrier le parc |
| 5 | `archivee_at`, `client_pilote`, `pays`, `paiement_echec_at`, `impaye_confirme_at`, `montant_impaye_ht` | onglet Archivées, filtres manquants, distinction échec/impayé, montant d'impayé |
| 6 | **`grant execute on plateforme_journaliser to authenticated`** | débloque l'export (§12) |
| 7 | Rôle `commercial` (contrainte + `plateforme_a_permission`) | §17 |

Le bloc 4 est livré en squelette spécifié, non en implémentation : il doit être écrit contre
les CTE réelles du bloc 3 une fois celles-ci figées, et une implémentation approximative
produirait des compteurs faux — précisément ce que ce lot s'attache à éviter.

`EXPLAIN` avant/après : **non fournis.** Le CLI Supabase est bloqué sur ce poste et la base
locale porte un jeu de test multi-application qu'il ne faut pas réinitialiser. À produire sur
base jetable au déploiement du bloc 3.

---

## 18. Dépendances

**Moteur de tarification** : lecture seule de `OFFRES_TARIFAIRES`, `offreTarifaireParCle`,
`calculerTarifAbonnement`, `estCodeOffreTarifaire`. Aucun prix n'est redéfini. Si le catalogue
change, l'annuaire suit sans modification.

**Moteur de remise** : aucun second calcul. `appliquerRemiseAffichage` relit les champs écrits
par le moteur canonique ; l'écriture passe par `appliquerRemiseAction` / `retirerRemiseAction`,
donc par `plateforme_operations_remise` et le coupon Stripe. Quand le futur moteur canonique
de remises remplacera ces actions, seuls les deux appels de la fiche seront à repointer.

**Train** : la branche part de `1fc1331`, la tête du train canonique. **Aucune branche de train
n'a été modifiée.** Aucune migration n'a été ajoutée à `supabase/migrations` — le ledger reste
au numéro maximal 274.

Note : la consigne mentionne un « Train V3 ». Aucune branche de ce nom n'existe dans ce dépôt ;
les branches de train présentes sont `integration/elsatia-ecosystem-train-v2-reserves-gp-v1`
(= `1fc1331`) et `integration/gp-postcutover-migration-train-v1`. Ni l'une ni l'autre n'a été
touchée. **À confirmer** que la base retenue est la bonne.

**Fichier partagé modifié** : `src/app/(app)/plateforme/page.tsx` — retrait du bloc de cartes
(lignes 275-423), remplacé par un encart et un lien vers l'annuaire ; imports devenus inutiles
nettoyés ; l'appel `plateforme_postes_tarifs` retiré de cette page (une requête de moins) au
profit de la fiche. Point de conflit probable si un autre lot touche cette page.

---

## 19. Recette humaine à effectuer

Ce qui n'a **pas** pu être vérifié ici, et pourquoi : l'espace `/plateforme` exige une session
authentifiée réelle en AAL2, et la base locale a fermé l'accès anonyme par conception. Je ne
saisis pas d'identifiants. Les points suivants demandent donc une session réelle.

**Avec une session plateforme AAL2 (rôle « Accès total ») :**

1. `/plateforme` → vérifier que l'encart « Entreprises clientes » remplace bien les cartes et
   que le lien ouvre l'annuaire.
2. `/plateforme/entreprises` → **confirmer la présence du bandeau « Mode dégradé »** tant que
   le bloc 3 du SQL n'est pas déployé. S'il est absent, l'index a été déployé ailleurs : le
   signaler.
3. Rechercher un nom accentué, puis le même sans accents → même résultat.
4. Rechercher un SIRET avec espaces → **en mode dégradé, ne doit rien trouver** (limite
   annoncée). Après déploiement du bloc 3 → doit trouver.
5. Parcourir les 10 onglets, vérifier que les compteurs correspondent à la réalité connue de
   votre parc, et que **« Archivées » est grisé et non cliquable**.
6. Ouvrir une entreprise dont vous connaissez le prix négocié → onglet « Abonnement et
   tarification » → **vérifier que « Abonnement HT (public) » et « Prix souscrit HT » diffèrent
   bien** et que le second est le prix réellement contractualisé.
7. Vérifier qu'une entreprise sans abonnement contractuel affiche **« Non disponible »** et non
   un montant.
8. Appliquer une remise de test sur une entreprise non facturée, vérifier l'aperçu, le motif
   obligatoire, la demande AAL2, puis la révoquer. **Vérifier l'entrée dans l'onglet
   Historique.**
9. Cliquer « Exporter (CSV) » → **doit être refusé** avec le message sur `plateforme_journaliser`
   tant que le bloc 6 n'est pas déployé. Arbitrer : déployer le grant, ou décider d'exporter
   sans journal.
10. Enregistrer une vue, quitter, revenir sur `/plateforme/entreprises` nu → la vue doit être
    rejouée.
11. Depuis une fiche, revenir à l'annuaire → **la page, le tri et les filtres doivent être
    ceux d'où l'on venait**.

**Avec une session de rôle « Support » puis « Lecture seule » :**

12. Vérifier que **toutes** les colonnes de montant et les onglets Abonnement / Remises /
    Facturation disparaissent, et que l'export est refusé en lecture seule.

**Sur téléphone réel :**

13. Vérifier que la recherche est la première chose atteignable, que les onglets défilent
    horizontalement, et qu'aucun tableau n'est écrasé.

**Arbitrages produit qui vous reviennent :**

14. **Seuil de renouvellement** : 30 jours est un défaut d'écran. Quelle est la règle
    contractuelle ?
15. **Tranches de retard** (< 7 j, 7-30, 31-60, > 60) : à valider contre les règles réelles de
    facturation. Elles ne déclenchent aujourd'hui **aucune suspension automatique**.
16. **Export sans journal** : refuser (choix actuel) ou autoriser ?
17. **Rôle commercial** : à créer, ou le besoin est-il couvert par « facturation » ?
18. **Base de départ** : confirmer que `1fc1331` est bien la bonne, la consigne mentionnant un
    « Train V3 » introuvable.

---

## 20. Suites recommandées, par ordre

1. Jouer les blocs 1 à 3 du SQL proposé sur base jetable, produire les `EXPLAIN`, puis les
   numéroter au ledger → **sort du mode dégradé, tient les 5 000 entreprises**.
2. Jouer le bloc 6 (une ligne) → **débloque l'export**.
3. Écrire le bloc 4 contre les CTE figées → **compteurs et MRR agrégés en base**.
4. Bloc 5 → onglet Archivées, filtres manquants, distinction échec / impayé confirmé, montant
   d'impayé réel.
5. Corriger l'export invalide de `route.ts` du webhook Stripe → **rétablit `next build`**.
6. Modéliser notes internes et communications ciblées, aujourd'hui absentes.
