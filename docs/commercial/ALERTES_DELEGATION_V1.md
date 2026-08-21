# ALERTES-DELEGATION-V1 — Délégation d'une alerte opérationnelle

Statut : **implémenté et validé sur Preview**. Non déployé en Production — arrêt volontaire dans l'attente d'une autorisation explicite (voir §12).

## 1. Architecture

Les alertes du Centre d'alertes opérationnelles (`src/components/CentreAlertesOperationnelles.tsx`, source dans `src/app/(app)/dashboard/page.tsx`) sont **calculées à la volée à chaque rendu** (échéances factures/devis, seuils de stock, entretiens flotte/outillage...), jamais persistées telles quelles. Un mécanisme existait déjà pour « ignorer » une alerte via une table à clé métier (`alertes_operationnelles_ignorees`, clé `(entreprise_id, utilisateur_id, alerte_cle)`).

La délégation reprend exactement ce principe : une nouvelle table `alertes_operationnelles_delegations` (clé `(entreprise_id, alerte_cle)`), qui ne duplique pas l'alerte mais n'en garde qu'un instantané d'affichage (titre, domaine, lien, niveau) au moment de la délégation.

## 2. Modèle de données

Migration : `supabase/migrations/20260821000220_alertes_delegation_v1.sql`.

```
alertes_operationnelles_delegations
  id, entreprise_id, alerte_cle, alerte_domaine, alerte_titre, alerte_href, alerte_niveau,
  employe_id, delegue_par_user_id, delegue_at, commentaire
  unique (entreprise_id, alerte_cle)
```

Une seule délégation active par alerte (contrainte unique). Une nouvelle délégation sur la même alerte est un **upsert** : c'est la réassignation, pas un doublon.

## 3. Permissions

Aucun nouveau droit créé — les domaines d'alertes délégables sont reliés aux droits de gestion **déjà existants** dans le catalogue de permissions :

| Domaine d'alerte | Droit requis (déjà existant) |
|---|---|
| Facturation | `gerer_factures` |
| Commercial (devis) | `gerer_devis` |
| Stock | `gerer_stock` |
| Flotte | `gerer_flotte` |
| Outillage | `gerer_outillage` |
| Achats | `gerer_achats` |

Un domaine non listé ne peut pas être délégué (refusé par défaut, pas autorisé par erreur). Terrain n'a jamais ces droits de gestion : le bouton ne lui est jamais proposé, et une tentative directe côté serveur serait refusée de toute façon.

**Le contrôle réel est entièrement côté serveur**, dans la fonction `deleguer_alerte_operationnelle` (`security definer`) :
1. `est_membre_actif(p_entreprise_id)` — le délégateur doit être membre actif de l'entreprise indiquée (empêche de spoofer une autre entreprise).
2. Le domaine doit être connu et relié à un droit de gestion.
3. `a_permission(p_entreprise_id, droit_du_domaine)` — le délégateur doit avoir ce droit.
4. L'employé destinataire doit exister, appartenir à la même entreprise, être `actif`, et avoir un compte applicatif (`utilisateur_id` non nul).
5. Le destinataire doit lui-même avoir le droit de gestion du domaine (il ne reçoit jamais plus de droits qu'il n'en a déjà — voir §7).

Le masquage du bouton côté client (`domainesAutorisesDelegation`, calculé dans `dashboard/page.tsx`) n'est qu'un confort d'affichage — il n'a aucune valeur de sécurité, puisque toute la logique ci-dessus est revérifiée indépendamment côté serveur.

## 4. UX

Sur chaque carte d'alerte délégable : `Ouvrir et traiter | Déléguer | Ignorer`. Au clic sur Déléguer, une modal s'ouvre (pas de nouvelle page) : titre de l'alerte, sélection d'un employé (liste déjà filtrée aux employés ayant le droit requis), commentaire facultatif, `Annuler` / `Déléguer`.

Si l'alerte est déjà déléguée, le bouton devient **Réassigner** et pré-remplit l'employé actuel ; la carte affiche discrètement `Déléguée à : Prénom Nom · par Délégateur · date/heure`. Aucune réassignation silencieuse : elle passe par la même modal explicite.

Si aucun employé n'est délégable pour ce domaine, la modal affiche un message clair (« Aucun employé disponible... ») plutôt qu'une erreur technique, et désactive le bouton Déléguer.

## 5. Filtres (vue employé)

Un filtre `Toutes / Mes alertes / Déléguées par moi` apparaît sur le Centre d'alertes dès qu'au moins une délégation existe (pas de filtre vide et inutile sinon). Il s'appuie sur les données déjà chargées pour l'affichage — aucune page ni requête supplémentaire.

## 6. Notifications

Aucun nouveau canal créé. Une délégation insère une ligne dans `notifications_utilisateurs`, le centre de notifications déjà existant dans l'application (déjà utilisé pour congés, pointage, etc.), visible immédiatement dans « Mes notifications » sur le dashboard du destinataire. Aucun envoi Brevo/push spécifique à ce lot.

## 7. Droits sur la ressource finale

Recevoir une alerte déléguée ne donne **aucun droit supplémentaire**. Le destinataire doit déjà avoir le droit de gestion du domaine concerné pour être délégable (§3, point 5) — la fonction SQL refuse la délégation vers un employé incapable d'agir sur la ressource, plutôt que de créer une UX incohérente (alerte visible mais impossible à traiter réellement).

## 8. Ignorer / Ouvrir et traiter

Inchangés. Une alerte déléguée n'est jamais ignorée automatiquement — `Ignorer` reste une action indépendante, disponible en toutes circonstances. `Ouvrir et traiter` continue de pointer vers les URLs existantes, jamais modifiées.

## 9. Historique

