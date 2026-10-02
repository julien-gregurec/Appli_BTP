# ELSATIA — Legal Consent : préparation à l'intégration dans le prochain train canonique — V1

| | |
|---|---|
| Lot | `ELSATIA-LEGAL-CONSENT-TRAIN-INTEGRATION-PREP-V1` |
| Date | 02/10/2026 |
| Branche source | `claude/bold-allen-7mx7xz` |
| Base réelle | `integration/elsatia-canonical-train-v8` @ `53b4bc76` (371 migrations, dernière `20260928000812`) |
| Pack d'origine | `docs/qualification/ELSATIA_LEGAL_CONSENT_COMMERCIALIZATION_PACK_V1.md` (commit `a9a38927`) |
| Migration du pack | `20261002000901_acceptations_documents_legaux_v1.sql` — **appliquée nulle part** hors bases locales jetables |
| Déploiement / Preview / Production | **Aucun.** |
| Textes juridiques | **Aucune modification dans ce lot** (voir §6 pour la seule modification héritée du pack V1) |

## Verdict

# READY_FOR_CANONICAL_INTEGRATION

Sous réserve des dépendances de convergence du §4 (aucune n'est un conflit de code ou de
migration propre au pack) et des décisions du §7, qui conditionnent l'**activation commerciale**,
pas l'intégration.

---

## 1. Comparaison avec V8 et la Preview hébergée

| Référence | Migrations | Dernière | Relation avec le pack |
|---|---|---|---|
| V8 (`53b4bc76`) | 371 | `20260928000812` | base exacte du pack ; diff = fichiers du pack uniquement |
| Preview hébergée (déclarée) | 372 | `20261002000813_plateforme_annuaire_lecture_pure.sql` | **cette migration n'existe sur aucune des 362 branches distantes** (recherche par nom et par horodatage) — voir dépendance D1 |
| Pack | 372 = V8 + `20261002000901` | `20261002000901` | `901` > `813` : pas de collision, ordre correct |

Migrations post-V8 connues (branches distantes, recherche exhaustive des horodatages ≥ 2026-09-29) :
`20260929000101` (export RGPD), `20260929000801` (suspension par app), `20260929001301`,
`20260930000101` ×2 (**collision entre elles**, hors pack : `busy-ramanujan` / `gracious-curie`),
`20260930000102`, `…000301`, `…000401`–`…000404`, `20260930000813`, `…001401`, `…001402`,
`…001501`, `20261002000184`. **Aucune ne collisionne avec `20261002000901`**, et toutes trient
avant elle : la migration du pack reste la dernière du train sans renumérotation.

## 2. Simulation de fusion avec les branches post-V8 (`git merge-tree`)

28 branches actives depuis le 28/09/2026 ont été simulées contre le pack **et** contre V8 seul (après commit du lot).

| Branche | Lignée | Conflits avec le pack | Conflits avec V8 seul | Lecture |
|---|---|---|---|---|
| `optimistic-hopper`, `fervent-bell`, `confident-brown`, `beautiful-tesla`, `dazzling-turing`, `modest-shannon` (V8+) | V8 | **0** (après retrait des 3 attendus générés, §5) | 0 | fusion propre |
| `gracious-curie` (3), `busy-ramanujan` (3), `festive-turing` (3), `brave-carson` (4), `ecstatic-fermat` (3), `wizardly-keller` (2), `gifted-cori` (1) | pré-V8 | identiques à V8 seul | idem | conflits **préexistants** avec V8, aucun dû au pack |
| `blissful-volta`, `beautiful-albattani`, `kind-tesla` (suspension par app) et 12 autres | — | 0 | 0 | — |
| `kind-mayer` (export RGPD) | pré-V8 | 7 | **les mêmes 7** | `proxy.ts` : conflit **préexistant avec V8** ; à la résolution, conserver `"/dpa"` dans `PUBLIC_PATHS` et `CHEMINS_SANS_SESSION` |
| `elegant-turing` (Stripe Test readiness) | `main` (29/07) | 13 | **les mêmes 13** | branche hors lignée V8 ; tout portage devra réappliquer la garde d'acceptation dans `demarrerAbonnementAction` |
| `awesome-franklin` (identité légale) | `main` (29/07) | 64 | **les mêmes 64** | supplantée par V8 (pack juridique déjà aligné) ; ne pas fusionner telle quelle |

