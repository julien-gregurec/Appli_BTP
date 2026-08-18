# DEVIS-LOCK-V1 — Immutabilité des devis acceptés

Branche `claude/devis-lock-v1`, depuis `claude/avenants-v1-audit` (commit `638d120` — inclut RENTABILITÉ-V1/V1B/V1C, COMMANDES FOURNISSEURS V1/V1B, AVENANTS-V1 audit). Corrige une faille P1 découverte pendant l'audit AVENANTS-V1 : un devis `accepte` restait modifiable/supprimable par écriture directe.

## 1. Faille corrigée

Le verrou `statut='brouillon'` n'existait que dans la RPC `modifier_devis_brouillon`, jamais au niveau table ou RLS. Reproduite empiriquement en Local (session `authenticated`, utilisateur `gerer_devis` légitime) : `UPDATE devis SET montant_ht=...`, `UPDATE devis SET statut='brouillon'`, `INSERT/UPDATE/DELETE lignes_devis`, et `DELETE devis` réussissaient tous sans erreur sur un devis accepté.

## 2. Cartographie des chemins d'écriture (avant correction)

| Chemin | Statut avant ce lot |
|---|---|
| UI (`/devis/[id]/modifier`) | Déjà masquée si `statut≠brouillon` — aucune régression |
| `changerStatutDevisAction` | Gardée côté client par `TRANSITIONS_DEVIS.accepte=[]` (aucune transition proposée) — mais l'action elle-même ne revérifiait rien côté serveur au-delà de RLS |
| `modifier_devis_brouillon` (RPC) | Vérifie déjà `statut='brouillon'` avant d'écrire |
| `dupliquer_devis` (RPC) | Crée un **nouveau** devis brouillon, n'écrit jamais sur l'original |
| `creer_devis_brouillon`/`appliquer_modele_devis` (RPC) | Vérifient déjà `statut='brouillon'` |
| `creer_facture_avancee`/`facturer_situation_travaux`/`creer_situation_travaux` | Lisent le devis, n'écrivent jamais dessus |
| `associerDevisChantierAction` | Autorisait le changement de `chantier_id` sur un devis accepté (seul le passage à `null` était bloqué) |
| **Accès direct table/API** (Supabase client, PostgREST) | **Aucun verrou** — c'est la faille |

Seul le dernier chemin était réellement ouvert ; c'est lui que corrige ce lot.

## 3. Règle métier

