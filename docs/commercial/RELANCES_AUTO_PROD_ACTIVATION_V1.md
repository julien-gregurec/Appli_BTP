# RELANCES-AUTO-PROD-ACTIVATION-V1 — Activation Production des relances automatiques

## Contexte

Suite à RELANCES-AUTO-V1 (voir [RELANCES_AUTO_V1.md](./RELANCES_AUTO_V1.md)), ce lot active
la fonctionnalité en Production réelle (`app.elsatia.fr`), avec la contrainte
architecturale explicite : ne créer **ni deuxième cron Vercel, ni deuxième secret** —
découpler l'exécution interne de l'unique endpoint `/api/cron/abonnements` existant.

## Découverte réelle majeure : `CRON_SECRET` absent en Production

Avant ce lot, `FEATURE_CRONS_ENABLED=false` **et** `FEATURE_RELANCES_AUTO_ENABLED` inexistant
faisaient toujours retourner `404` par la route (branche la plus précoce du handler). Cette
branche masquait un vrai problème d'infrastructure : **la variable d'environnement
`CRON_SECRET` n'existait pas du tout sur le projet Vercel `elsatia-production`** — vérifié
via `vercel env ls production` (liste complète, aucune ligne `CRON_SECRET`) avant toute
tentative d'appel. Conséquence concrète : le vrai Cron Vercel planifié
(`vercel.json`, `15 3 * * *` sur ce même path) aurait échoué en `503` dès qu'un des deux
flags serait passé à `true` — indépendamment de ce lot, cette variable manquait déjà pour
que la fonctionnalité automatique fonctionne un jour. Corrigé : un secret aléatoire fort
(`openssl rand -hex 32`, 64 caractères) généré et ajouté via `vercel env add CRON_SECRET
production`, jamais affiché (valeur uniquement dans un fichier scratchpad temporaire,
supprimé après usage — jamais imprimée dans une sortie de commande visible).

**Piège annexe découvert en testant** : ce projet crée les variables d'environnement en
type `Sensitive` (pas `Encrypted`) — `vercel env pull` ne peut **jamais** relire une valeur
`Sensitive` en clair (retourne un placeholder littéral `[SENSITIVE]`, 11 caractères). Le
protocole « pull → source → use → delete » établi lors des lots précédents pour les secrets
`Non-sensitive` (ex. `FEATURE_CRONS_ENABLED`) ne fonctionne donc **pas** pour un secret créé
`Sensitive` comme `CRON_SECRET` : la seule façon d'utiliser une valeur qu'on vient soi-même
de générer est de conserver le fichier local qui a servi à l'écrire (jamais affiché à
l'écran), puis de le supprimer une fois l'appel effectué.

## Architecture — découplage du cron

`src/app/api/cron/abonnements/route.ts` : `cronsSontActifs()` (jobs historiques : Stripe,
option IA, paie, pointage) et `relancesAutoEstActive()` (relances) sont désormais évalués et
exécutés **indépendamment** dans le même handler. `404` uniquement si les deux flags sont
faux (comportement identique à l'existant pour ce cas précis, conforme au precedent
`/api/cron/notifications-push`). `traiterRelancesAutomatiques` est toujours appelé après
authentification réussie — la fonction s'auto-garde en interne via
`relancesAutoEstActive()`, l'appeler inconditionnellement est donc sûr même flag coupé.
5 tests Vitest dédiés couvrent explicitement toutes les combinaisons des deux flags
(`src/app/api/cron/abonnements/route.test.ts`).

## Nouveau : aperçu réel avant relance manuelle (§20)

Gap trouvé en recette Production live : la confirmation de relance manuelle n'affichait
qu'un texte générique, sans destinataire/objet/contenu/montant réels — insuffisant avant un
envoi réel en Production. Corrigé avec `previsualiserRelanceManuelleAction`
(`src/app/actions/relances.ts`) — aperçu en lecture seule, réutilise le moteur
d'éligibilité et de construction de contenu existant sans jamais appeler Brevo — et
`RelanceDocumentSection.tsx` réécrit pour afficher cet aperçu avec Confirmer/Annuler avant
tout envoi.

## Recette Production réelle

Fixture : entreprise `RECETTE-RELANCES-PROD-V1`, un client (adresse contrôlée
`support@elsatia.fr`, choisie explicitement par Julien plutôt qu'une adresse personnelle ou
`.invalid`, pour permettre une vérification réelle de livraison), un devis et une facture.

- **Manuel devis** : aperçu réel affiché puis annulé une première fois (vérification du
  gap ci-dessus), puis envoi confirmé réellement — `provider_message_id` Brevo réel
  capturé, **email reçu confirmé directement par Julien** (« Devis bien reçu sur l'adresse
  mail donnée »).
- **Double relance manuelle immédiate (§22)** : nouvelle tentative sur le même devis quelques
  secondes après → refusée proprement (« Délai avant relance pas encore écoulé »), aucun
  second envoi, aucun doublon.
- **Manuel facture (§23)** : un seul envoi, contenu vérifié (montant, échéance, destinataire),
  `provider_message_id` Brevo réel.
- **Test central §26-27 (isolation réelle)** : `FEATURE_RELANCES_AUTO_ENABLED=true` activé,
  audit préalable (§33-34, voir ci-dessous) confirmé propre, puis appel authentifié réel de
  `/api/cron/abonnements` en Production (`FEATURE_CRONS_ENABLED=false` inchangé) — réponse :
  `jobsHistoriques: {executes: false}` (Stripe/paie/pointage/option IA **non exécutés**) et
  `relances.envoyees: 1` (relance automatique devis niveau 2 exécutée) — preuve directe que
  le découplage fonctionne réellement, pas seulement en test unitaire.
