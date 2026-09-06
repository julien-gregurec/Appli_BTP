# ELSATIA Réserves — architecture V1

Lot : `ELSATIA-RESERVES-V1-FOUNDATION-AND-WORKFLOW-V1`
Base : `integration/gp-postcutover-precommercial-ops-v1` (`4266ba6`)
Migration : `supabase/migrations/20260906000268_reserves_v1_foundation_workflow_v1.sql`

## 1. Ce qu'est Réserves

Une application **indépendante** de l'écosystème ELSATIA, qui suit les réserves de
chantier du constat jusqu'à la validation de la levée, avec les entreprises qui
interviennent dessus.

Indépendante veut dire précisément ceci :

- elle possède ses **propres chantiers** et fonctionne sans Gestion Pro ;
- elle a son **propre code applicatif** (`reserves`), ses **propres rôles**, sa **propre
  interface** (`apps/reserves`, port 3020) et sa propre identité visuelle ;
- elle s'appuie sur le **socle commun** ELSATIA — compte unique, catalogue multi-app,
  isolation multi-tenant — sans le dupliquer.

Le lien avec Gestion Pro est **facultatif** et unidirectionnellement optionnel dans les
deux sens : voir `ELSATIA_RESERVES_GP_INTEGRATION_CONTRACT_V1.md`.

## 2. Emplacement dans le dépôt

| Élément | Chemin |
| --- | --- |
| Application Next.js | `apps/reserves` (port 3020) |
| Schéma et logique métier | `supabase/migrations/20260906000268_…sql` |
| Preuves base de données | `supabase/tests/reserves_v1_foundation_workflow.test.sql` |
| Contrat d'accès partagé | `packages/application-access` |
| Documentation | `docs/reserves/` |

Le choix de `apps/reserves` suit la disposition réelle du dépôt : `apps/colors` et
`apps/tools` sont déjà des applications sœurs autonomes, avec leur propre
`package.json`, leur propre installation et leur propre cycle de build.

## 3. Socle réutilisé, jamais redéfini

Réserves ne réinvente aucune brique du socle multi-app (migration `00234`) :

| Besoin | Fonction du socle |
| --- | --- |
| L'organisation a-t-elle droit à Réserves ? | `a_acces_application(entreprise, 'reserves')` |
| Quelles applications pour cet utilisateur ? | `applications_autorisees(entreprise)` |
| Qui suis-je, dans quelle organisation ? | `contexte_application_courant()` |
| Membre actif de l'organisation ? | `est_membre_actif(entreprise)` |
| Administrateur / propriétaire plateforme ? | `est_plateforme_admin()` |

**Conséquence directe et voulue** : `julien@elsatia.fr`, propriétaire global désigné par
la migration `00266`, accède à Réserves **du seul fait de son inscription au catalogue**,
sans habilitation manuelle et sans la moindre exception codée dans l'interface. Le test
`platform_global_owner_all_apps_v1` l'avait anticipé en simulant une application
`reserves` ; ce lot rend cette application réelle, et le test la traite désormais comme
telle.

Corollaire tout aussi voulu : cet accès porte sur le **catalogue**, jamais sur les
**données** d'un client. Le propriétaire global ne lit aucune réserve d'une entreprise
tierce, et n'obtient aucun droit d'écriture métier.

## 4. Modèle de données

```
entreprises (socle)
 └── reserves_chantiers ──────── chantier_gp_id → chantiers (Gestion Pro, facultatif)
      ├── reserves_plans ─────── nom / niveau / zone / document
      ├── reserves_intervenants  entreprise extérieure invitée
      │     └── entreprise_intervenante_id → entreprises (son propre tenant)
      └── reserves
            ├── reserves_photos           constat / preuve_refus / travaux / levee
            ├── reserves_historique       append-only
            ├── reserves_conversations ── reserves_messages
            └── reserves_evenements_notifications
reserves_transitions  ── matrice canonique de la machine à états
```

### Décisions structurantes

