# Studio : projet Supabase partagé ou dédié — page de décision

Décideur : Julien · Date : 2026-09-26 · Détail et preuves :
[`ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md`](ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md)
(les numéros « § » renvoient à ce dossier). Studio n'a encore **aucune donnée de Production**.

---

## CHOIX A : SHARED — Studio reste dans le projet Supabase partagé

**What changes**
- Q-004 (« Studio a son propre projet ») est annulée.
- La suppression de compte Studio est réécrite pour ne plus supprimer le compte ELSATIA commun.
- Les réglages Auth voulus par Studio (confirmation e-mail, 12 caractères, durée des jetons)
  deviennent une décision **commune** à toutes les apps.

**What stays**
- Un seul compte ELSATIA (même identifiant partout), un seul projet, une chaîne de migrations.
- Droits Studio lisibles par jointure SQL, comme Tools.
- Pas de SSO : même mot de passe, une connexion par app.

**Risks**
- Une fuite de la clé `service_role` du web Studio ou du worker vidéo donne accès à **toutes**
  les données ELSATIA (paie, factures, clients…) (§4.1).
- Stockage, egress et charge vidéo sont mutualisés avec GP ; une restauration de sauvegarde ne
  peut pas viser Studio seul (§2.1).

**Operational cost**
- 0 projet Supabase de plus ; un tableau de bord, une config Auth. Compute partagé
  éventuellement à augmenter. Coût vidéo non séparable (§7).

**Reversibility**
- Aujourd'hui : rien à migrer. Après commercialisation, passer à B coûte environ 2-3 semaines :
  comptes, lignes, vidéos, sessions coupées, communication client (§8).

**Implementation remaining** (≈ 3-5 j, plus 3-5 j si la clé du worker est isolée derrière une API)
- Suppression Studio sans `deleteUser` · relais de réinitialisation du mot de passe ·
  arbitrage des réglages Auth globaux · RPC de révocation des sessions · portage du lot post-H
  à la racine (§8.3).

---

## CHOIX B : DEDICATED — Studio a son propre projet Supabase

**What changes**
- Q-004 est confirmée. `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` reçoit une exception Studio.
- +2 projets Supabase (Preview, Production), une seconde chaîne de migrations.
- Connexion par « Continuer avec mon compte ELSATIA » (pont I1, prouvé) ; I2 (OIDC, sous
  réserve de la plateforme) ou I3 (liaison sans SSO) sont les alternatives (§3.8).

**What stays**
- Un seul compte ELSATIA pour l'utilisateur ; Stripe et le catalogue restent côté plateforme.
- La RLS Studio, les buckets et le worker restent identiques ; seul leur projet change.

**Risks**
- Nouveau composant critique : le pont d'identité. Si la plateforme est indisponible, personne
  n'entre nouvellement dans Studio (les sessions ouvertes continuent) (§6 F1).
- Sans webhook de révocation, un compte désactivé centralement **garde sa session Studio**
  (§5 R1). Le webhook et sa réconciliation sont obligatoires.
- Une fuite de la clé privée du pont permettrait d'entrer dans Studio (pas dans GP).

**Operational cost**
- 2 projets de plus (ordre de grandeur : dizaines de $/mois hors PITR, **tarifs à revérifier**).
- Deux configs Auth, deux tableaux de bord, rotations de clés séparées, un webhook à surveiller
  (§7).

**Reversibility**
- Aujourd'hui : rien à migrer. Après commercialisation, revenir à A coûte un effort comparable ;
  le remappage des comptes est facilité par la table de liens du pont (§8.2).

**Implementation remaining** (≈ 8,5-11,5 j avec I1)
- Création des 2 projets · retrait des migrations Studio de la racine · CI double · pont I1
  (route handoff, JWKS, échange, 3 tables) · RPC de sessions + webhook + réconciliation ·
  amendement du contrat de compte commun · portage du lot post-H dans `apps/studio/supabase`
  (§8.3).

---

## Identique dans les deux choix

- Bannir un utilisateur ne coupe pas sa session : il faut supprimer ses sessions ; un jeton déjà
  émis reste valable jusqu'à son expiration (3600 s aujourd'hui) (§5).
- Les 7 suites pgTAP Studio rouges et la sauvegarde séparée des vidéos sont à traiter.
- Chaque jour sans décision laisse le lot post-H bloqué hors du tronc.

---

**Réponse attendue (une ligne)** : `A` · `B + I1` · `B + I2` · `B + I3`