- **§28 auto devis** : `devis_auto_actif` activé sur la fixture uniquement, dernière relance
  niveau 1 antidatée de 8 jours (mécanisme métier existant — mise à jour contrôlée de
  `date_envoi`, pas de contournement) pour rendre le niveau 2 éligible → exactement 1 email
  envoyé, `automatique=true`, niveau 2, `provider_message_id` réel.
- **§30 idempotence réelle** : second appel cron immédiat, mêmes flags → `envoyees: 0`,
  aucun doublon (niveau 2 déjà envoyé, niveau max = 2 atteint).
- **§29 auto facture** : bascule `devis_auto_actif=false`/`factures_auto_actif=true`
  (aucun redéploiement nécessaire — donnée DB, pas variable d'environnement), même
  antidatage sur la facture, troisième appel cron → exactement 1 email facture niveau 2,
  devis non retouché.
- **§32 simulation** : « Voir les relances qui partiraient aujourd'hui » → « Aucune relance
  ne partirait aujourd'hui » (correct, niveaux déjà envoyés aujourd'hui), aucune écriture
  déclenchée par la simulation.
- **§40 e-mail de test** : « Envoyer un e-mail de test (devis) à ma propre adresse » →
  confirmé (« E-mail de test envoyé à votre propre adresse »). Variante facture **non
  testée volontairement** — même mécanisme sous-jacent, le cahier des charges demande
  explicitement de ne pas multiplier les messages de recette.
- **§41-43 mobile** : Paramètres → Relances vérifié à 430px, aucun débordement, cases à
  cocher reflétant fidèlement l'état réel en base.

## Audit pré-activation (§33-34) — garde-fou critique

Avant toute activation du flag global, requête en lecture seule sur `parametres_relances`
(`devis_auto_actif = true OR factures_auto_actif = true`, hors entreprise fixture) : **0
résultat**. Confirmé : aucune entreprise réelle n'avait déjà l'automatique configuré actif
avant ce lot — l'activation du flag global n'a donc déclenché aucun envoi imprévu vers un
vrai client.

## Nettoyage (§47-49)

Supprimés réellement : `relances_documents` (4 lignes), `parametres_relances` (fixture),
devis de test. **Résidu permanent, comme anticipé et documenté dans RELANCES-AUTO-V1** :
la facture de test (`verrouiller_facture_emise()`), et par cascade FK obligatoire, le client
et l'entreprise elle-même (la suppression de l'entreprise tente un `DELETE` en cascade sur
`factures`, bloqué par le même trigger) — même discipline que le lot précédent : jamais de
contournement du trigger. Marqués explicitement
(`factures.notes_internes`/`clients.notes` préfixés
`RESIDU-PERMANENT-RELANCES-AUTO-PROD-ACTIVATION-V1`). L'utilisateur d'authentification et sa
ligne `utilisateurs` sont conservés avec l'entreprise pour ne pas casser l'intégrité
référentielle (`entreprise_active_id` mis à `null`).

## État final des flags

- `FEATURE_RELANCES_AUTO_ENABLED=true` — activé en Production, laissé actif (recette
  entièrement verte). Chaque entreprise réelle reste individuellement à `false` par défaut
  (confirmé par l'audit §33-34) : l'activation globale ne relance personne tant qu'un admin
  n'active pas explicitement l'automatique pour sa propre entreprise.
- `FEATURE_CRONS_ENABLED` — **non touché**, reste `false` (vérifié après ce lot).
- `CRON_SECRET` — désormais présent en Production (absent avant ce lot), nécessaire au bon
  fonctionnement du Cron Vercel réel planifié (`15 3 * * *`) autant qu'à ce lot.

## Rollback

Repasser `FEATURE_RELANCES_AUTO_ENABLED=false` (sous-flag fail-closed) puis redéployer :
arrête tout envoi automatique futur immédiatement, la relance manuelle reste disponible,
aucun rollback de migration nécessaire, l'historique déjà écrit reste intact et cohérent
(un niveau déjà `envoyee` ne peut jamais être ré-émis). Les jobs historiques
(`FEATURE_CRONS_ENABLED`) sont totalement indépendants et non affectés dans un sens comme
dans l'autre.

## QA finale

`npm run verify` (clean, typecheck, lint, vitest run, verify:migrations, verify:secrets,
build) : vert de bout en bout. `npm run audit:security` : 0 vulnérabilité. Suite pgTAP non
ré-exécutée contre Production (déjà validée contre Preview lors de RELANCES-AUTO-V1,
ré-exécuter des tests destructifs contre la base réelle n'est pas approprié) — la garantie
anti-doublon a été revérifiée directement en conditions réelles à la place (§30 ci-dessus,
double appel cron réel).

## Limites

Vérification Brevo « Sent/Delivered » côté tableau de bord non effectuée (nécessiterait soit
un accès au dashboard Brevo, soit la clé API elle-même — les deux hors de portée sans
exposer un secret) : la preuve retenue est la confirmation directe de réception par Julien
sur `support@elsatia.fr`, plus un `provider_message_id` réel pour chaque envoi, plus le
comportement HTTP 200/`statut: envoyee` cohérent — jugée suffisante en l'absence d'accès
sûr au tableau de bord Brevo.