**L'entreprise invitée est un tenant à part entière.** Elle n'est pas un « compte
fantôme » rattaché à l'organisation hôte : c'est une `entreprises` normale, avec ses
propres membres. Elle ne voit donc jamais rien *par appartenance* — tout ce qu'elle voit
lui vient de l'attribution nominative d'une réserve, via
`reserves_intervenant_courant()`. C'est ce qui rend l'isolation démontrable plutôt que
déclarative.

**La position sur plan est une fraction normalisée** (`position_x`, `position_y` dans
`[0,1]`). Aucun repère métrique n'est inventé : ce qui n'est pas mesuré n'est pas
stocké. Le fond de plan est un document (`storage_path`) ; un viewer complet — calques,
échelle, PDF multipages, pointage tactile — relève d'un lot dédié.

**L'exigence de photo est portée par la réserve**, pas par un réglage global. Une
reprise structurelle et une finition esthétique n'appellent pas la même preuve : c'est
l'émetteur qui tranche, réserve par réserve, à la création.

**La numérotation est propre au chantier** et sérialisée par un verrou de ligne sur
`reserves_chantiers.compteur_reserves` : deux créations concurrentes ne peuvent pas
obtenir le même numéro.

## 5. Sécurité

Toutes les tables portent une RLS. Le schéma d'autorisation a deux entrées :

- `reserves_action_autorisee(entreprise, action)` — l'organisation **hôte**, par rôle ;
- `reserves_intervenant_courant(intervenant_id)` — l'entreprise **invitée**, par
  attribution.

Aucune écriture sensible n'est laissée au client : photos, historique, messagerie et file
de notification n'ont **aucune** policy d'écriture pour `authenticated`, et le droit
correspondant est explicitement révoqué. Elles ne sont alimentées que par les RPC
`security definer`.

L'historique est **immuable** : ni `update` ni `delete` ne sont possibles depuis
l'application, y compris pour un administrateur de l'organisation.

## 6. Mobile et terrain

L'interface est conçue mobile d'abord : cibles tactiles ≥ 44 px, navigation à défilement
horizontal, formulaire de constat en un seul écran dans l'ordre du geste réel — ce qu'on
voit, où c'est, qui reprend, pour quand.

Rien dans l'application n'empêche une encapsulation iOS/Android ultérieure (pas d'API
navigateur exotique, pas de dépendance à un domaine unique). **Aucun wrapper natif n'est
créé par ce lot.**

## 7. Hors-ligne — état réel

Ce lot **n'implémente pas** la synchronisation hors-ligne. Il en pose les points
d'ancrage vérifiables :

- `reserves.origine_client_id` et `reserves_photos.origine_client_id` : clés
  d'idempotence côté client, avec index unique par organisation ;
- `reserves_creer()` renvoie la réserve existante lorsqu'une création locale est rejouée
  (comportement prouvé par le test pgTAP).

Ce qui manque pour un vrai mode hors-ligne : file d'attente locale, mise en cache des
chantiers et plans, upload différé des photos, et une politique de résolution de
conflits. C'est un lot à part entière.

## 8. Export PDF — état réel

`reserves_export_chantier(chantier, entreprise?)` fournit le jeu de données d'export,
filtrable par entreprise intervenante et soumis aux mêmes contrôles d'accès que la
lecture normale : aucune donnée cross-tenant ne peut y figurer.

La page `/chantiers/[id]/export` met ces données en forme pour l'impression (feuille de
style `@media print`). **Le PDF de la V1 est l'impression navigateur.** Un rendu PDF
côté serveur — en-tête, pagination, vignettes photo, extrait de plan avec repères —
n'est pas livré ici.

## 9. Ce que ce lot ne livre pas

Énoncé sans ambiguïté, pour que rien ne soit présenté comme acquis :

- synchronisation hors-ligne (voir §7) ;
- génération PDF côté serveur (voir §8) ;
- viewer de plan complet et pointage tactile ;
- QR chantier / zone : aucune colonne, aucun écran — le besoin est noté, le contrat
  reste à écrire ;
- signature électronique et procès-verbal de réception ;
- envoi réel des notifications : la file `reserves_evenements_notifications` est écrite
  par les actions métier, **jamais consommée**. `distribue_at` reste nul.
