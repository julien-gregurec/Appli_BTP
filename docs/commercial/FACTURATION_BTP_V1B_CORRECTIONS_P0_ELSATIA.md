# FACTURATION-BTP-V1B — Correctifs des 3 P0 + verrou des factures émises

Référence : `docs/commercial/FACTURATION_BTP_V1_AUDIT_ELSATIA.md` (audit initial, commit `a71e229`) et `docs/commercial/FACTURATION_BTP_V1_CHECKLIST.md`. Branche `claude/facturation-btp-v1b-p0`, depuis `claude/facturation-btp-v1-audit` (commit `a71e229`). Corrige exclusivement les 3 P0 identifiés par l'audit et le P1 associé (facture émise mutable). Aucun autre P1/P2/P3 traité, aucun développement AVENANTS-V1.

## 1. P0 n°1 — paiements inaccessibles

**Reproduction** : `enregistrerPaiementAction` (`supabase.from("paiements").insert(...)`) échouait systématiquement avec `42501 permission denied for table paiements`, pour tout utilisateur, dans n'importe quel environnement.

**Cause racine confirmée** : la table `public.paiements` n'avait **aucun** privilège `GRANT` pour `authenticated` (ni pour `service_role` au-delà de `REFERENCES/TRIGGER/TRUNCATE`) — la migration `20260729000189_restaurer_privileges_modules_metier.sql` (« Phase 1 commercialisation ») ne restaure explicitement que `devis` et `factures`, oubliant `paiements`. RLS était déjà correcte (policies présentes) mais jamais atteinte : le blocage se produisait **avant** RLS, au niveau du GRANT de base.

**Correction** (`20260818000211_paiements_et_anti_surfacturation.sql`) :
```sql
grant select, insert, update, delete on table public.paiements to authenticated;
revoke all on table public.paiements from anon;
```
Aucune modification de RLS (déjà correcte), aucune permission métier existante modifiée.

**Tests** : paiement partiel (200€) puis complémentaire (400€ sur une facture de 600€ TTC) → passage automatique en `payée`, cross-tenant refusé (RLS), rôle sans `gerer_factures` refusé, `anon` sans aucun privilège — tous vérifiés en Local (pgTAP) et rejoués manuellement.

**Surpaiement** : le contrôle applicatif existant (`enregistrerPaiementAction`, refuse si `montant > reste_dû + 0.005`) est désormais **atteignable** (il ne l'était pas tant que l'INSERT échouait avant lui). Il reste la seule protection — aucune contrainte `CHECK` en base ne plafonne `paiements.montant` par rapport au reste dû, cohérent avec le style du reste du codebase (RLS + contrôle applicatif). Non modifié dans ce lot.

## 2. P0 n°2 — sur-facturation acompte + situation

**Reproduction confirmée avant correction** (déjà quantifiée par l'audit, reproduite à l'identique) : devis 10 000 € → acompte 20 % (2 000 €) → situation 100 % cumulé (+5 000 € après une première situation à 50 %) → **12 000 € réellement facturés**.

**Correction — source canonique unique** : nouvelle fonction interne
```sql
create or replace function public.montant_facture_devis(p_entreprise_id uuid, p_devis_id uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select coalesce(sum(montant_ht), 0) from public.factures
  where devis_origine_id = p_devis_id and entreprise_id = p_entreprise_id and statut <> 'annulee';
$$;
```
Revoquée de `public`/`anon`/`authenticated` — fonction interne uniquement, appelée par d'autres RPC `security definer` (pas un point d'entrée direct, pour ne jamais devenir un oracle de chiffre d'affaires cross-tenant).

**Décisions prises et documentées** :
- **Avoirs** : leur `montant_ht` est déjà négatif (leurs lignes portent une quantité négative, voir `creer_facture_avancee`/`recalc_totaux_facture`) — une simple somme les soustrait donc automatiquement, sans traitement de signe séparé.
- **Brouillons** : volontairement **inclus** dans le calcul (`statut<>'annulee'`), comme c'était déjà le cas dans `creer_facture_avancee` avant ce lot. Les exclure aurait rouvert une variante du P0 n°3 (plusieurs brouillons créés en parallèle, jamais additionnés entre eux avant leur envoi). Ce choix est **distinct** de la question, restée ouverte, de savoir si RENTABILITÉ-V1B doit compter les brouillons dans le CA réel affiché (P1 non traité dans ce lot, cf. §6).
- **Plafond** : reste strictement **par devis accepté** (`devis.montant_ht`), jamais par chantier — inchangé, conforme à la consigne de ne pas créer de contrat global chantier avant AVENANTS-V1.

