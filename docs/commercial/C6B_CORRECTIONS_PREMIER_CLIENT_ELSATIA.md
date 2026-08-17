# C6-B — Corrections du parcours premier client ELSATIA

Date : 17 août 2026  
Périmètre : Local et Preview uniquement  
Exclusions : Production, Stripe Live, TARIFS-V2, ADMIN-V1, PROMO-V1, C6-C et C6-D

## 1. Résultat

C6-B corrige les trois blocants fonctionnels identifiés par C6-A : création du premier devis, échéance fiable de l’essai de 30 jours et activation du pointage du dirigeant. La correction est portée par une migration dédiée et des changements applicatifs limités au parcours abonnement/onboarding.

La migration a été testée en Local puis appliquée isolément au projet Supabase Preview `pgvvpqyjziyapbbkydmc`. Le déploiement Vercel Preview `dpl_E7GHhbR6vVnkfGt4pJdo8nCW6hj5` est `Ready` à l’adresse `elsatia-preview-c9d02yvt0-julien-gregurec1.vercel.app`.

Aucune action Production ou Stripe Live n’a été réalisée.

## 2. Premier devis et transformation en facture

### Cause

La politique RLS de `lignes_devis` vérifiait correctement l’entreprise et les permissions métier, mais le rôle SQL `authenticated` ne possédait pas le privilège de base nécessaire. La reproduction exacte échouait avant l’évaluation RLS avec `permission denied for table lignes_devis`.

Le test devis → facture a révélé le même défaut indépendant sur `lignes_factures`. Sa correction est incluse car elle est indispensable au parcours explicitement demandé par C6-B.

### Correction

- ajout des privilèges `SELECT`, `INSERT`, `UPDATE` et `DELETE` à `authenticated` sur les deux tables ;
- retrait explicite de ces privilèges à `anon` ;
- aucune désactivation ni ouverture globale de RLS ;
- aucune clé service utilisée côté client ;
- conservation des contrôles existants sur le devis/facture parent et l’entreprise active.

### Preuves

Les tests couvrent la création, l’ajout, la modification, la suppression, la sauvegarde, la réouverture, les totaux et la transformation devis → facture sans doublon. Un administrateur B ne peut ni lire ni modifier les lignes de A ; un utilisateur non rattaché et un salarié sans permission restent refusés.

## 3. Essai de 30 jours

### Ancienne logique

Le bootstrap plaçait l’entreprise en statut `essai` sans garantir de date de début ni de fin. Stripe Checkout ajoutait ensuite `trial_period_days=30`. Un utilisateur pouvait donc abandonner Checkout et conserver un essai sans échéance, ou démarrer tardivement un nouveau délai relatif.

### Nouvelle source de vérité

La base ELSATIA est autoritaire pour la fenêtre d’essai :

- `abonnement_essai_debut` est fixé côté serveur à l’activation ;
- `abonnement_essai_fin` est fixé à la date de début + 30 jours ;
- une contrainte interdit une fin antérieure au début ou postérieure à 30 jours ;
- un trigger protège statut, dates, offre et identifiants Stripe contre les modifications directes d’un utilisateur tenant ;
- le webhook Stripe ne remplace plus la date d’essai autoritaire.

Checkout reçoit uniquement une date absolue existante quand Stripe l’accepte encore (au moins 48 heures dans le futur). Il ne recrée jamais une période relative de 30 jours. Un Checkout abandonné ne modifie donc pas l’échéance.

### Expiration et réactivation

À l’échéance sans abonnement actif, les protections existantes conduisent à l’écran d’abonnement suspendu. Cet écran permet désormais de choisir une offre standard lorsque l’entreprise ne possède pas encore de souscription Stripe ; la facturation est alors immédiate, sans recréer un essai. Si une souscription existe déjà, le portail Stripe reste le chemin de régularisation.

La validation automatique couvre la création des dates, l’absence de prolongation côté client, l’abandon de Checkout, la date absolue transmise à Stripe, le cas expiré et la reprise après expiration. Le cycle Stripe Test visuel complet reste une barrière avant paiement réel et relève de la validation Stripe élargie prévue après C6-B.

