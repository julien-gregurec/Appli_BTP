# ELSATIA Gestion Pro — Correctif du débordement de numérotation (devis/factures/avoirs/commandes)

Mission de correction ciblée, faisant suite à l'audit read-only
`BUG_CONFIRMED=YES` / `FIX_RECOMMENDED=YES`. Périmètre strictement limité au
bug réellement démontré dans `public.next_reference()` — aucune refonte du
système de numérotation, aucune règle métier changée, aucune séparation de
compteurs, aucune modification TypeScript.

**Verdict : `NUMBERING OVERFLOW FIX QUALIFIED`**

---

## Cause racine

`public.next_reference(p_entreprise_id, p_type, p_prefix, p_largeur, p_avec_annee)`
(définie une seule fois, `supabase/migrations/20260710000001_comptes_entreprises.sql:108-129`,
jamais redéfinie depuis) formatait le compteur avec
`lpad(v_numero::text, p_largeur, '0')`. `lpad` en PostgreSQL **tronque** une
chaîne déjà plus longue que la largeur demandée au lieu de l'étendre :
`lpad('1000', 3, '0')` = `'100'`, pas `'1000'`. Dès qu'une entreprise cumule
plus de 999 documents d'un type à largeur 3 (`devis`, `factures` — toutes
valeurs de `type` confondues, y compris `avoir` — et `commandes_fournisseurs`),
les numéros suivants entrent en collision avec un numéro déjà attribué et
violent la contrainte `unique(entreprise_id, numero)`.

Une migration antérieure (`20260921000299_correctif_debordement_numerotation_
documents.sql`) avait déjà diagnostiqué ce défaut, mais avait corrigé
`public.formater_numero_document()` — une fonction homonyme créée pour la
première fois **par cette même migration**, et **jamais appelée** par aucun
trigger ni RPC du dépôt (vérifié par recherche exhaustive dans les 298
migrations précédentes). Le vrai chemin de code (`next_reference`, invoqué par
les 13 triggers/RPC de numérotation du dépôt) n'avait donc jamais été corrigé.

## Reproduction avant correctif

Sur une base jetable construite depuis `89d0484` (298 migrations, sans le
correctif), en une seule session, sans concurrence :
```sql
update compteurs_reference set dernier_numero = 999 where entreprise_id = :ent and type = 'devis';
update devis set statut = 'envoye' where id = :devis_a;   -- numero = 'DEV-2026-100' (1000 tronqué)
update devis set statut = 'envoye' where id = :devis_b;   -- ERROR: duplicate key ... DEV-2026-100
```
Reproduit à l'identique pour les factures (`FAC-2026-100`) et confirmé que le
compteur revient à son état pré-incrément après l'échec (`ROLLBACK` du
trigger) : toute nouvelle tentative échoue indéfiniment de la même façon,
l'entreprise est bloquée sans intervention manuelle en base.

## Migration appliquée

**`supabase/migrations/20260922000317_correctif_troncature_next_reference.sql`**
— `create or replace function public.next_reference(...)`, signature
strictement inchangée. Seule modification : les deux occurrences de
`lpad(v_numero::text, p_largeur, '0')` deviennent
`lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0')` —
la largeur configurée devient un plancher, jamais un plafond. Reprend
exactement le principe déjà écrit (mais orphelin) dans
`formater_numero_document`.

