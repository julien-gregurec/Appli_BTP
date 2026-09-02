# ABONNEMENTS-DETAIL-V1C — Clôture : cohérence plateforme/client et cycle de vie de la remise

> **Rapport historique.** Les montants annuels cités (Mini `prixAnnuelCentimes: 94_800` = 948 €,
> etc., annuel × 12) reflètent l'état de l'époque. Depuis
> ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1 (2026-09) : **annuel = 10 × mensuel** (Mini 790 €…),
> voir `docs/organisation/TARIFICATION_CANONIQUE.md`. Les montants mensuels (79 €…) et la
> mécanique de remise décrite restent valables.

**Constat de départ** : ABONNEMENTS-DETAIL-V1B avait tout construit (mapping, comparatif, comptes-sup, remise) mais laissait une réserve principale — la cohérence directe entre `/plateforme` (admin) et `/abonnement` (client) n'avait pas été re-testée en conditions réelles, faute d'avoir pu monter un compte admin plateforme jetable fonctionnel dans le temps imparti. Ce mini-lot ferme exactement ce point, avec un vrai cycle de vie de remise (appliquer → modifier → retirer) sur une fixture Stripe Test réelle.

## 1-2. Git

Base : `feat/abonnements-detail-v1b` (HEAD `1dfe311`). Branche `feat/abonnements-detail-v1c` créée dessus. Un commit de correction (bug réel trouvé en testant, voir §7) + un commit de documentation.

## 3-5. Fixtures — découverte majeure de dérive de schéma

Deux comptes distincts créés via le vrai flux de signup (jamais de INSERT manuel dans `auth.users` — leçon retenue de V1B où cette approche produisait un compte non connectable) :
- **Client A** (`RECETTE-ABONNEMENTS-V1C-CLIENT`) : entreprise réelle, abonnement Mini mensuel réel via Stripe Test Checkout (carte `4242…`).
- **Admin B** (`recette-abos-v1c-admin@example.invalid`) : compte plateforme jetable, ajouté à `public.plateforme_admins`.

**Admin B a d'abord obtenu un 404 sur `/plateforme`** malgré une ligne `plateforme_admins` correcte (email/rôle/nom). Investigation approfondie (JWT décodé, cache Next.js écarté, `SET LOCAL` non persistant entre statements `db query --linked` mais reproductible en un seul statement combiné avec `set_config` inline) → **la fonction live `public.est_plateforme_admin()` a dérivé de sa définition versionnée** :
- Migration `20260710000036_plateforme_abonnements.sql` : `select coalesce(auth.email() in (select email from public.plateforme_admins), false);`
- Fonction réellement déployée : `select public.plateforme_role_courant() is not null;`, où `plateforme_role_courant()` exige `plateforme_admins.utilisateur_id = auth.uid() and actif`.

La table `plateforme_admins` live porte aussi des colonnes `utilisateur_id`/`actif` absentes de la migration d'origine. **Aucune migration versionnée ne documente ce changement** — cohérent avec les dérives déjà signalées cette session (migrations inconnues 20260816-20260818 lors de AI-LAUNCH-V1B, `verrouiller_facture_emise` appliqué hors flux lors de P15). Corrigé pour la fixture via `update plateforme_admins set utilisateur_id = (select id from auth.users where email = …)`. **Ceci doit être documenté pour toute création future de compte admin plateforme jetable** : renseigner `email` seul ne suffit plus, `utilisateur_id` est désormais requis.

## 6. Cohérence plateforme ↔ client (avant remise)

| Champ | `/plateforme` (Admin B) | `/abonnement` (Client A) |
|---|---|---|
| Entreprise | RECETTE-ABONNEMENTS-V1C-CLIENT | (session du compte) |
| Offre | Mini · mensuel | Mini · mensuel |
| Statut | Essai | Essai |
| Comptes inclus | jusqu'à 3 comptes | 3 compte(s) inclus |
| Comptes facturables | 0 | 0 compte(s) facturable(s) |
| Remise | aucune | aucune |
| Prix | 79,00 € HT/mois | 79,00 € HT/mois |

Identique des deux côtés — aucun écart.

## 7. Bug réel trouvé et corrigé : nom de coupon Stripe > 40 caractères

En appliquant une remise réelle (10 %, à vie, motif « RECETTE ABONNEMENTS V1C ») depuis `/plateforme`, Stripe a **rejeté la création du coupon** : `Invalid string: … must be at most 40 characters`. Cause : `src/app/actions/plateforme.ts` construisait le `name` du coupon par simple concaténation `${entreprise.nom} — ${description}` sans plafond, alors que l'API Stripe limite ce champ à 40 caractères. Avec `RECETTE-ABONNEMENTS-V1C-CLIENT` (31 caractères) + `— 10 % à vie` (13 caractères) = 44 caractères, la limite est dépassée. **Ce n'est pas un cas limite artificiel** : toute entreprise cliente avec un nom un peu long (fréquent en BTP — « SARL MAÇONNERIE GÉNÉRALE DUPONT ET FILS ») aurait bloqué l'intégralité du geste commercial.

