# RELANCES-AUTO-V1 — Relances automatiques et manuelles contrôlées (devis, factures)

## Découvertes réelles en cours de lot

1. **Un système de relance existait déjà partiellement, mais pour un besoin différent** :
   `relances_impayes` (module CRM, migration `20260715000080`) gère des relances
   multi-canal (email/sms/courrier/téléphone) **manuelles uniquement**, gated par
   `gerer_crm`, l'envoi email se faisant via un simple `mailto:` (le client mail de
   l'utilisateur, pas un envoi applicatif). Ce lot couvre un besoin réellement différent
   (email uniquement, automatique ET manuel, devis **et** factures, permissions
   `gerer_devis`/`gerer_factures`) : plutôt que de détourner une table à la sémantique et
   aux permissions différentes, un schéma séparé a été créé. `relances_impayes` n'a pas
   été touché.
2. **`factures.statut = 'en_retard'` n'est pas recalculé quotidiennement** — seulement au
   moment d'un mouvement de règlement (trigger `recalc_paiements_facture`). Une facture
   réellement en retard peut donc rester affichée `envoyee` en base des semaines durant si
   aucun paiement n'est intervenu. Le moteur d'éligibilité ne fait donc jamais confiance au
   seul statut stocké : il recalcule lui-même le retard à partir de `date_echeance`.
3. **`verrouiller_facture_emise()` — un second trigger d'immutabilité, découvert en
   nettoyant la fixture de recette** : toute facture non-brouillon (statut ≥ `envoyee`,
   pas seulement payée) devient définitivement non supprimable, sur le même modèle que
   `verrouiller_devis_accepte()` déjà rencontré lors de WORKFLOW-DEVIS-V1 — mais avec une
   portée plus large (dès l'émission, pas seulement l'acceptation/le paiement). Conséquence
   directe : toute facture de test créée directement au statut `envoyee` pour tester
   l'éligibilité aux relances devient un résidu permanent. Documenté ci-dessous (§Nettoyage).

## Architecture

Un **unique moteur d'éligibilité** (`src/lib/relances-moteur.ts`,
`evaluerEligibiliteDevis`/`evaluerEligibiliteFacture`), partagé sans exception par la
relance manuelle, la relance automatique (cron) et la simulation — jamais deux règles
différentes (§5 du cahier des charges).

### Éligibilité devis

Statut `envoye` uniquement. Un devis `expire` est **volontairement exclu** : décision
documentée (pas une règle métier préexistante) — un devis expiré ne peut plus être accepté
tel quel, le relancer n'a pas de sens produit. `accepte`/`refuse`/`annule` sont exclus par
construction (seul `envoye` est éligible). Email client requis. Délai depuis la dernière
relance (ou depuis `date_emission` si aucune) ≥ délai configuré. Niveau suivant = nombre de
relances déjà **envoyées** + 1, plafonné au maximum configuré.

### Éligibilité facture

Statut `envoyee`, `en_retard` ou `payee_partiel`. `date_echeance` dépassée **recalculée à
la volée** (voir découverte réelle #2 ci-dessus, jamais le seul `statut` stocké). Reste à
payer > 0 (`resteAPayerFacture()`, nouveau helper partagé dans `src/lib/factures.ts`).
`annulee`/`avoir_emis`/`brouillon`/`payee` exclus.

### Anti-doublon réel (§21/§22) — le cœur de la garantie

Un index unique partiel en base :
```sql
create unique index relances_documents_verrou
  on public.relances_documents (type_document, document_id, niveau)
  where statut in ('planifiee', 'envoyee');
```
Réclamé de façon atomique par le RPC security definer `relance_reclamer` (`ON CONFLICT ...
DO NOTHING`), **avant** tout appel Brevo. Un second appel concurrent (double cron, double
clic) reçoit `null` et n'appelle jamais Brevo — vérifié réellement (pas seulement
unitairement) via 10 tests pgTAP exécutés contre la base Preview liée, dont le test direct
de double réclamation (§Tests). Après tentative, `relance_finaliser` fait passer la ligne à
`envoyee` (verrou définitif pour ce niveau, plus jamais réclamable) ou `echec`/`ignoree`
(hors de l'index — une nouvelle tentative reste possible, §47 retry).

**Piège corrigé avant tout déploiement** : `est_membre_actif()`/`a_permission()` dépendent
de `auth.uid()`, qui est `null` sous le client `service_role` utilisé par le cron (aucune
session utilisateur). Le chemin automatique de `relance_reclamer` **ne vérifie donc ni
l'un ni l'autre** — seule la légitimité en amont (le cron ne construit sa liste de
candidats qu'à partir des entreprises ayant explicitement activé l'auto) garantit
l'autorisation. Repéré en écrivant la migration, avant tout test — sans quoi toute
réclamation automatique aurait échoué silencieusement en Production.

### Revalidation juste avant l'envoi (§23-25)

`executerRelance` revalide **entièrement** l'éligibilité (même moteur) immédiatement après
la réclamation, juste avant l'appel Brevo. Un devis accepté ou une facture payée entre la
sélection du candidat et l'envoi effectif aboutit à `statut: 'ignoree'`, jamais à un envoi.
Vérifié par test unitaire dédié (devis accepté / facture payée après réclamation).

## Modes manuel et automatique

Différence unique : `automatique: boolean` et `declenchePar: string | null` passés à
`executerRelance` — même fonction, mêmes RPC, même moteur d'éligibilité. La relance
manuelle (`relancerDocumentManuellementAction`) n'applique pas l'exclusion
`relance_auto_exclue` (un document exclu de l'automatique reste relançable manuellement, à
la demande explicite de l'utilisateur — cohérent avec l'intention du réglage).

## Cron / scheduler

Greffé sur `/api/cron/abonnements` (`traiterRelancesAutomatiques`, appelé depuis
`route.ts`), **pas de nouveau cron** — ce fichier documente déjà lui-même la contrainte du
plan Vercel Hobby (nombre de crons limité), déjà contournée trois fois pour d'autres jobs
(abonnements Stripe, option IA, paie, pointage). Créer un 4ᵉ cron dédié aurait recréé le
même problème déjà résolu. Authentification identique à l'existant (`CRON_SECRET` en
bearer, `cronsSontActifs()`), non dupliquée.