**Le pack n'ajoute aucun conflit** : pour chaque branche, l'ensemble des conflits est identique
à celui qu'elle a déjà avec V8 seul.

## 3. Chevauchements fonctionnels vérifiés

| Domaine | Constat | Statut |
|---|---|---|
| **Billing / Stripe readiness** | Un seul point d'entrée Checkout abonnement GP (`ouvrirCheckoutAbonnement`, appelé uniquement par `demarrerAbonnementAction`) : la garde est placée avant lui. Boutique (`stripe-boutique.ts`), Connect (`stripe.ts`) et Tools (`tools-monetization.ts`) ne sont pas des souscriptions GP : non concernés. `elegant-turing` ajoute `etatOuvertureCommerciale()` au même endroit (lignée `main`) : compatible, l'ordre recommandé est ouverture commerciale → abonnement déjà vivant → acceptation → Checkout | Compatible |
| **Identité vendeur** | `elegant-turing` introduit une identité vendeur par variables `LIRIA_VENDEUR_*` (pied de facture Stripe, verrou Live). Le pack introduit `IDENTITE_VENDEUR` (valeurs prouvées + `DECISION_REQUIRED`). **Deux sources si les deux convergent** → dépendance D3 | Chevauchement sémantique, pas de conflit de fichier |
| **RGPD contract retention** | La purge (`rapport_purge_entreprise`, `purger_table_entreprise`, toutes versions jusqu'à `20260928000501`) ne balaie que `table_schema = 'public'`. Les preuves sont dans `platform` | Isolé |
| **RGPD export / portabilité** | `kind-mayer` : catalogue `platform.rgpd_export_catalogue` exhaustif **sur `public`** ; les preuves (`platform`) n'y entrent pas et ne déclenchent pas son contrôle d'exhaustivité. Elles ne seront donc **pas exportées** → décision §7 (n°9) | Pas de conflit ; lacune documentée |
| **Transactional email** | Aucun gabarit modifié. `ligneLegaleVendeur()` = `ligneLegale()` de `@elsatia/email` (testé) | Aligné |
| **Onboarding** | `createEntrepriseAction` → `creer_entreprise_avec_acceptation` (atomique). `creer_entreprise_bootstrap` **reste exécutable par `authenticated`** : les scripts pilotes (`run_pilot_acceptance_v2.mjs`, `run_pilot_auth_scenarios.sh`) et des fixtures l'appellent ; la révoquer changerait le comportement du train → dépendance D4 | Compatible ; contournement documenté |
| **Security hardening** | Fonctions `SECURITY DEFINER` avec `search_path` fixé ; `revoke` `public/anon/service_role`, `grant` `authenticated` ; tables `platform` sans aucun grant API. **Mode sûr (incident, `…000807`)** : `incident_installer_gardes()` ne couvre que `public` → **correctif de convergence ajouté** : le journal de preuves reçoit la garde existante `incident_garde_ecriture('gestion_pro')` (lecture seule ⇒ aucune preuve écrite ; testé) | Aligné |
| **Per-app suspension** | `est_membre_actif` refuse une entreprise suspendue ; les RPC du pack utilisent volontairement l'appartenance **statut actif** (indépendante de l'état commercial) pour qu'un réabonnement puisse accepter. `kind-tesla` fusionne sans conflit | Compatible |

## 4. Dépendances de convergence