Aucun autre changement dans cette migration : même logique de compteur
(`INSERT ... ON CONFLICT (entreprise_id, type) DO UPDATE SET dernier_numero =
dernier_numero + 1 RETURNING`), même absence de `security definer`/`set
search_path` (identique à l'original — la fonction reste `language plpgsql`,
`security invoker`, sans `search_path` explicite, exactement comme avant),
même isolation par `entreprise_id`, même gestion de l'année (`to_char(now(),
'YYYY')`, inchangée), même préfixes. `CREATE OR REPLACE FUNCTION` sur une
signature identique préserve automatiquement en PostgreSQL le propriétaire et
tous les `GRANT`/`REVOKE` déjà en place (notamment la révocation `authenticated`/
`service_role` de la migration `20260902000255_acl_reconciliation_v1.sql`) —
**vérifié empiriquement** : `\df+ public.next_reference` strictement
identique (owner, security, access privileges) avant/après application de la
migration sur une base de test.

## Fonction orpheline `formater_numero_document`

**Conservée telle quelle, non branchée.** Reste du code mort inoffensif :
elle contient déjà le correctif équivalent, n'est appelée par aucun trigger ni
RPC, et son statut de fonction inutilisée n'a aucun impact fonctionnel ni de
sécurité (elle ne modifie aucune donnée, `language sql immutable`, pure
fonction de formatage). La brancher activement sur `next_reference` (pour
éviter la duplication de logique) est une décision de nettoyage délibérément
laissée hors périmètre de ce lot — voir § Hors périmètre.

## Comportement après correctif

| Frontière | Avant | Après |
| --- | --- | --- |
| 999 (tient dans la largeur 3) | `…-999` | `…-999` (inchangé) |
| 1000 | `…-100` (tronqué, collision) | `…-1000` (élargi) |
| 1001 | échec permanent (collision répétée) | `…-1001` |

Reproduction exacte du scénario de blocage rejouée **après** correctif sur la
même base : les trois transitions `brouillon → envoyé` (999, 1000, 1001)
réussissent sans erreur, sans collision, numéros tous distincts.

## Frontières testées

pgTAP dédié (`supabase/tests/gp_v1_numerotation_documents.test.sql`, 15
assertions) — appel direct de `next_reference()` avec un type de compteur
propre au test, largeur 3 :

| Compteur | Résultat attendu | Résultat obtenu |
| ---: | --- | --- |
| 1 | `AUD-001` | ✅ |
| 9 | `AUD-009` | ✅ |
| 99 | `AUD-099` | ✅ |
| 999 | `AUD-999` | ✅ |
| 1000 | `AUD-1000` | ✅ (c'était `AUD-100` avant correctif) |
| 1001 | `AUD-1001` | ✅ |
| 9999 | `AUD-9999` | ✅ |

**Contre-épreuve** : ce même fichier de test, rejoué sur une base construite
**sans** la migration `317` (298 migrations), fait échouer précisément les
assertions 5, 6, 7 (frontières 1000/1001/9999) et réussir les assertions 1 à 4
(sous le seuil) — confirme que le test discrimine réellement l'état corrigé
de l'état bogué, ce n'est pas une tautologie.

**Documents réels** (même fichier, mêmes 15 assertions) :
- **Devis** : compteur amené à 998, 3 devis créés puis transitionnés
  `brouillon → envoyé` → `DEV-<année>-999`, `DEV-<année>-1000`,
  `DEV-<année>-1001` — tous distincts, aucune erreur 23505.
- **Factures** : même scénario → `FAC-<année>-999`, `FAC-<année>-1000`.
- **Avoir** : 3ᵉ facture du même lot, `type='avoir'` → `FAC-<année>-1001` —
  confirme que l'avoir continue de partager la même série `FAC-` que les
  factures classiques (comportement volontairement inchangé, § Hors
  périmètre) et bénéficie du même correctif de troncature.
- **Commandes fournisseurs** : compteur `commande-<année>` amené à 998, 2
  commandes créées (numéro assigné à l'`INSERT`, pas à une transition de
  statut, chemin de code distinct de devis/factures) →
  `CMD-<année>-999`, `CMD-<année>-1000` — confirme que le correctif
  s'applique correctement à un troisième chemin d'appel indépendant.

## Concurrence

Sessions PostgreSQL réellement concurrentes (`psql` séparés, `&`/`wait`,
`pg_sleep` pour forcer le chevauchement) :

- **5 sessions simultanées**, compteur initial 997, franchissant la
  frontière 999→1000 : les 5 transitions committent sans erreur, numéros
  obtenus = `{998, 999, 1000, 1001, 1002}` — **ensemble complet, chaque
  valeur exactement une fois**, séquence monotone confirmée par l'état final
  du compteur (997+5=1002, aucun saut, aucune perte). 0 erreur `23505`, 0
  deadlock, 0 timeout.
- **Compteur final vérifié non « bloqué en rollback permanent »** : après le
  test à 5 sessions, une 6ᵉ transition sur un nouveau devis obtient
  normalement `1003` (vérifié) — pas de blocage résiduel.
- **Deux entreprises différentes, franchissement simultané de leur propre
  frontière 999→1000** : chaque entreprise obtient indépendamment
  `…-1000` sur sa propre série — confirmé légitime et sans collision, la
  contrainte d'unicité étant `(entreprise_id, numero)`, jamais globale.

## Isolation multi-tenant

Confirmée à deux niveaux : (1) `compteurs_reference` a pour clé primaire
`(entreprise_id, type)` — deux entreprises ont structurellement des compteurs
distincts, aucune interférence possible ; (2) vérifié empiriquement sous
charge concurrente réelle (ci-dessus) — deux entreprises peuvent légitimement
produire le même texte de numéro sans qu'aucune ne bloque l'autre.

## Callers concernés (13, tous non modifiés)

Recensés par relecture exhaustive des 298 migrations précédentes :
`entreprises.reference_interne` (ENT, largeur 3), `clients.reference_interne`
(CLI, largeur 4), `chantiers.reference_interne` (CHA, largeur 3, avec année),
`devis.numero` (DEV, largeur 3, avec année), `factures.numero` (FAC, largeur
3, avec année — couvre `simple`/`acompte`/`situation`/`finale`/`avoir`),
`employes.reference_interne` (EMP, largeur 4), `fournisseurs.reference` (FRN,
largeur 4), `commandes_fournisseurs.numero` (CMD, largeur 3, type incluant
l'année), `outils.reference` (OUT, largeur 4), `depot_inventaires.numero`
(INV, largeur 3, type incluant l'année), `notes_frais.reference` (EXP,
largeur 6, avec année), `employes.identifiant_interne` optionnel (largeur 4),
et le trigger partagé `trg_reference_suite_metier` (`contrats_entretien`,
`interventions`, `bons_livraison`, `metres`, `remises_banque` — largeur 4,
type incluant l'année) ; `lots_virements.numero` est appelé inline depuis une
RPC (VIR, largeur 6, avec année).

**Aucun de ces 13 callers n'a été modifié.** La garantie tient par
construction : `greatest(p_largeur, length(v_numero::text))` est
mathématiquement égal à `p_largeur` tant que `length(v_numero::text) <=
p_largeur` — c'est-à-dire strictement en dessous du seuil de chaque caller,
quelle que soit sa largeur configurée — donc `lpad(...)` produit exactement
la même chaîne qu'avant pour tout compteur qui n'a pas encore débordé.
Vérifié empiriquement au-delà de la famille largeur 3 (devis/factures/
commandes, ci-dessus) sur la famille largeur 4 (`employes`, compteur dédié) :
`9999 -> EMP-9999` (inchangé) et `10000 -> EMP-10000` (élargi, aurait été
`EMP-1000` tronqué avant correctif).

## Résultats Fresh

Base entièrement neuve (`gp_numero_fresh`), aucun état résiduel d'un test
précédent : prelude reconstruit, **299 migrations** (298 + `20260922000317`)
rejouées dans l'ordre depuis zéro → **0 erreur**. `\df+ public.next_reference`
confirmé strictement identique (owner `postgres`, `security invoker`, mêmes
`GRANT`/`REVOKE`) à l'état pré-correctif. Le fichier pgTAP dédié, rejoué sur
cette base neuve sans dépendance à aucun état de session antérieur, passe
**15/15**.

Vérification secrets : `grep` (mots-clés `password|secret|api[_-]?key|token|
credential`, insensible à la casse) sur la migration et le test créés — 0
correspondance.

## pgTAP

Suite complète (81 fichiers dont le nouveau, `pg_prove` sur `gp_numero_fresh`) :
**mêmes 18 fichiers en échec que le baseline établi par les missions
précédentes, liste rigoureusement identique (diff vide)** — aucun nouvel
échec introduit par ce correctif. Le nouveau fichier
`gp_v1_numerotation_documents.test.sql` n'apparaît pas dans la liste des
échecs (15/15).

## Non-régression applicative

| Test | Résultat |
| --- | --- |
| `npx tsc --noEmit` | ✅ 0 erreur (aucun fichier TypeScript touché) |
| `npx eslint .` | ✅ 0 erreur, mêmes 5 warnings pré-existants |
| `npx vitest run --no-file-parallelism` | ✅ 1780/1780 (152 fichiers, inchangé) |
| `npm run build` (app Gestion Pro) | ✅ « Compiled successfully » |
| `npm run build` (`apps/tools`) | ❌ bloqué par des variables d'environnement publiques manquantes — limitation pré-existante du bac à sable, sans lien avec ce correctif |

## Hors périmètre — décisions/dettes documentées, non traitées ici

Conformément à la consigne de cette mission :

1. **`avoir` utilise la série `FAC-`** et partage le compteur `type='facture'`
   avec les factures classiques (`simple`/`acompte`/`situation`/`finale`) —
   pas de série dédiée « AVOIR- ». Comportement métier préexistant, revérifié
   inchangé par ce correctif.
2. **Compteur commun facture/acompte/situation/finale/avoir** — même
   remarque, un seul `(entreprise_id, 'facture')` pour les cinq.
3. **Année basée sur `now()` (date d'émission du numéro) plutôt que sur
   `date_emission`** du document — un devis daté fin décembre mais envoyé
   début janvier porte l'année de l'envoi dans son numéro, pas celle de sa
   date d'émission déclarée.
4. **`situations_travaux.numero`** — mécanisme entièrement différent
   (`SELECT COALESCE(MAX(numero),0)+1 ... WHERE entreprise_id=... AND
   devis_id=...`, sans `next_reference`, sans verrou explicite mais protégé
   par `unique(entreprise_id, devis_id, numero)`), non concerné par le bug de
   troncature (pas de `lpad`), non modifié.
5. **`formater_numero_document`** reste du code mort non branché (voir plus
   haut) — une décision ultérieure devra choisir entre le brancher (et
   supprimer la duplication avec `next_reference`) ou le supprimer purement.

## Verdict

**`NUMBERING OVERFLOW FIX QUALIFIED`**

Le correctif est minimal (une fonction, une clause `greatest()`), préserve
strictement tout ce que la mission demandait de préserver (signature,
sécurité, ownership, search_path, grants, logique du compteur, isolation
entreprise, gestion de l'année, préfixes, comportement transactionnel — tous
vérifiés inchangés), corrige réellement et de façon vérifiée le bug
initialement démontré (troncature au-delà de 999/9999 selon la largeur), ne
produit aucun nouvel échec pgTAP, aucune régression applicative, et se
comporte correctement sous charge concurrente réelle (mono-entreprise et
multi-entreprise). Les 13 callers existants sont revérifiés inchangés en deçà
de leur seuil respectif, sans qu'aucun n'ait dû être modifié.
