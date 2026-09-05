# Audit log opérateur — état des lieux et carte des journaux

Évaluation de la traçabilité disponible avant commercialisation. Ce document **ne propose aucune nouvelle architecture** : il inventorie ce qui existe, dit ce que ça couvre, et nomme ce qui manque.

---

## Verdict : **PARTIEL**

| Domaine | Couverture | Verdict |
|---|---|---|
| Mutations plateforme (support, facturation, entreprise, multi-app) | `historique_mutations_plateforme` — avant/après, auteur, date | **Suffisant** |
| Rôles plateforme, remises, snapshots de facturation | `plateforme_journal_actions` | **Suffisant** |
| Réinitialisations de mot de passe déclenchées par la plateforme | `plateforme_reinitialisations_mot_de_passe` — motif obligatoire | **Suffisant** |
| Cycle de vie des abonnements Stripe | `abonnement_evenements` (**succès uniquement**) | **Partiel** |
| Opérations de capacité Stripe | `operations_capacite_stripe` — statuts, tentatives, erreur courte | **Suffisant** |
| Opérations de remise Stripe | `plateforme_operations_remise` + historique append-only | **Partiel** — non lisible depuis l'application |
| Modules et capacité personnes | `historique_modules_entreprises`, `historique_capacite_personnes` | **Suffisant** |
| Tarification | `historique_tarification` | **Suffisant** |
| Activité métier des entreprises clientes | `journal_activite`, `journal_audit_paie` | **Suffisant** (périmètre client) |
| **Authentification** (connexions, échecs, changements MFA) | Aucune table applicative — Supabase Auth uniquement | **Insuffisant côté application** |
| **Consultations** (qui a lu quoi) | Journalisées uniquement pour le support ciblé | **Partiel, par conception** |

## Carte des journaux

| Table | Alimentée par | Lisible par | Contenu |
|---|---|---|---|
| `plateforme_journal_actions` | `plateforme_journaliser()` (SECURITY DEFINER) | Permission `gerer_equipe` | acteur (id + e-mail), action, cible, détails JSON. **Ni secret, ni payload métier.** |
| `historique_mutations_plateforme` | RPC plateforme | Administrateur plateforme | domaine, action, objet, auteur, `ancien`/`nouveau`, nombre de lignes |
| `plateforme_reinitialisations_mot_de_passe` | `plateforme_verifier_et_journaliser_reinitialisation()` | Administrateur plateforme | entreprise, utilisateur, e-mail, **motif ≥ 5 caractères**, demandeur |
| `abonnement_evenements` | RPC de service du webhook | Administrateur plateforme | `stripe_event_id`, type, statut résultant, payload **borné** (livemode, object/customer/subscription) |
| `operations_capacite_stripe` | RPC `SECURITY DEFINER` | Administrateur plateforme + gestionnaire de l'entreprise | type, statuts, tentatives, `erreur_courte`, `stripe_etat_observe` (résumé, **jamais de secret**) |
| `plateforme_operations_remise` (+ `_historique`) | RPC plateforme rôle + AAL2 | **RPC uniquement** — aucun accès table | intention, états observés, empreinte d'erreur, tentatives |
| `historique_modules_entreprises`, `historique_capacite_personnes`, `historique_tarification` | RPC métier | Administrateur plateforme | avant/après des droits, capacités et tarifs |

## Trous identifiés

1. **Les échecs de webhook Stripe ne laissent aucune trace en base.** Un évènement dont le traitement échoue est retiré du journal pour rester rejouable. Les échecs ne sont visibles que dans les logs serveur (message `Webhook abonnement non traité` + catégorie) et dans le tableau de bord Stripe. Voir `docs/operations/DIAGNOSTIC_STRIPE_WEBHOOKS_V1.md` §3.

2. **Aucun journal d'authentification applicatif** : connexions, échecs répétés, enrôlement/retrait MFA ne sont pas consignés dans une table `public`. Ces évènements existent côté Supabase Auth et ne sont consultables que depuis sa console.

3. **Les opérations de remise ne sont pas consultables depuis l'application** : la table n'est lisible que par RPC, et aucune RPC de listage n'existe. Contrat proposé dans `DIAGNOSTIC_STRIPE_WEBHOOKS_V1.md` §8.

4. **Pas de vue unifiée** : les journaux sont corrects mais dispersés sur sept tables. Une investigation croisée se fait aujourd'hui table par table.

5. **Aucune politique de rétention définie** pour ces journaux. **À CONFIRMER** avant commercialisation, en cohérence avec `docs/juridique/politique-confidentialite.md`.

## Position retenue pour ce lot

Un journal d'audit transverse unique (table unifiée + collecte systématique + écran de recherche) est une **architecture lourde**, avec un impact ACL et RLS sur l'ensemble du socle. Il n'est **pas** construit ici.

Ce qui est fait à la place :

- la présente carte des journaux, pour qu'une investigation sache où regarder ;
- une **vue opérateur de lecture** consolidant les sources déjà lisibles pour le domaine le plus critique en phase de lancement — Stripe et abonnements — sur `/plateforme/stripe` ;
- les procédures support (`SUPPORT_PERTE_ACCES_V1.md`, `SUPPORT_SUPPRESSION_RGPD_V1.md`) qui imposent une traçabilité **dans le ticket** pour tout ce que l'application ne trace pas d'elle-même.

Les trous 1 à 5 restent ouverts et documentés. Aucun n'est bloquant pour un premier client payant, à condition que les procédures support soient réellement appliquées.

## Règles à tenir

- Ne jamais écrire de secret (clé Stripe, secret webhook, jeton, mot de passe, code MFA) dans un journal, ni dans un ticket.
- Ne jamais journaliser une adresse e-mail de destinataire dans les logs applicatifs d'envoi (règle déjà appliquée dans `src/lib/brevo.ts` et `src/lib/abonnement-notifications.ts`).
- Les journaux sont en lecture seule : aucune correction a posteriori.