**`creer_situation_travaux`** : ajoute la vérification manquante (avant : uniquement le cumul des situations précédentes). Après : `montant_déjà_facturé + montant_de_la_période > devis.montant_ht + 0.01` → refus, message clair (« Cette situation dépasserait le montant total autorisé pour ce devis : déjà facturé X, devis Y »).

**`creer_facture_avancee`** : logique inchangée (mêmes vérifications, même message), remplace uniquement son calcul inline de « déjà facturé » par un appel à la source canonique — élimine la duplication de logique entre les deux RPC.

**Concurrence** : les deux RPC verrouillent désormais la ligne `devis` (`for update`) avant de lire le montant déjà facturé — un second appel concurrent sur le même devis attend que le premier valide ou échoue avant de relire un total à jour, empêchant une race condition classique lecture-puis-écriture. Motif déjà utilisé ailleurs dans le codebase (`modifier_facture_brouillon`, `modifier_devis_brouillon`), étendu ici aux trois RPC de création de facture. Aucun test de concurrence multi-connexion réel n'a été exécuté (outillage de session unique) — le mécanisme est le motif standard et déjà éprouvé de Postgres pour ce cas précis.

**Tests** : le scénario exact de l'audit est rejoué en Local — acompte 20 % (2 000 €) accepté, situation à 50 % (5 000 €) acceptée, **situation à 100 % désormais refusée** avec le message attendu, total réel confirmé à 7 000 € (pas 12 000 €), une situation plus modeste (80 %, +3 000 €) acceptée et menant exactement à 10 000 €, une facture finale par-dessus refusée.

## 3. P0 n°3 — facture classique dupliquable

**Reproduction confirmée avant correction** : `creer_facture_depuis_devis(devis_id, 'simple')` appelée deux fois de suite sur le même devis accepté (10 000 €) créait deux factures brouillon complètes et indépendantes de 10 000 € chacune.

**Correction** :
```sql
v_deja_facture := public.montant_facture_devis(v_devis.entreprise_id, p_devis_id);
if v_deja_facture > 0.01 then
  raise exception 'Ce devis est déjà facturé, au moins en partie (déjà % €) : utilisez une facture de solde/finale ou une situation plutôt qu''une nouvelle facture complète.', ...;
end if;
```
Comme cette RPC facture toujours 100 % du devis, tout montant déjà facturé par **n'importe quel** mécanisme (acompte, situation, finale, ou une autre facture classique) rend un nouvel appel incompatible — l'utilisateur est explicitement redirigé vers acompte/situation/finale selon le cas, sans ambiguïté silencieuse. Sur un devis vierge (rien facturé), le comportement est inchangé.