Aucune table d'audit dédiée créée : comme `alertes_operationnelles_ignorees`, la table ne garde que l'état courant (une réassignation écrase l'ancienne ligne). Une infrastructure d'audit générique n'existait pas déjà pour ce type d'objet ; en créer une disproportionnée pour ce lot n'était pas justifié.

## 10. Tests

- `src/lib/alertes-delegation.test.ts` : mapping domaine → permission (Vitest).
- `supabase/tests/alertes_operationnelles_delegations.test.sql` : 22 assertions pgTAP, exécutées réellement (pas seulement des vérifications de privilèges) — délégation valide, notification créée, destinataire sans droit refusé, mauvais tenant refusé, employé cross-tenant refusé, délégateur sans droit refusé, idempotence, réassignation, employé inactif refusé, employé sans compte applicatif refusé, isolation RLS en lecture (A ne voit jamais une délégation B, B voit la sienne), écriture directe bloquée par RLS malgré le grant table-level hérité du bootstrap Supabase (vérifié par tentative réelle d'insertion, pas par le grant lui-même — `authenticated` a un grant large sur toutes les tables comme le reste du schéma, RLS est la vraie protection).

**Limite connue** : le stack Supabase local (Docker) était indisponible pendant ce lot (conteneurs `analytics`/`vector`/`storage` unhealthy au démarrage, problème d'environnement sans rapport avec ce code). Les 22 assertions ont été exécutées directement sur Preview (fixture incluse manuellement, transaction annulée par `rollback`, aucune trace laissée) plutôt que via `npm run test:db`. Le fichier `.test.sql` est écrit dans le format standard du dépôt et s'exécutera normalement via `npm run test:db` une fois l'environnement Docker local réparé.

## 11. Validation Preview (réelle, pas simulée)

Entreprise de test dédiée créée via le vrai parcours `/signup` → `/onboarding` (email confirmé par SQL, `julien.gregurec+alertes-v1-test@gmail.com`, jamais le compte réel de Julien). Une facture réelle en retard de paiement a été créée pour produire une vraie alerte « Facturation » (pas une donnée fabriquée pour les besoins du test).

Vérifié en conditions réelles sur `elsatia-preview` :
- Le bouton `Déléguer` apparaît entre `Ouvrir et traiter` et `Ignorer`, dans cet ordre exact.
- La modal s'ouvre, la liste ne propose que les employés ayant le droit requis.
- La délégation réussit : la carte affiche `Déléguée à : Test Delegation · par Test Delegation · 21 août, 23:28`, le bouton devient `Réassigner`.
- Une notification réelle apparaît dans « Mes notifications » avec le commentaire saisi.
- Le filtre `Toutes / Mes alertes / Déléguées par moi` apparaît et fonctionne.
- La modal de réassignation pré-remplit l'employé actuel.
- Mobile 390 px et tablette 768 px : aucun débordement horizontal, les trois boutons restent utilisables, la modal tient dans l'écran.
- Accessibilité : le champ employé reçoit le focus à l'ouverture ; `Escape` ferme la modal sans effet de bord.

**Portée volontairement réduite** : la délégation a été testée via un auto-délégation (le même compte comme délégateur et destinataire) plutôt qu'avec un second compte réel distinct, pour éviter un second cycle complet de création de compte — ce choix ne change rien au comportement de l'interface (identique quel que soit le destinataire) et la correction des permissions destinataire est déjà prouvée exhaustivement par les 22 scénarios pgTAP (§10), qui couvrent notamment le cas d'un destinataire différent, sans droit, ou d'un autre tenant.

## 12. Nettoyage et résidu assumé

Nettoyés : la ligne de délégation et la notification de test (suppression directe, aucune contrainte ne les protège).

**Résidu assumé, non contournable** : l'entreprise de test `TEST ALERTES DELEGATION V1` (`ENT-009`), son client, son chantier, son employé et sa facture de test restent en base sur Preview. La facture a été créée avec le statut `envoyee` pour produire une alerte réelle ; un déclencheur d'intégrité existant (`verrouiller_facture_emise`, antérieur à ce lot) interdit qu'une facture émise soit supprimée ou repasse en brouillon — exactement le même type de garde-fou que `journal_audit_immuable` rencontré lors de la recette V1E. Ce déclencheur n'a pas été contourné ni désactivé. L'entreprise est sans ambiguïté labellisée comme test (nom, aucune donnée réelle) et n'affecte aucune entreprise réelle. Sa suppression complète nécessiterait de passer par le parcours métier normal de correction d'une facture (avoir) ou un accès privilégié dédié — hors périmètre de ce lot.

## 13. Ce que ce lot n'a pas fait

- Aucune activation Stripe Live, aucun KYC.
- Aucune modification du compte bancaire, des tarifs, des offres, d'Auth ou de Supabase en dehors de la migration décrite ici.
- Aucun nouveau droit de permission créé.
- Aucune modification du site vitrine.
- Aucune nouvelle fonctionnalité au-delà de la délégation elle-même.
- **Aucun déploiement Production.**

## 14. Recommandation avant Production

Le lot est prêt techniquement (QA verte, 22 scénarios serveur validés en conditions réelles sur Preview, UX vérifiée desktop/mobile/tablette). Avant toute autorisation Production :
1. Réparer l'environnement Docker local et faire tourner `npm run test:db` pour confirmer le fichier pgTAP dans le harnais standard (actuellement validé par exécution directe équivalente sur Preview, pas par le runner officiel).
2. Décider si le résidu de test sur Preview (§12) doit être traité avant ou après la mise en Production (il n'affecte pas Production, qui n'a pas cette entreprise).
3. Autorisation explicite de Julien pour le déploiement Production.
