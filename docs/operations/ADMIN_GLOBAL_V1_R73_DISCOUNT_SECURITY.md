# ADMIN-GLOBAL-V1-R7.3 — chaîne canonique de sécurité des remises

Ce document décrit l’état canonique cumulé des protections R7.1, R7.2 et R7.3. Il complète
les rapports historiques sans les remplacer.

## R7.1 — garde structurelle des colonnes

La migration append-only `20260827000243_discount_column_guard_r71.sql` réserve l’écriture des
huit colonnes `entreprises.remise_*` au rôle interne F4 `elsatia_discount_f4_writer`. Les rôles
client, plateforme, AAL2 et `service_role` ne peuvent pas contourner cette frontière par CRUD,
UPSERT, wrapper ou fonction générique.

## R7.2 — attestation asymétrique de l’état Stripe

La migration append-only `20260828000244_stripe_state_attestation_r72.sql` remplace la preuve
forgeable par une attestation Ed25519. La clé privée reste exclusivement dans l’environnement
du serveur d’attestation ; PostgreSQL ne conserve que la clé publique et vérifie la signature.
Le payload lie l’état observé à l’environnement Stripe, l’action, l’opération, l’intention,
l’entreprise, l’abonnement, la tentative, la génération, une expiration et un identifiant de
preuve anti-replay. Un registre vide échoue fermé.

## R7.3 — observation Stripe stricte et non-lossy

La migration append-only `20260828000245_stripe_discount_observation_r73.sql` porte
l’attestation en version 2. Le serveur relit l’abonnement avec `expand[]=discounts`, puis un
parser runtime unique classe l’état en `absent/0` ou `present/1` complètement résolu. Une
référence `di_…` non développée, un objet incomplet, une source inconnue ou plusieurs remises
échouent fermés et ne sont jamais transformés en absence.

L’attestation signe la présence, la cardinalité, le Discount ID, le type et l’identifiant de
source ainsi que le coupon. F4 exige `present/1` et le coupon attendu pour APPLY ; REMOVE et
EXPIRATION_SYNC exigent `absent/0` avec toutes les identités de remise nulles. Après un DELETE,
un nouveau GET Stripe puis une dernière relecture dédiée sont obligatoires avant signature.
Le webhook utilise le même parser et ne traite jamais son payload historique comme source
d’autorité de la remise.

## Exploitation

Toute anomalie doit être reprise par la saga sous verrou et par F4. Il est interdit de réparer
les colonnes `remise_*` par écriture directe, de provisionner une clé privée dans PostgreSQL ou
d’utiliser un payload webhook comme preuve de l’état Stripe. Le provisionnement des clés, les
tests Stripe réels et toute migration distante relèvent d’un plan Preview/Production séparé.