**Sécurité en profondeur restaurée** (P1 de l'audit §44-45, corrigé dans le même mouvement car directement lié) : cette RPC avait perdu, dans sa version la plus récente, la vérification explicite `est_membre_actif` et le mode `security definer` présents dans une version antérieure — elle était de plus `grant`-ée à `anon`, protégée uniquement par l'absence de `GRANT` de base sur `devis`/`factures` pour ce rôle (fragile, sans défense en profondeur). Restauré : `security definer` + `est_membre_actif(v_devis.entreprise_id)` explicite, `grant` retiré à `anon`.

**Idempotence** : un appel répété (rejeu réseau accidentel) sur le même devis échoue désormais dès le deuxième appel, avec le même mécanisme `for update` que les deux RPC précédentes pour la protection en concurrence.

**Tests** : première facture sur un devis vierge acceptée (3 000 €), second appel refusé avec le message attendu, une seule facture existe réellement, `anon` n'a plus le droit d'exécuter la fonction.

## 4. P1 associé — FACTURE-LOCK (facture émise mutable)

**Reproduction confirmée avant correction** : `UPDATE factures SET montant_ht=...`/`SET client_id=...` réussissaient en écriture directe sur une facture `envoyee`, malgré le refus de `modifier_facture_brouillon` (RPC) et `modifierFactureAction` (action serveur) — même classe de faille que celle corrigée pour les devis par DEVIS-LOCK-V1.

**Correction** (`20260818000212_facture_lock_v1.sql`) : trigger `BEFORE UPDATE/DELETE` sur `factures`, sur le même principe que `verrouiller_devis_accepte`. Différence importante avec les devis : une facture a un cycle de vie qui continue après `brouillon` (`envoyee`↔`en_retard`, →`payee`/`payee_partiel` via le trigger de paiement, →`annulee`) — le statut lui-même reste donc libre de changer parmi ces états ; seul un retour explicite à `brouillon` est bloqué (ce qui rouvrirait tout, y compris la protection déjà existante sur les lignes).

**Champs verrouillés une fois la facture sortie de `brouillon`** : `numero`, `client_id`, `chantier_id`, `devis_origine_id`, `type`, `date_emission`, `montant_ht/tva/ttc`, `avancement_pct`, `situation_numero`, `retenue_garantie_pct`, `montant_retenue`, `cumul_precedent_ht`, `est_dgd`, `entreprise_id`, `facture_parente_id`, `facture_origine_id`, `entreprise_snapshot` (une fois déjà renseigné).

**Champs volontairement laissés modifiables** : `statut` (parmi les états non-brouillon légitimes), `montant_paye` (écrit par `recalc_paiements_facture`), `notes_internes`, `email_envoye_le`/`email_envoye_a`, `date_echeance` (fonctionnalité existante et légitime, `modifierEcheanceFactureAction` — une renégociation de délai de paiement n'a aucun impact sur le montant ni sur le garde-fou anti-surfacturation), colonnes `stripe_*`/`lien_paiement_expire_at` (gestion du lien de paiement), `updated_at`.

**Lignes (`lignes_factures`)** : déjà protégées par un trigger existant antérieur à ce lot (`trg_lignes_factures_brouillon_only`, `20260710000007`) — aucune modification nécessaire.

**Suppression** : désormais refusée par une règle **explicite** (« Cette facture a déjà été émise et ne peut plus être supprimée »), et non plus par l'effet de bord accidentel du verrou sur les lignes (relevé par l'audit).

**Sécurité en profondeur / fuite d'information** : contrairement au trigger `lignes_devis` de DEVIS-LOCK-V1 (`security definer`, lisant à travers les tenants), ce trigger n'a besoin d'aucune vérification de tenance supplémentaire — pour `UPDATE`/`DELETE` sur `factures` elle-même, RLS filtre les lignes visibles **avant** que le trigger ne s'exécute (même mécanisme Postgres déjà confirmé pour `devis`) : un utilisateur d'un autre tenant ne déclenche jamais le trigger, 0 ligne ne correspondant à sa requête.

**Tests** : brouillon librement modifiable, montant et client verrouillés une fois émise, retour à brouillon bloqué, lignes protégées (déjà existant, non modifié), suppression explicitement refusée, `notes_internes`/`date_echeance` toujours modifiables, montant intact après toutes les tentatives, cross-tenant confirmé invisible.

**Incident découvert et corrigé pendant le déploiement Preview** : la première version du trigger comparait les champs un par un, dont `entreprise_snapshot` — une colonne qui n'existe pas encore sur Preview (elle provient de la migration `20260812000200`, hors périmètre, déjà signalée comme absente de Preview par DEVIS-LOCK-V1). Résultat : le trigger, déclenché indirectement par `recalc_paiements_facture` à chaque paiement, faisait échouer **tout enregistrement de paiement sur Preview** avec `record "old" has no field "entreprise_snapshot"` — une régression que ce lot aurait introduite sur le correctif du P0 n°1 lui-même. Détecté par la vérification empirique sur Preview (pas seulement en Local, où toutes les migrations sont présentes). Corrigé en réécrivant le trigger avec une comparaison par différence JSON (liste blanche des champs non contractuels retirés avant comparaison, `to_jsonb(old) - champ`) : une colonne absente est simplement absente du JSON des deux côtés, sans erreur, quel que soit l'état d'avancement des migrations de l'environnement. Revérifié en Local (471/471) puis sur Preview (paiement + verrou fonctionnent ensemble, données de test nettoyées).

## 5. Avoir — vérifications complémentaires

Testé (§29 du cahier des charges, en attente depuis l'audit) : sur le devis de 10 000 € déjà facturé à 10 000 € (§2), un avoir de 1 000 € (10 %) ramène le total net facturé (`montant_facture_devis`) à **9 000 €** exactement — confirmé par assertion pgTAP. Un second avoir reste toujours accepté, jamais bloqué par le plafond (comportement volontaire, inchangé). L'« avoir supérieur à la facture d'origine » (P1 de l'audit §19) n'a **pas** été corrigé : il n'est pas nécessaire à la cohérence du nouveau plafond (un avoir ne fait que libérer de la marge de facturation, jamais en consommer), conformément à la consigne de ne le traiter que si strictement nécessaire.

## 6. P1 volontairement laissés ouverts

Conformément à la consigne, non corrigés dans ce lot : PDF de situation incomplet, numérotation, mentions légales, relances, facturation électronique, et la question de savoir si RENTABILITÉ-V1B devrait exclure les factures brouillon de son calcul de CA réel (distincte de la décision prise en §2 pour le plafond de facturation, qui inclut délibérément les brouillons pour rester protectrice).

## 7. Messages utilisateur

Aucune erreur SQL brute exposée : chaque nouveau refus lève un message explicite et actionnable (« Cette situation dépasserait le montant total autorisé... », « Ce devis est déjà facturé... utilisez une facture de solde/finale... », « Cette facture a déjà été émise et ne peut plus être modifiée/supprimée »). Les actions serveur existantes (`enregistrerPaiementAction`, `modifierFactureAction`, `creerFactureDepuisDevisAction`) passent déjà ces erreurs à travers `messageErreurUtilisateur`, qui catégorise `P0001` en « Cette opération n'est pas possible dans l'état actuel du document » si aucun message de repli spécifique n'est fourni — cohérent avec le motif déjà en place pour DEVIS-LOCK-V1.

## 8. Tests

- **pgTAP** (`supabase/tests/facturation_btp_v1b_p0.test.sql`, 35 assertions) : paiements (GRANT, cross-tenant, permission, anon, paiement partiel/complémentaire), anti-surfacturation (acompte, situation dans/hors plafond, finale refusée, avoir), facture classique (première acceptée, doublon refusé, anon), facture-lock (brouillon modifiable, header verrouillé, retour brouillon bloqué, lignes protégées, suppression refusée, champs non contractuels, cross-tenant).
- **Non-régression** : `supabase/tests/correctif_rls_isolation_factures.test.sql` ajusté (cible seulement, logique inchangée) — 5 assertions ciblaient une facture déjà `envoyee` du fixture partagé pour tester une contrainte FK sans rapport avec ce lot ; redirigées vers une facture brouillon dédiée pour continuer à tester la contrainte FK et non le nouveau verrou d'émission.
- **Vitest** : aucun nouveau test nécessaire — aucun code TypeScript modifié dans ce lot (uniquement des migrations SQL), la correction est entièrement au niveau base de données.
- **Suite complète** : `npm run test:db` → **471/471** (dont les 35 nouvelles assertions), `npm run test` → 342/342, `npm run typecheck` → 0 erreur, `npm run lint` → 0 erreur (3 avertissements `<img>` préexistants hors périmètre), `npm run build` → succès.

## 9. Non-régression

DEVIS-LOCK-V1, C6-B, RENTABILITÉ-V1B/V1C, Commandes fournisseurs V1/V1B, ADMIN-V1, PROMO-V1, isolation multi-tenant : toutes les suites pgTAP dédiées restent vertes, aucune modifiée au-delà du fichier corrigé en §8.

## 10. Déploiement

- **Local** : les deux migrations s'appliquent proprement depuis une base vierge (`supabase db reset`), suite complète verte.
- **Preview** (`elsatia-preview`) : migrations appliquées isolément (`supabase db query --linked -f <migration>`, pas de `db push` global), pour la même raison que DEVIS-LOCK-V1 — une migration antérieure hors périmètre (`20260812000200`, P9 documents commerciaux) reste absente de Preview, non touchée. Vérification empirique complète rejouée directement sur Preview (paiement, sur-facturation bloquée, facture-lock), données de test entièrement nettoyées ensuite. Aucun code applicatif modifié dans ce lot (uniquement des migrations SQL) : aucun déploiement Vercel nécessaire.

## 11. Documentation liée

`docs/commercial/FACTURATION_BTP_V1_CHECKLIST.md` mis à jour pour marquer les 3 P0 et le P1 facture-lock comme corrigés.
