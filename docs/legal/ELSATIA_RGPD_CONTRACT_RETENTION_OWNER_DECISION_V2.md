# ELSATIA — RGPD : conservation des contrats acceptés — décision du propriétaire (V2)

| | |
|---|---|
| Objet | Paramètres de conservation de la stratégie **déjà retenue** `conserver_contrat_minimise` (décision du 2026-09-26, migration `20260926000504`) |
| État actuel | **Non actif (fail-closed).** Aucune durée, aucun point de départ, aucun choix de photos n'est enregistré. La purge RGPD d'une entreprise qui a des devis ou avenants acceptés s'arrête sur ces contrats, sans rien supprimer, avec la cause `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT`. |
| Dossier technique | `docs/qualification/ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2.md` (inventaire des données conservées champ par champ, fonctionnement, preuves) |
| À remplir par | Le propriétaire, après avis de son conseil |

> Ce document ne contient **aucune recommandation**. Les options listées sont celles que
> l'application sait calculer ; aucune n'est présentée comme juridiquement préférable. Les
> valeurs 1 an / 5 ans / 10 ans qui apparaissent dans les tests techniques sont des paramètres
> de test, pas des propositions.

Les trois champs ci-dessous sont **tous obligatoires**. S'il en manque un seul, la purge reste
fermée.

---

## A. Durée de conservation

Durée pendant laquelle l'instantané minimisé d'un contrat accepté est conservé après la purge
de l'entreprise cliente, comptée à partir du point de départ (B).

| Contrainte technique | |
|---|---|
| Format | Années, mois et/ou jours entiers (ex. `N years`, `N months`, `N years M months`). Pas d'heures. |
| Calcul | Dernier jour conservé = point de départ + durée (jour civil, inclus). La suppression devient possible le lendemain à 00:00, heure de Paris. |
| Une seule durée | La même durée s'applique aux devis et aux avenants. |

**Décision A — durée :** `______________________`

---

## B. Point de départ de la durée

Événement à partir duquel la durée (A) court. L'application sait calculer les points de départ
suivants. Chaque date est figée dans l'instantané au moment de la purge et n'est plus recalculée.

| Code | Point de départ | Donnée utilisée | Limite connue |
|---|---|---|---|
| `date_contrat` | Date du contrat | Devis : date d'émission. Avenant : date d'acceptation (à défaut, de création). | Toujours disponible. |
| `acceptation` | Acceptation / « signature » | Avenant : date d'acceptation enregistrée. Devis : trace « devis accepté » du journal d'activité. | L'acceptation d'un devis est une saisie interne, sans signature du client ; la trace du journal peut manquer. |
| `fin_chantier` | Fin du chantier | Date de fin réelle du ou des chantiers rattachés au contrat. | Indéterminable si un chantier rattaché n'a pas de fin réelle saisie, ou s'il n'y a pas de chantier. |
| `reception_travaux` | Réception des travaux | Date de réception saisie dans Réserves pour chaque chantier rattaché. | Indéterminable sans Réserves ou sans réception saisie. Gestion Pro seul ne suit pas la réception. |
| `derniere_facture` | Dernière facture | Date d'émission de la dernière facture émise rattachée au devis (acomptes, situations, finales et avoirs compris). | Indéterminable si le contrat n'a jamais été facturé. |
| `dernier_paiement` | Dernier paiement | Date du dernier règlement enregistré sur ces factures. | Indéterminable sans paiement enregistré. |
| `demande_suppression` | Fin de la relation avec le client Elsatia | Date de la demande de suppression du compte de l'entreprise. | Indéterminable si la suppression a été programmée sans demande enregistrée. |
| — | Résiliation du contrat | **Non disponible** : l'application n'enregistre aucune résiliation de devis ou d'avenant. | Demanderait un développement préalable. |

**Décision B1 — point(s) de départ :** `______________________`
(un code, ou plusieurs codes : dans ce cas la durée part de la date **la plus tardive** d'entre eux)

**Décision B2 — si la date n'est pas déterminable pour un contrat :**

- [ ] refuser la purge de ce contrat et de l'entreprise (l'entreprise reste non purgée tant que la situation n'est pas réglée) ;
- [ ] utiliser à la place le point de départ : `______________________` (un code du tableau).

---

## C. Pièces et photos du devis

Un devis peut porter des pièces jointes. L'application n'accepte que des **photos** et des
**notes vocales** (pas de scans signés).

| Pièce | Ce qui est conservé dans tous les cas | Ce qui dépend de la décision |
|---|---|---|
| Photos (imprimées sur le PDF du devis) | Nom du fichier, légende, type, taille | Le **fichier image** lui-même |
| Notes vocales (non imprimées) | Leur nombre seulement | — (jamais conservées) |

**Décision C — fichiers photo des devis acceptés :**

- [ ] conservés avec l'instantané, pendant la durée A ;
- [ ] non conservés (supprimés à la purge de l'entreprise).

---

## Validation

| | |
|---|---|
| Référence de la décision (à citer dans la migration d'activation) | `______________________` |
| Avis du conseil (référence, date) | `______________________` |
| Décidé par | `______________________` |
| Date | `______________________` |

### Après signature (information)

L'activation tient en une instruction, dans une migration d'une ligne qui cite la référence
ci-dessus. Aucune autre migration métier n'est nécessaire :

```sql
select platform.definir_politique_purge_contrats(
  'conserver_contrat_minimise', '<référence de la décision>',
  interval '<A>', <C : true = photos conservées | false = non conservées>,
  array['<B1>'], <B2 : '<code de repli>' | null = refuser>);
```

La même migration met à jour le contrôle 14 de `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`,
qui signale aujourd'hui toute durée activée comme un écart bloquant.
Les textes (politique de confidentialité, registre des traitements, DPA) ne mentionnent pas
encore cette conservation : leur mise à jour relève de la même décision.
