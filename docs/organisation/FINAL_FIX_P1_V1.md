# FINAL-FIX-P1-V1 — Correction des P1 issus du FINAL-AUDIT-V1

Date : 22-08-2026. Baseline auditée : `release/commercialisation-v1` HEAD `fc61bd8` (`FINAL_AUDIT_PRE_PUBLICATION.md`, commit `a1354de`). Périmètre strictement limité aux 5 P1 identifiés — aucune nouvelle fonctionnalité, aucun élément roadmap traité.

## P1-1 — Erreurs brutes utilisateur sur le CORE

17 fichiers d'actions CORE routaient une erreur Supabase/Postgres brute (`error.message`/`error?.message`/`err.message`) directement vers l'utilisateur au lieu de passer par `messageErreurUtilisateur` déjà existant :

`besoins.ts` (onboarding), `employes.ts`, `commandes.ts`, `notes-frais.ts`, `import.ts` (4 occurrences), `inventaires.ts`, `flotte.ts`, `prestations.ts`, `messagerie.ts` (2), `push.ts` (3), `support.ts` (2), `suivi-acces.ts`, `devis.ts`, `comptesRendus.ts` (2), `documents.ts`, `rentabilite.ts`.

**Correction** : chaque occurrence remplacée par un appel à `messageErreurUtilisateur(nomAction, erreur, repli)`, avec un message de repli spécifique au contexte métier. Les fichiers utilisant l'IA (documents/rentabilite/comptesRendus/devis/messagerie) conservent le message brut dans une variable locale pour le seul usage du log applicatif (`journaliserAppelIA`), jamais renvoyée à l'utilisateur.

**Tests ajoutés** : `src/lib/erreurs-brutes-core.test.ts` — garde-fou statique qui échoue si l'un de ces 17 fichiers perd l'import de `messageErreurUtilisateur` ou si le motif `error.message` réapparaît dans un `return`/`redirect`. Distingue correctement la capture légitime pour les logs de la fuite réelle vers l'utilisateur (vérifié par test négatif/positif du motif).

## P1-2 — Divergence tarif Entreprise 40/50

**Investigation** (aucune valeur choisie arbitrairement) : `comptesInclus: 50` est la valeur réellement appliquée par le moteur de facturation (`src/lib/plateforme.ts:81`, `src/lib/stripe-abonnement.ts:309` — calcul des comptes en dépassement facturables). Le texte « 40 salariés + 10 administrateurs » n'était pas une valeur concurrente : 40 + 10 = 50, c'est une décomposition de la même valeur — mais affichée différemment de la même offre sur la même page (carte : décomposition ; tableau comparatif juste en dessous : total brut `comptesInclus`).

**Décision** : harmoniser sur le champ source (`comptesInclus`), en conservant le détail utile (`administrateursInclus`) — sans jamais inventer de nouveau nombre ni toucher à un prix.

**Correction** :
- `src/lib/tarification.ts` — `resume` de l'offre Entreprise : « 40 collaborateurs et 10 administrateurs... » → « 50 comptes inclus, dont 10 administrateurs... ».
- `src/app/tarifs/page.tsx` — le cas spécial codé en dur pour `entreprise` est supprimé ; toutes les offres affichent désormais `${comptesInclus} comptes inclus (dont ${administrateursInclus} administrateurs)` quand ce dernier champ existe.

Vérifié réel sur Preview après déploiement : carte et tableau affichent désormais tous les deux « 50 comptes inclus (dont 10 administrateurs) ». Montants HT/mois/HT/an inchangés (79/249/449/599/699).

## P1-3 — Code mort / motifs anon vestigiaux

**Classification des 18 fonctions** signalées par FINAL-AUDIT-V1 :
- **B — vestigial, déjà inerte, non touché** (2) : `definir_code_stock_employe`, `enregistrer_mouvement_stock_borne` — déjà révoquées de tous les rôles depuis `20260714000074`, aucun grant EXECUTE pour personne.
- **C — vestigial mais avec grant potentiellement réactivable, nettoyé** (16) : `affecter_vehicule`, `changer_statut_commande`, `creer_code_identification`, `creer_commande_fournisseur`, `creer_inventaire_stock`, `enregistrer_comptage_inventaire`, `enregistrer_mouvement_outillage`, `enregistrer_reception_commande`, `est_employe_du_compte`, `importer_articles_stock`, `lier_justificatif_depense`, `marquer_invitation_employe`, `materialiser_charge_recurrente`, `mettre_outil_rebut`, `peut_consulter_chantier`, `peut_gerer_acces`.