- **Brouillon** : modifiable selon permissions (`gerer_devis`), inchangé.
- **Accepté** : immuable sur son contenu contractuel — `statut`, `montant_ht`, `montant_tva`, `montant_ttc`, `client_id`, `chantier_id`, `remise_globale`, `conditions`, `notes_client`, `date_emission`, `date_validite`, `numero`, `entreprise_id`, et toute ligne (`lignes_devis` : insertion, modification, suppression). Suppression du devis lui-même également bloquée.
- **Champs non contractuels, restent modifiables même accepté** : `notes_internes` (note interne, jamais affichée au client), `email_envoye_le`/`email_envoye_a` (traçabilité d'un envoi PDF légitime après acceptation), `updated_at`.
- **Chantier verrouillé** : décision explicite (question posée à l'utilisateur pendant ce lot). La fiche devis permettait auparavant de déplacer un devis accepté vers un autre chantier ; ce comportement est retiré. Le contournement reste la duplication (§7).
- **`envoye`/autres statuts** : aucun changement — non concernés par ce lot, non audités en détail au-delà de la confirmation que `TRANSITIONS_DEVIS` ne permet toujours que des transitions vers l'avant.
- **Retour à `brouillon`** : un devis `accepte` ne peut plus jamais y retourner via une écriture ordinaire (aucun mécanisme de correction administrative créé dans ce lot).

## 4. Mécanisme technique

Deux triggers `BEFORE` (migration `20260818000210_verrou_devis_accepte.sql`), sécurisés côté base — impossibles à contourner par un appel PostgREST direct :

- **`verrou_devis_accepte`** (`before update or delete on public.devis`) : sur DELETE, refuse si `old.statut='accepte'` ; sur UPDATE, refuse si `old.statut='accepte'` et qu'un des champs contractuels listés ci-dessus change (`IS DISTINCT FROM`).
- **`verrou_lignes_devis_accepte`** (`before insert or update or delete on public.lignes_devis`) : relit le `statut`/`entreprise_id` du devis parent côté serveur (jamais de confiance dans une valeur cliente — `lignes_devis` n'a d'ailleurs pas de colonne `entreprise_id` propre), refuse si le devis est accepté **et** que l'appelant est membre actif de cette entreprise. Cette dernière condition évite qu'un utilisateur d'un autre tenant reçoive le message « devis accepté » (qui révélerait l'existence et le statut d'un devis auquel il n'a pas accès) au lieu du message RLS standard — la fonction est `security definer` (pour lire fiablement le devis quel que soit le rôle) et devait donc explicitement re-vérifier la tenance avant de se prononcer.
- Cas `devis introuvable` (cascade de suppression d'un devis brouillon dans la même transaction) : jamais bloqué, un devis accepté ne pouvant de toute façon jamais être supprimé.

## 5. Champs non bloqués — liste exacte

`notes_internes`, `email_envoye_le`, `email_envoye_a`, `updated_at`. Aucun autre champ de `devis` n'est exempté.

## 6. UI ajustée

- `src/app/actions/devis.ts` (`associerDevisChantierAction`) : refuse désormais tout changement de chantier dès que `statut='accepte'` (au lieu de seulement refuser la dissociation), avec message clair : « Ce devis est accepté et ne peut plus changer de chantier. »
- `src/app/(app)/devis/[id]/page.tsx` : le formulaire de changement de chantier est remplacé par un message explicatif quand le devis est accepté (au lieu d'un formulaire qui échouerait).
- `src/app/(app)/chantiers/[id]/page.tsx` : la liste des devis associables exclut désormais les devis déjà acceptés (ils ne peuvent plus changer de chantier).

Aucune erreur PostgreSQL brute n'est exposée : `raise exception` sans code SQLSTATE spécifique produit `P0001`, déjà catégorisé par `src/lib/erreurs-utilisateur.ts` en `conflit_metier` → « Cette opération n'est pas possible dans l'état actuel du document. » — et les trois actions ci-dessus anticipent désormais le cas avant même d'atteindre la base.

## 7. Duplication et facturation — non cassées

- `dupliquer_devis` continue de fonctionner sur un devis accepté : crée un nouveau devis `brouillon` indépendant, librement modifiable, sans lien de parenté stocké (comportement inchangé, confirmé par test).
- Une fois cette copie acceptée à son tour, elle devient verrouillée exactement de la même façon — pas de contournement possible en rechaînant des duplications.
- `creer_facture_avancee` (acompte/finale/avoir) continue de fonctionner depuis un devis accepté verrouillé : le verrou ne bloque que l'écriture sur `devis`/`lignes_devis`, jamais leur lecture.

## 8. RENTABILITÉ-V1C — non cassée

`calculerPrevuRealiseChantiers` lit `devis`/`lignes_devis` en `SELECT` uniquement : un devis accepté verrouillé reste lisible et agrégé normalement dans le CA prévu et les heures prévues, sans aucun effet secondaire.

## 9. Multi-tenant

Vérifié : les policies RLS existantes (`membres devis`, `role_gestion_insert/update/delete`, `lecture_devis_selon_permission`) sont inchangées. Pour `devis` (UPDATE/DELETE), le filtrage RLS `USING` s'applique **avant** que le trigger ne s'exécute — un utilisateur d'un autre tenant ne déclenche jamais le trigger (0 ligne visible). Pour `lignes_devis` (INSERT), le trigger `BEFORE` s'exécute avant l'évaluation RLS `WITH CHECK` — d'où la vérification explicite de tenance dans `verrouiller_lignes_devis_accepte` (§4), pour ne jamais laisser un attaquant cross-tenant recevoir un message différent du message RLS standard.

## 10. Données existantes

Aucune migration de données. Les devis déjà acceptés en Preview/Production ne sont pas réécrits — le verrou ne s'applique qu'aux futures tentatives d'écriture.

## 11. Tests

- **pgTAP** (`supabase/tests/devis_lock_v1.test.sql`, 28 assertions) : brouillon librement modifiable (4) ; devis accepté verrouillé sur montant/suppression/statut/chantier/client/remise (6) ; lignes accepté verrouillées sur INSERT/UPDATE/DELETE (3) ; champs non contractuels épargnés (2) ; no-op sans erreur (1) ; montant intact après les 7 tentatives (1) ; duplication → brouillon → modifiable → acceptée → verrouillée à son tour (4) ; facturation depuis un devis verrouillé (1) ; lecture d'un devis verrouillé (1) ; cascade de suppression d'un devis brouillon (1) ; cross-tenant lecture/écriture (3) ; anon sans privilège (1).
- **Non-régression** : trois fichiers pgTAP préexistants ajustés (pas de logique modifiée, seulement leur cible) car ils s'appuyaient — sans le savoir — sur la faille corrigée pour ajouter des lignes à un devis déjà accepté du fixture partagé :
  - `c6b_premier_client.test.sql` (tests 5-8, permissions RLS génériques sur `lignes_devis`) : redirigés vers un nouveau devis brouillon dédié.
  - `correctif_isolation_devis_client.test.sql` (tests 9-11, contrainte FK client/entreprise) : redirigés vers un devis brouillon existant du même fichier, pour continuer à tester la contrainte FK et non le nouveau verrou.
  - `rentabilite_v1c_previsionnel.test.sql` (fixture, ajout de lignes « main d'œuvre ») : `session_replication_role=replica` autour de cet enrichissement de fixture (pas une action utilisateur simulée).
- **Suite complète** : `npm run test:db` → 436/436 (dont les 28 nouvelles), `npm run test` → 342/342, `npm run typecheck` → 0 erreur, `npm run lint` → 0 erreur (3 avertissements `<img>` préexistants hors périmètre), `npm run build` → succès.

## 12. Scénario empirique complet (§24 du cahier des charges)

Vérifié en Local puis reproduit à l'identique sur Preview (jeu de données jetable, entièrement nettoyé après coup) :

```
Devis 10 000 € → accepté → tentative de passage à 12 000 € → REFUS
                          → tentative de modification de ligne → REFUS
                          → duplication → copie brouillon
                          → copie modifiée à 12 000 € → SUCCÈS
```

## 13. Second devis provisoire (contournement AVENANTS-V1)

Confirmé : devis initial accepté + duplication/nouveau devis accepté sur le même chantier → les deux restent lisibles et s'agrègent normalement dans RENTABILITÉ-V1C (§8), sans lien de parenté créé entre eux (conforme à l'audit AVENANTS-V1, qui documente ce contournement comme pratique de transition avant un futur lot dédié).

## 14. Hors périmètre (rappel explicite)

Aucun développement AVENANTS-V1, aucune refonte devis, aucun versioning, aucune signature électronique. Le garde-fou anti-surfacturation (`creer_facture_avancee`) n'a pas été modifié — seulement vérifié qu'il continue de fonctionner normalement à travers le verrou.

## 15. Sécurité anonyme

Confirmé : `anon` n'a aucun privilège `SELECT` sur `public.devis` (`GRANT` de base absent, inchangé par ce lot) ; aucune fonction sensible n'est redevenue exécutable par `public`/`anon`.

## 16. Déploiement

- **Local** : migration appliquée via `supabase db reset` (toutes les migrations rejouées proprement depuis zéro), suite complète verte.
- **Preview** (`elsatia-preview`, réf. `pgvvpqyjziyapbbkydmc`) : migration **appliquée isolément**, sans `db push` global. Un `--dry-run` a révélé qu'une migration antérieure et totalement hors périmètre (`20260812000200_documents_commerciaux_p9.sql`, colonnes `email_envoye_le`/`email_envoye_a`/`entreprise_snapshot`) n'était **pas encore appliquée sur Preview** malgré son ancienneté — gap pré-existant, non causé par ce lot, **non touché** conformément à la consigne (« ne lance aucune commande globale si des migrations hors périmètre sont absentes »). Vérifié par requête directe (`supabase db query --linked`) que le trigger de ce lot ne référence aucune des colonnes de cette migration hors périmètre (dépendance nulle), donc que son application isolée était sûre. Appliquée via `supabase db query --linked -f <migration>` (API de gestion, sans mot de passe brut), puis l'historique de migration a été mis à jour pour ce seul fichier. Vérification empirique complète rejouée directement sur Preview (montant/lignes bloqués, note interne modifiable), données de test entièrement supprimées ensuite.
- **Point d'attention signalé, non traité dans ce lot** : `20260812000200` devrait être appliquée séparément sur Preview — sans elle, les fonctionnalités P9 (traçabilité d'envoi email, snapshot d'identité légale sur facture) ne fonctionnent probablement pas sur cet environnement malgré leur statut « clos » dans `REGISTRE_CENTRAL.md`.
- **Code applicatif** : `src/app/actions/devis.ts`, `src/app/(app)/devis/[id]/page.tsx`, `src/app/(app)/chantiers/[id]/page.tsx` déployés sur Vercel Preview (`elsatia-preview`).

## 17. Documentation liée

`docs/commercial/AVENANTS_V1_CHECKLIST.md` mis à jour pour marquer le risque « devis accepté modifiable » comme corrigé.