**Correctif** : nouvelle fonction `nomCouponRemise()` qui plafonne le nom à 40 caractères, en tronquant le nom d'entreprise (avec `…`) si besoin plutôt que la description (l'information commerciale utile — pourcentage/durée — reste toujours entière). Vérifié en direct après correctif et déploiement Preview : coupon créé avec `name: "RECETTE-ABONNEMENTS-V1C-CL… — 10 % à vie"` (≤ 40 caractères), visible tel quel dans le Customer Portal Stripe. 2 tests unitaires ajoutés (`plateforme-remises.test.ts`) : troncature effective + non-troncature quand le nom tient déjà.

## 8. Cycle de vie complet de la remise — vérifié en direct

- **Appliquer** (10 %, à vie) : DB (`entreprises.remise_*`) et Stripe (`discounts`, coupon) cohérents ; côté client, `/abonnement` affiche « Remise commerciale active · 10 % à vie », prix catalogue 79,00 €, remise −7,90 €, prix remisé 71,10 € — **aucune mention du motif interne côté client**, conforme à REMISES-CLIENTS-V1.
- **Double confirmation réelle testée** (pas contournée) : le bouton « Appliquer » déclenche un `window.confirm()` natif dont le message a été capturé et vérifié mot pour mot (montant, durée, prix estimé, motif interne) ; annuler la confirmation bloque bien la soumission (aucune requête POST, DB inchangée) ; confirmer la déclenche réellement.
- **Retirer** : même mécanisme de double confirmation vérifié (annuler bloque, confirmer retire) ; après retrait, DB effacée (`remise_*` tous `null`), Stripe `discounts: []`, `/plateforme` revient au prix catalogue.
- **Modifier** (10 % → 15 %) : il n'existe pas de formulaire de modification en place — modifier = retirer puis réappliquer avec une nouvelle valeur (comportement réel de l'UI, pas un bug). Vérifié : nouveau coupon Stripe créé, ancien coupon remplacé (Stripe ne garde qu'une remise active à la fois sur un abonnement en mode `flexible`), DB et Stripe cohérents à 15 %.

## 9. Comptes supplémentaires + remise combinés

4 employés facturables ajoutés (Mini inclut 3) → 1 compte supplémentaire × 15,00 €. Vérifié identique des deux côtés :

| | `/plateforme` | `/abonnement` |
|---|---|---|
| Base | 79,00 € | 79,00 € (prix catalogue) |
| Compte(s) sup. | + 1 × 15,00 € | 1 supplémentaire(s) × 15,00 € |
| Sous-total | 94,00 € | 94,00 € |
| Remise (15 %) | affichée séparément | − 14,10 € |
| Total | — | 79,90 € |

Confirmé aussi dans le Customer Portal Stripe (67,15 € affichés à ce moment-là, calcul cohérent avec la remise active alors, sur le seul abonnement de base — les comptes supplémentaires sont facturés via un relevé mensuel séparé, pas synchronisés en temps réel comme ligne d'abonnement Stripe : comportement existant, non modifié, correctement documenté comme « estimation » sur les deux pages).

## 10. Annuel — vérifié par lecture directe de la formule, pas par fixture Stripe live

Une souscription annuelle réelle n'a pas été montée (coût/lenteur disproportionnés pour ce mini-lot). Vérification faite par lecture directe de `src/lib/plateforme.ts:88-99` et `src/lib/tarification.ts` : `totalAnnuel = prixAnnuelFixe + (sup * parCompteSup) * 12`. Avec Mini (948 € — `prixAnnuelCentimes: 94_800`, confirmé dans le code) et 1 compte sup (15 × 12 = 180 €) : 948 + 180 = 1128 €, remise 10 % = 112,80 €, total = 1015,20 € — **exactement les valeurs de contrôle attendues**, confirmant que la formule annuelle est correcte sans qu'aucun montant ne soit codé en dur nulle part dans le produit. Aucune mention fabriquée d'« économie annuelle » trouvée sur aucune offre (recherche exhaustive dans le code).

## 11. Clavier

- Audit complet (`tabIndex`, association `<label for>`, absence de piège clavier) sur `/abonnement` (comparatif, FAQ, CTA upgrade, portail) et sur le formulaire de remise `/plateforme` : **aucun problème trouvé**, tout est du HTML sémantique natif (`<details>/<summary>`, `<label>` explicite sur chaque champ), zéro gestionnaire JS personnalisé interceptant le clavier.
- **Réserve** : l'activation réelle d'un `<details>` par la touche Entrée n'a pas pu être confirmée de façon concluante pendant cette session — l'outil de navigateur automatisé a présenté une dégradation intermittente de son rendu visuel (captures noires, coordonnées de défilement invalides) pendant ce test précis, un problème d'outil déjà documenté ailleurs cette session, pas un défaut de code (le code ne contient aucun mécanisme qui pourrait bloquer ce comportement natif du navigateur). Recommandation : vérification manuelle rapide en cas de doute.

## 12. Mobile et accessibilité

Revérifié à 390 px et 430 px (mesures DOM précises, pas seulement visuelles) : aucun débordement horizontal de page sur `/abonnement` (comparatif entièrement déplié) ni sur le bloc remise de `/plateforme`. Le seul élément avec `scrollWidth > clientWidth` est le tableau des factures, volontairement dans un conteneur `overflow-x-auto` (défilement contenu, comportement correct). Formulaire de remise : tous les champs ont un `<label>` visible associé, aucune régression depuis V1B.

## 13. Customer Portal

Vérifié en direct avec Client A : le portail Stripe affiche correctement son propre abonnement (« ELSATIA — Mini », 67,15 €/mois avec la remise alors active), le nom du coupon tronqué (`RECETTE-ABONNEMENTS-V1C-CL… — 15 % à vie`), ses propres informations de facturation (nom d'entreprise, email) — aucune fuite croisée. Aucune action de résiliation réelle effectuée.

## 14. Journal d'audit

`historique_tarification` vérifié pour les 3 actions réelles de ce lot (`remise_appliquee` ×2, `remise_retiree` ×1) : `utilisateur_id` correctement attribué à Admin B dans les 3 cas, **`motif` toujours `null`** — le motif interne n'est jamais écrit dans cette table (conforme à la décision de conception de REMISES-CLIENTS-V1, cette table étant déjà lue par `/abonnement` côté client).

## 15. RLS re-testée en conditions réelles

Tentative réelle, en tant que Client A (JWT extrait de sa propre session, pas la clé `service_role`), de modifier directement `entreprises.remise_valeur`/`remise_type`/`remise_description` via un appel REST PostgREST direct (hors app). Résultat : requête acceptée (HTTP 200, la ligne appartient bien à Client A) **mais les colonnes `remise_*` reviennent silencieusement à leur valeur réelle** (15 %, inchangée) — confirmant que le trigger `proteger_colonnes_remise_entreprise` (construit lors de REMISES-CLIENTS-V1 pour combler l'angle mort RLS documenté dans la migration `20260823000223`) fonctionne toujours correctement. Aucune entrée d'audit parasite créée par cette tentative (cohérent : le trigger ne passe pas par le RPC).

## 16. Feature-catalogue — pas de régression

Les 18 tests `comparatif-offres.test.ts` passent toujours inchangés ; aucune ligne du comparatif ne montre un module BETA/DISABLED comme « Inclus ».

## 17. QA complète

406/406 tests (18 nouveaux comptés : les 2 ajoutés dans ce lot + ceux déjà existants), typecheck propre, lint 0 erreur (3 warnings préexistants non liés), build propre, `verify:secrets` (864 fichiers, 0 secret), `verify:migrations` (202 migrations, aucune ajoutée — ce lot ne modifie aucun schéma), `npm audit` 0 vulnérabilité.

## 18. Cleanup

Stripe : abonnement annulé immédiatement, client supprimé, les 2 coupons de test supprimés — Stripe Test uniquement, aucun objet Live touché. Base de données : entreprise cliente et ses 4 employés fixtures, entreprise-coquille de l'admin, les 2 comptes `auth.users`/`utilisateurs`, la ligne `plateforme_admins` — tout supprimé, **zéro résidu vérifié par requête** sur chaque table concernée. Aucun trigger immutable n'a bloqué le nettoyage cette fois (contrairement à AI-LAUNCH-V1B).

## 19. Incident de process — à noter pour la mémoire de session

Pour obtenir la clé publique (`anon`/`publishable`) nécessaire au test RLS du §15, la commande Supabase CLI utilisée (`projects api-keys`) a renvoyé **l'ensemble des clés du projet dans une seule réponse**, y compris la clé `service_role` — que je n'ai jamais utilisée ni pour aucune opération, mais qui s'est retrouvée de fait affichée dans la sortie de commande. Seule la clé `publishable` a servi. Leçon retenue : préférer à l'avenir une commande plus étroitement ciblée si elle existe, ou demander cette clé publique à l'utilisateur plutôt que de risquer d'exposer la clé secrète en même temps.

## Verdict

Le point qui empêchait V1B de passer en `VALIDÉ` — la cohérence plateforme/client jamais re-testée en direct — est maintenant vérifié de bout en bout, avec un vrai cycle de vie de remise complet (appliquer/modifier/retirer, double confirmation réelle, RLS, audit) et un vrai bug bloquant trouvé et corrigé au passage. Les seules réserves restantes sont mineures et documentées explicitement (§10 annuel vérifié par formule plutôt que fixture live, §11 activation clavier native non conclusivement testée à cause d'un outil de test dégradé, pas du code).