**Nettoyage** (migration `20260822000221_nettoyage_motif_anon_vestigial.sql`) : retire le motif `auth.role() is distinct from 'anon' and ...` / `auth.role()='anon' or ...` de ces 16 fonctions, chacune conservant un comportement strictement identique pour tout appelant authentifié légitime.

**Découverte en cours de correction** : `creer_code_identification` a un motif légèrement différent (`auth.uid() is not null and auth.role() is distinct from 'anon' and not (...)`), nécessaire car cette fonction est aussi appelée par le trigger `trg_creer_code_identification` lors de l'insertion d'un véhicule/chantier/outil/employé — y compris hors contexte interactif (migrations, scripts de seed exécutés sans session utilisateur, où `auth.uid()` est naturellement absent). Ce garde-fou a été conservé, seule la mention explicite d'« anon » a été retirée (redondante : en session Supabase réelle, `auth.uid()` est toujours nul pour une requête anon, donc `auth.uid() is not null` couvrait déjà anon implicitement).

**Découverte annexe, non corrigée (hors périmètre)** : `scripts/seed-demo-history.mjs` appelle plusieurs de ces RPC (`creer_inventaire_stock`, `enregistrer_comptage_inventaire`, `enregistrer_mouvement_outillage`, `creer_commande_fournisseur`, `changer_statut_commande`) avec la clé Publishable **sans authentification préalable** — il s'appuyait donc directement sur le contournement anon retiré ici pour fonctionner. Ce script n'est référencé nulle part ailleurs dans le dépôt (ni `package.json`, ni documentation) ; le compte démo actuel (`Atelier Bâtiment Lyonnais`, `DEMO-18M`) est produit par un mécanisme différent et plus récent (`creer_entreprise_demo_18_mois.sql`, lot P11). Ce script est très probablement mort — non modifié, à faire confirmer/retirer par Julien dans un lot dédié si souhaité.

**Tests** :
- Fonctionnels réels sur Preview : `peut_gerer_acces` (Admin A autorisé, Ouvrier A refusé), `est_employe_du_compte` (reconnaissance correcte), `affecter_vehicule` (refus sans droit).
- Cross-tenant réels sur Preview : `peut_gerer_acces`, `affecter_vehicule`, `est_employe_du_compte` — Admin A systématiquement refusé sur les ressources/l'entreprise B.
- Régression : la suite pgTAP de la délégation d'alertes (22 assertions, dont 3 fonctions cross-tenant du même type) rejouée après la migration — toujours verte.

## P1-4 — Schema drift `verrouiller_facture_emise`