| # | Dépendance | Action au moment du train |
|---|---|---|
| D1 | `20261002000813_plateforme_annuaire_lecture_pure.sql` est appliquée sur la Preview mais **absente de toutes les branches** | La récupérer (poste local ou session d'origine) **avant** de construire le train ; sinon le train dérive de la Preview. Le pack trie après elle |
| D2 | Attendus du train (3 fichiers générés) | `npm run sync:train-expectations` une fois toutes les migrations retenues réunies. Sur la branche seule, `verify:train-expectations` signale volontairement une dérive |
| D3 | Deux sources d'identité vendeur si `elegant-turing` est porté | Faire lire à la configuration Stripe les champs `PROUVE` de `IDENTITE_VENDEUR` et réserver les variables aux champs `DECISION_REQUIRED` (adresse, TVA) |
| D4 | `creer_entreprise_bootstrap` encore exposée | Décider de la révoquer pour `authenticated` après adaptation des scripts pilotes ; d'ici là, la garde commerciale effective est la souscription |
| D5 | `kind-mayer` (export RGPD) × `proxy.ts` | Conserver `/dpa` à la résolution |
| D6 | Collision `20260930000101` entre `busy-ramanujan` et `gracious-curie` | Hors pack, à renuméroter par le train |
| D7 | Ligne RCS ajoutée à `mentions-legales.md` par le pack V1 | **Seule modification de texte juridique du pack** : à valider explicitement, ou à retirer avant la convergence (le test `DocumentLegal`/`identite-vendeur` devra alors être ajusté) |

Ordre d'application : la migration avant le code (sans elle, la création d'entreprise échoue fermée).

## 5. Modifications de ce lot

| Fichier | Modification |
|---|---|
| `supabase/migrations/20261002000901_acceptations_documents_legaux_v1.sql` | **Logique inchangée.** Ajout d'un trigger réutilisant `public.incident_garde_ecriture('gestion_pro')` sur le journal de preuves (alignement mode sûr). Non renumérotée |
| `supabase/tests/acceptations_documents_legaux_v1.test.sql` | 41 → **45** assertions : mode sûr (lecture seule ⇒ refus `PT503`) ; comptes existants non bloqués |
| 3 fichiers d'attendus du train | **Ramenés à l'état V8** (régénération au train, D2) |
| Ce rapport | nouveau |

## 6. Garanties de la preuve d'acceptation (vérifiées)

| Exigence | Mécanisme | Preuve |
|---|---|---|
| Append-only | Triggers `UPDATE` / `DELETE` / `TRUNCATE` refusés (`55000`), y compris superutilisateur ; versions publiées immuables | pgTAP §6 |
| Isolée par entreprise | RPC contrôlant l'appartenance ; aucun grant sur les tables ; A ne peut ni écrire, ni sonder, ni lire pour B ; l'acceptation de A ne vaut pas pour B | pgTAP §5 |
| Non effaçable par les mécanismes RGPD standards | Schéma `platform` hors balayage de purge (`public` seul) ; aucune FK vers `auth.users` / `entreprises` (pas de cascade) ; `anonymiser_*` ne touche que `public` ; aucune suppression de compte dans le produit | lecture du code (§3) + append-only |
| Consultable pour preuve sans exposer les autres entreprises | `acceptations_documents_legaux_entreprise(entreprise)` : `gerer_parametres` dans **cette** entreprise, renvoie ses seules lignes ; `service_role` en lecture pour le support | pgTAP §4-5 |
| Ne bloque pas les comptes existants | Aucun contrôle à la connexion ni sur l'accès métier : l'acceptation n'est demandée qu'à la **création** d'une entreprise et à la **souscription** (où elle se fait par la case du formulaire) | pgTAP §9 + aucune modification de `getContexteEntreprise`, du proxy (hors `/dpa`) ou des RLS |

## 7. Inventaire exact des décisions restantes