**Sous-flag `FEATURE_RELANCES_AUTO_ENABLED`** (fail-closed) : ne coupe que
l'automatisation, jamais la relance manuelle. Vérifié à l'intérieur de
`traiterRelancesAutomatiques` — si désactivé, le job retourne immédiatement sans charger
aucune entreprise ni exécuter aucun candidat.

## Configuration (Paramètres → Relances)

Par entreprise (`parametres_relances`, une ligne, upsert) : activation devis/factures
séparée, délais (première relance, entre relances), nombre maximum de relances, envoi le
week-end (§39, option simple plutôt que calendrier ouvré — aucun calendrier ouvré
n'existait déjà dans le produit), pause temporaire (`pause_jusqu_au`, §27). Écriture gated
par `gerer_parametres` (RLS restrictive dédiée), lecture par simple appartenance active.

**Valeurs par défaut** (`PARAMETRES_RELANCES_DEFAUT`, `src/lib/relances.ts`) : devis 7j/7j/2
relances max, factures 3j après échéance/7j/3 relances max — point de départ documenté et
modifiable, **désactivé par défaut** (`devisAutoActif`/`facturesAutoActif = false`), aucune
pratique de relance automatique n'existant déjà dans ce produit pour s'aligner dessus.

**Première activation** (§11) : un résumé (documents concernés, cadence, « aucun envoi
immédiat ») est affiché avant toute écriture, avec boutons Activer/Annuler — vérifié
réellement en Preview.

## Simulation (§12)

`simulerRelancesAction` réutilise **exactement** `listerCandidatsAutoDevis`/
`listerCandidatsAutoFactures` (les mêmes fonctions que le cron réel) : ce qui est affiché
dans « Voir les relances qui partiraient aujourd'hui » est garanti identique à ce que le
prochain passage du cron enverrait. Vérifié réellement en Preview.

## Templates (§14-16)

`src/lib/relances-email.ts` — même idiome de construction que l'existant
(`contenuEmailDocument`/`corpsHtmlEmailDocument`, `src/lib/email.ts`), réutilisé tel quel
pour le rendu HTML. Ton neutre et professionnel par défaut, jamais « URGENT »/« DERNIÈRE
CHANCE ». Libellé de niveau dynamique (`libelleNiveauRelance`) plutôt que 3 paliers
hardcodés : le dernier niveau configuré est toujours « finale », quel que soit le nombre
maximum choisi par l'entreprise (1 à 5) — pas de stratégie commerciale imposée.

**Pas de génération IA automatique côté cron** (§32) : les templates sont entièrement
déterministes. Aucun bouton « Reformuler avec l'IA » n'a été ajouté à ce lot (non demandé
comme prioritaire) — templates fixes uniquement pour cette V1.

## Brevo (§17)

Réutilise `envoyerEmailBrevo` (`src/lib/brevo.ts`) tel quel, aucun nouveau provider. Pas de
pièce jointe PDF pour les relances (contrairement à l'envoi du document original) : une
relance est une nudge légère, pas un renvoi du document complet — décision volontaire pour
ne pas alourdir chaque relance (§19).

**Lien document** : `obtenirNouveauTokenPartage` réutilisé tel quel — **révoque le token
précédent à chaque appel** (comportement déjà existant, pas modifié). Une relance mint donc
un nouveau lien et invalide l'ancien envoyé précédemment ; le client utilise simplement le
lien le plus récent reçu. Si le lien échoue à se générer, l'e-mail part quand même sans
lien plutôt que de bloquer toute la relance.

**Constat de recette Preview** : `BREVO_API_KEY`/`EMAIL_FROM_ADDRESS` ne sont pas
configurées sur Preview (vérifié — absentes des deux environnements), un état préexistant
non lié à ce lot (le bouton "Envoyer par email" existant sur les fiches devis/factures a le
même besoin). Conséquence : le comportement `echec` a été vérifié réellement (statut
`echec`, message clair, verrou libéré pour retry — voir §Nettoyage/§Recette), mais l'envoi
réussi et la réception réelle n'ont pu être vérifiés qu'unitairement (Brevo mocké,
24 tests). Aucune action prise pour configurer Brevo sur Preview dans ce lot — décision
hors périmètre (nécessite une clé, à ajouter par Julien s'il le souhaite pour une recette
email complète).

## Historique

`relances_documents` : entreprise/type/document/niveau/destinataire/sujet/statut
(`planifiee`/`envoyee`/`ignoree`/`echec`)/motif/`erreur_public_safe` (jamais le corps brut
Brevo)/`provider_message_id`/`automatique`/`declenche_par`/`date_envoi`. Affiché sur la
fiche devis/facture (`RelanceDocumentSection`) et exploitable pour le centre d'alertes
(échecs récents).

## Exclusions (§28/§29)

`devis.relance_auto_exclue`, `factures.relance_auto_exclue`, `clients.relance_auto_exclue`
— trois booléens simples, n'affectent que le chemin **automatique** (`pourAuto: true`),
jamais la relance manuelle. Ajout jugé simple et utile, conforme à la préférence du cahier
des charges pour l'exclusion client.

## Permissions (§34)

`gerer_devis` pour les relances devis, `gerer_factures` pour les factures (pas
`gerer_crm`, contrairement à `relances_impayes` — correction délibérée, les deux
fonctionnalités n'ont pas la même portée). `gerer_parametres` pour la configuration.
Terrain (aucune de ces permissions) : section masquée sur les fiches, action serveur
refusée si appel direct — vérifié unitairement.

## Multi-tenant / IDOR (§35)

`relance_reclamer` revérifie que le document appartient réellement à l'entreprise
appelante avant toute réclamation — vérifié réellement par pgTAP (Admin A refusé sur un
devis de l'entreprise B, message `Document introuvable`, jamais de fuite d'existence).

## Alertes (§51/§52)

Un seul nouvel item ajouté au centre d'alertes existant : **échecs de relance** des 7
derniers jours (domaine `Commercial`/`Facturation`, déjà délégable sans modification —
`DOMAINE_VERS_PERMISSION_DELEGATION` couvrait déjà ces deux domaines). Décision volontaire
de **ne pas** ajouter une alerte générique « devis/facture à relancer » : elle ferait
doublon avec les alertes d'échéance devis/facture déjà existantes sur ce tableau de bord,
et la simulation dédiée remplit déjà ce rôle sans surcharger le centre d'alertes.

## RGPD (§54/§55)

Finalité contractuelle/commerciale (relance d'un document déjà transmis dans le cadre
d'une relation commerciale existante), pas une communication marketing — **aucun lien de
désinscription générique ajouté**, conformément à la mise en garde du cahier des charges
(nécessiterait une analyse juridique dédiée, hors périmètre technique de ce lot).
Conservation : historique des relances conservé indéfiniment dans `relances_documents`
comme le reste des données métier de l'entreprise (aucune purge automatique ajoutée — même
politique que le reste du produit, pas de politique de rétention spécifique inventée).

## Tests

- **20 tests Vitest** sur le moteur d'éligibilité
  (`src/lib/relances-moteur.test.ts`) : tous les statuts devis/facture, exclusions
  document/client, délais (première relance / entre relances), plafond de niveau, email
  absent, revalidation post-réclamation (devis accepté / facture payée / pause entre-temps),
  double réclamation (RPC retourne null → `deja_en_cours`, aucun appel Brevo).
- **6 tests Vitest** sur `relancerDocumentManuellementAction`
  (`src/app/actions/relances.test.ts`) : Gérant, permissions manquantes (devis/factures),
  Terrain, cross-tenant (document introuvable), devis non éligible.
- **4 tests Vitest** sur le job cron (`src/lib/relances-cron.test.ts`) : sous-flag
  désactivé, aucune entreprise éligible, lot multiple (devis+factures), volet désactivé
  n'appelant pas l'autre lister.
- **4 tests Vitest** ajoutés sur la route cron existante
  (`src/app/api/cron/abonnements/route.test.ts`) : secret absent (503), auth invalide
  (401), auth valide (200, job relances appelé) — l'authentification cron n'avait jamais
  été testée directement jusqu'ici, corrigé au passage.
- **10 tests pgTAP** (`supabase/tests/relances_auto_v1_reclamation.test.sql`), **exécutés
  réellement contre la base Preview liée** (stack Docker locale non utilisée, même
  contrainte que les lots précédents cette session) : permission manuelle, réclamation
  réussie, **double réclamation bloquée (le test central anti-doublon)**, cross-tenant,
  déclencheur invalide, cohérence automatique/déclencheur, **réclamation automatique sans
  session utilisateur** (le bug corrigé avant déploiement, revérifié ici en conditions
  réelles), libération après échec (retry), verrou définitif après envoi, unicité en base.
  Tous les 10 passent.

## Recette Preview

`FEATURE_RELANCES_AUTO_ENABLED=true` activé sur `elsatia-preview` (reste activé), migration
appliquée réellement (`db query --linked`, ledger réparé — même méthode que les lots
précédents face à la dérive de ledger Preview déjà documentée). Fixture
`RECETTE-RELANCES-AUTO-V1` créée dans l'entreprise de test existante
(`RECETTE-WORKFLOW-DEVIS-V1`), un client + un devis envoyé (émis il y a 20 jours, donc
immédiatement éligible) + une facture échue (10 jours de retard, 600 € restant dû), adresse
e-mail de test contrôlée (`.invalid`, jamais un vrai client).

- Simulation → affiche correctement les deux documents (client, désignation, niveau,
  destinataire, montant).
- Première activation devis puis factures → résumé conforme, confirmé, `parametres_relances`
  correctement écrit (vérifié en base).
- Relance manuelle devis → carte de confirmation, verrou réclamé, tentative Brevo (échoue
  proprement — Brevo non configuré sur Preview, voir §Brevo — `statut='echec'`, message
  clair, **aucune fausse ligne `envoyee`**).
- Retry après échec → nouvelle tentative possible (verrou bien libéré), vérifié en base.
- Mobile 375px → section Relances et page Paramètres → Relances sans débordement horizontal.

## Nettoyage

Fixture supprimée : `relances_documents`, devis de test. **La facture de test et le client
associé sont devenus des résidus permanents** — `verrouiller_facture_emise()` (découverte
réelle #3 ci-dessus) bloque la suppression de toute facture non-brouillon, et le client
reste ensuite référencé par cette facture (contrainte de clé étrangère). Marqués
explicitement (`notes_internes`/`notes` préfixés `RESIDU-PERMANENT-RELANCES-AUTO-V1`),
jamais contourné en affaiblissant le trigger — même discipline que les résidus déjà
documentés lors de WORKFLOW-DEVIS-V1. `parametres_relances` de cette entreprise partagée a
été remis à zéro (ligne supprimée) pour ne pas laisser un futur lot hériter d'un état
« auto activé » surprenant.

## QA

`typecheck`/`lint`/`vitest run` (498/498)/`build`/`verify:secrets`/`verify:migrations`
(209)/`npm audit` : tous verts.

## Feature flag et rollback

`FEATURE_RELANCES_AUTO_ENABLED` — fail-closed, isole l'automatisation de la relance
manuelle (qui reste utilisable même flag coupé). Non activé en Production dans ce lot
(Preview uniquement, conformément à la consigne). Rollback : couper le sous-flag suffit à
arrêter tout envoi automatique futur — aucun rollback DB nécessaire, l'historique déjà
écrit reste intact et cohérent (aucune ligne ne peut jamais être ré-émise pour un niveau
déjà `envoyee`).

## Limites V1

Pas de génération IA automatique dans le cron (templates déterministes uniquement), pas de
bouton « Reformuler avec l'IA » (non ajouté, non prioritaire), pas de lien de
désinscription (analyse juridique nécessaire avant d'en ajouter un), pas de calendrier
ouvré configurable au-delà du simple interrupteur week-end, pas de contact
facturation/commercial distinct par client (un seul `clients.email`, cohérent avec le reste
du produit), plafond de lot fixé à 200 candidats par type et par entreprise et par
exécution (documenté, `PLAFOND_CANDIDATS_PAR_TYPE` dans `relances-moteur.ts` — largement
suffisant pour un lancement, à revoir si le volume réel l'exige).