## 4. Pointage initial du dirigeant

### Cause

L’interface et la fonction d’activation existaient, mais la fonction exigeait déjà `saisir_son_pointage`, alors que cette permission individuelle devait précisément être activée par l’action. Le parcours était donc circulaire pour le premier dirigeant.

### Correction

L’onboarding propose explicitement **Configurer mon pointage**. Seul un utilisateur autorisé à gérer le pointage peut déclencher l’action. La fonction :

- active le pointage personnel de l’adhésion courante ;
- crée ou rattache uniquement la fiche salarié du compte Auth courant ;
- demeure idempotente ;
- refuse le proxy support et toute opération cross-tenant ;
- ne crée aucun salarié silencieusement pendant le bootstrap.

Un dirigeant purement administratif peut ne pas activer cette option et ne reçoit pas d’erreur SQL brute. Les tests couvrent aussi un salarié terrain et un chef d’équipe, ainsi que l’accès au chantier affecté via le planning.

## 5. Migration

Migration dédiée :

`supabase/migrations/20260816000204_c6b_corrections_premier_client.sql`

Application :

- Local : migration appliquée et testée ;
- Preview : migration `20260816000204` appliquée isolément ;
- `20260812000200` reste volontairement absente de Preview et n’a pas été appliquée ;
- Production : inchangée.

## 6. Tests et sécurité

Résultats obtenus avant le déploiement Preview :

- tests C6-B DB : 34 assertions réussies ;
- tests DB ciblés devis/isolation : 44 assertions réussies ;
- suite applicative : 60 fichiers, 311 tests réussis ;
- suite DB complète : 18 fichiers, 335 assertions réussies ;
- non-régression ADMIN-V1 / PROMO-V1 : réussie ;
- TypeScript : réussi ;
- lint : 0 erreur, 3 avertissements `<img>` préexistants ;
- build Production : réussi sous Next.js 16.2.12 ;
- validation des migrations : 198 migrations valides, identifiants uniques ;
- recherche de secrets : aucun secret reconnu dans 845 fichiers suivis.

Les tests de sécurité contrôlent `SELECT`, `INSERT`, `UPDATE`, `DELETE`, la séparation A/B, l’absence d’accès non rattaché, les permissions métier, la protection des dates d’essai et l’interdiction d’auto-promotion.

## 7. Parcours fictif

Le tenant fictif `Entreprise Test Onboarding C6B` est créé dans les tests isolés. Le scénario rejoue le bootstrap dirigeant, l’essai daté, le client, le devis et ses lignes, la réouverture, la facture, l’activation explicite du pointage, le salarié terrain, le chef d’équipe et la cohérence chantier/planning. Aucun tenant DEMO-18M ni aucune donnée réelle n’est utilisé comme seule preuve.

Le même cœur de parcours a été rejoué directement sur Supabase Preview dans une transaction annulée après contrôle : tenant neuf, absence de fiche salarié avant choix, essai de 30 jours, client, devis modifié et rouvert, facture avec une ligne et total identique à 270 € TTC, chantier, activation du dirigeant, arrivée/départ de pointage, note de frais fictive et refus lecture/écriture cross-tenant. Le rollback final ne laisse aucune donnée de test persistante.

La nouvelle URL Vercel Preview a également été ouverte et a rendu correctement les routes publiques de l’application. La création interactive d’un compte fictif n’a pas été finalisée dans le navigateur afin de ne pas saisir de nouveau mot de passe sans validation humaine. Cette limite ne remet pas en cause les preuves RLS/DB Preview, mais le cycle Stripe Test visuel complet demeure une barrière distincte avant paiement réel.

## 8. Points reportés

Restent hors C6-B :

- validation complète Stripe Test (webhook, portail, échec/reprise, facture et résiliation) puis Stripe Live après IBAN professionnel ;
- migration Production de TARIFS-V2 / ADMIN-V1 / PROMO-V1 / C6-B après autorisation dédiée ;
- décisions documentaires, juridiques et communications d’onboarding de C6-C/C6-D ;
- contrôles complets mobile, planning, rentabilité et note de frais au-delà des non-régressions ciblées.