| # | Décision | État actuel dans le code | Ce qui en dépend | Qui |
|---|---|---|---|---|
| 1 | **Régime de TVA** (franchise ou assujettissement), n° de TVA | `NEXT_PUBLIC_LEGAL_TVA` vide → « à confirmer » ; `/tarifs` et CGV affichent « HT » ; `STRIPE_AUTOMATIC_TAX_ENABLED` non tranché | mentions légales, CGV 4.2, facture Stripe, Stripe Tax, affichage des prix | Propriétaire + comptable |
| 2 | **Adresse publique** : adresse personnelle ou domiciliation | adresse présente dans `mentions-legales.md` (« retenue pour l'immatriculation ») sans décision de publication ; `IDENTITE_VENDEUR.adresse = null` ; jamais dans les e-mails | mentions légales (LCEN), factures Stripe, CGV | Propriétaire |
| 3 | **Durées de conservation** : comptes, données après résiliation (activation de la purge), contrats acceptés (A/B/C), factures, journaux, photos de chantier, GPS/photos de pointage, justificatifs, paie, sauvegardes, prospects/support, **preuves d'acceptation** | tout est conservé indéfiniment (RETAIN) ; planificateur de purge désactivé | politique de confidentialité, CGV 10.2, DPA | Propriétaire + avocat |
| 4 | **CGU salariés** : faire accepter les CGU aux salariés qui rejoignent une entreprise | mécanisme prêt (portée `utilisateur`), **non branché** sur `rejoindreEntrepriseAction` / `activerCompteEmployeAction` | onboarding salarié | Propriétaire |
| 5 | **Comptes existants** : exiger ou non une acceptation (à la connexion d'un administrateur, ou à la prochaine souscription seulement) ; entreprises créées par la plateforme | aucun blocage ; acceptation à la prochaine souscription | accès, support | Propriétaire |
| 6 | **Stripe seller identity** : identité, adresse, pied de facture, libellé bancaire, préfixe, procédure d'avoir, liens CGV/confidentialité dans Stripe | hors dépôt (Dashboard) ; `elegant-turing` propose un verrou par variables | factures et avoirs d'abonnement | Propriétaire (opérateur Stripe) |
| 7 | **OpenStreetMap** : tuiles chargées par le navigateur depuis `tile.openstreetmap.org` (IP du visiteur transmise) | actif, non déclaré | politique de confidentialité / cookies, politique d'usage des tuiles OSMF en usage commercial (ou fournisseur de tuiles contractuel) | Avocat + propriétaire |
| 8 | **Push navigateurs** : services push Google / Mozilla / Apple (charge chiffrée VAPID) | actif sur consentement navigateur, non déclaré | politique de confidentialité | Avocat |
| 9 | Inclure les preuves d'acceptation dans l'**export RGPD** (`kind-mayer`) | non incluses | portabilité / droit d'accès | Propriétaire + avocat |
| 10 | Validation des textes CGU / CGV / DPA « v1 » et de la ligne RCS (D7) | brouillons ; aucun texte modifié dans ce lot | versions enregistrées en base | Avocat |
| 11 | Adresse IP dans la preuve | non collectée | force probante | Avocat |
| 12 | Révocation de `creer_entreprise_bootstrap` (D4) | exposée | onboarding hors UI | Propriétaire / train |

## 8. Contrôles de ce lot

| Contrôle | Résultat |
|---|---|
| Rejeu des migrations (PostgreSQL 16 local) | 372 appliquées proprement |
| `acceptations_documents_legaux_v1.test.sql` | **45/45** |
| Suite pgTAP complète (164 fichiers) | seuls les 9 échecs **préexistants** de V8 (attestation pgsodium du harnais, `tools_cloud_sync`, 7 `studio_*`) — identiques à la base de référence V8 |
| `verify:migrations` | 372 valides |
| `verify:train-expectations` | dérive **attendue** (D2) |
| Vitest | inchangé depuis le pack V1 (2628/2628) — aucun fichier TypeScript modifié dans ce lot |