**Investigation** :
- Production applique déjà partiellement l'immutabilité d'une facture émise via `trg_lignes_factures_brouillon_only` (`20260710000007_consolidation_financiere.sql`), qui interdit de modifier les lignes d'une facture non brouillon.
- Le corps de `verrouiller_facture_emise` référence explicitement `entreprise_snapshot` (`v_old ? 'entreprise_snapshot'`), un champ ajouté par `20260812000200_documents_commerciaux_p9.sql` et réellement utilisé par l'application (`src/app/actions/factures.ts`, `src/lib/documents-commerciaux.ts`) pour figer l'identité légale de l'émetteur au moment de l'émission — fonctionnalité qui n'a de sens que si la facture émise ne peut plus être altérée ensuite.
- La fonction ne dépend pas techniquement de cette colonne (le test `?` est silencieusement faux si elle n'existe pas), donc son application est sûre indépendamment de l'état exact du schéma.

**Décision : OPTION A** — protection métier réelle et cohérente avec l'existant, à généraliser plutôt qu'à retirer.

**Découverte séparée, non traitée dans ce lot** : en vérifiant pourquoi `entreprise_snapshot` semblait absent de Preview, il est apparu que Preview n'a **pas seulement** ce déclencheur en trop — il lui manque en réalité **toute** la migration `20260812000200_documents_commerciaux_p9.sql` (`entreprise_snapshot`, table `acces_externes_documents`, fonction `document_commercial_par_token`...), confirmé absent par requête directe sur le schéma live. Cette migration est déjà connue comme sensible à rejouer via `db push` (policies sans garde `if not exists`). Son application à Preview n'a pas été traitée ici — volontairement hors périmètre des 5 P1, à confier à un lot dédié.

**Correction** : migration `20260822000222_verrouiller_facture_emise.sql`, reproduisant fidèlement la définition déjà live sur Preview (fonction + trigger `verrou_facture_emise before delete or update on factures`). Appliquée d'abord à Preview (idempotente — comportement inchangé, déjà live), puis à Production via la méthode isolée.

**Tests pgTAP réels** (`supabase/tests/verrouiller_facture_emise.test.sql`, 6 assertions) : facture brouillon librement modifiable et supprimable ; facture émise protégée sur son contenu (montant) ; champ libre (règlement) toujours modifiable après émission ; impossible de redevenir brouillon ; impossible de supprimer ; la facture persiste après une tentative de suppression refusée.

## P1-5 — Vérification sûre du credential serveur Supabase

**Méthode** (jamais de valeur affichée, jamais `printenv`, jamais copie de clé) :
1. Existence et nom confirmés : `SUPABASE_SERVICE_ROLE_KEY` présente dans les variables Vercel Production (noms uniquement listés).
2. Utilisation dans le code confirmée : `src/lib/supabase/admin.ts` (notifications push, `scripts/seed-elsatia-preview-year.mjs`) — et surtout `src/lib/supabase/proxy.ts`, qui l'utilise sur **chaque requête** passant par le rate-limiting (`appliquerRateLimit`, RPC réelle `consommer_rate_limit`).
3. Preuve fonctionnelle indirecte : `/login` et `/signup` sont soumis à une politique de rate-limit réelle (`src/lib/security/rate-limit.ts:30-31`) qui échouerait avec un statut 503 si le credential était invalide. Plusieurs dizaines de requêtes POST réelles vers ces deux routes ont été effectuées cette semaine (lots précédents + recettes) sans jamais produire de 503 — le credential authentifie donc correctement aujourd'hui.
4. Non-exposition navigateur confirmée par construction : `SUPABASE_SERVICE_ROLE_KEY` n'a pas le préfixe `NEXT_PUBLIC_`, donc Next.js ne l'inclut jamais dans le bundle client.
5. Nom historique vs contenu moderne : les clés JWT legacy ayant été désactivées (lot SECURITY-CREDENTIALS-V1B/V1C), et ce credential authentifiant toujours avec succès (point 3), la seule explication cohérente est que la variable `SUPABASE_SERVICE_ROLE_KEY` contient désormais la nouvelle clé secrète moderne sous l'ancien nom de variable — documenté ici sans jamais avoir vu la valeur elle-même.

**Aucune correction de code nécessaire** — point de vérification uniquement.

## Feature flags — contrôle serveur (point annexe P1, §19)

Le rapport d'audit notait que le statut BETA/DISABLED n'est vérifié que côté client. Vérification : ces Server Actions restent techniquement appelables si l'utilisateur détient la permission métier sous-jacente (`acces_boutique`, `acces_paiements_bancaires`...) — mais seul un administrateur de sa **propre** entreprise peut s'attribuer une telle permission (`peut_gerer_acces`), et cela n'affecte jamais que les données de son propre tenant. Aucun risque cross-tenant, aucune élévation de privilège au-delà de ce qu'un administrateur a déjà légitimement sur son entreprise. **Confirmé NON BLOQUANT**, conforme au rapport d'audit — aucun garde serveur ajouté (aurait été un développement hors périmètre P1).

## QA finale

```
Vitest         : 329/329 (60 fichiers, +32 pour le garde-fou anti-régression)
typecheck      : 0 erreur
lint           : 0 erreur, 3 warnings préexistants (hors périmètre)
build          : succès
verify:secrets : 841 fichiers contrôlés, 0 secret
verify:migrations : 201 migrations valides
npm audit      : 0 vulnérabilité
pgTAP          : 22/22 (délégation, régression) + 6/6 (verrouiller_facture_emise)
                 + vérifications fonctionnelles/cross-tenant ad hoc (P1-3) — toutes vertes,
                 exécutées directement sur Preview (Docker local indisponible, 4e échec
                 consécutif confirmé sur ce lot, une seule tentative faite puis abandonnée)
```

## Déploiement

Preview d'abord (migrations 221 et 222 appliquées, code déployé, tarifs/mobile/cross-tenant vérifiés réels), puis Production après QA complète verte — voir rapport final dans la conversation pour le détail Git/diff/déploiement/nettoyage.
