# Procédure support — demande de suppression de données (RGPD)

Traitement d'une demande d'effacement (RGPD art. 17) ou d'accès/portabilité (art. 15 & 20) reçue sur `support@elsatia.fr`.

Engagements publics correspondants : `docs/juridique/politique-confidentialite.md` §4 et §7, `docs/juridique/cgv.md` art. 10, `docs/juridique/dpa-entreprises-clientes.md`. Registre : `docs/juridique/rgpd-registre-des-traitements.md`.

**Délai de réponse annoncé au public : un mois** (politique de confidentialité §7). Le compteur démarre à la réception de la demande, pas à la fin de la vérification d'identité.

---

## 1. Qualifier la demande AVANT toute action

Les trois questions à trancher en premier, parce qu'elles changent complètement le traitement :

**a) Qui demande, et à quel titre ?**

| Demandeur | Rôle RGPD | Qui traite |
|---|---|---|
| Entreprise cliente (le gérant, pour son compte ELSATIA) | Elle est **responsable de traitement** pour ses propres données métier ; ELSATIA est sous-traitant | ELSATIA traite (§3) |
| Salarié d'une entreprise cliente, pour ses données salarié | La **personne concernée** ; le responsable est **son employeur**, pas ELSATIA | **Rediriger vers l'employeur** (§2) |
| Client final d'une entreprise cliente | Idem | **Rediriger vers l'entreprise cliente** |
| Visiteur du site / prospect | ELSATIA est responsable de traitement | ELSATIA traite |

**Ne jamais supprimer les données d'un salarié à la demande directe de ce salarié.** ELSATIA est sous-traitant : agir sans instruction de l'employeur reviendrait à altérer les données d'un responsable de traitement tiers. C'est le point d'erreur le plus probable de cette procédure.

**b) Périmètre : compte utilisateur, personne, ou entreprise entière ?** Voir §3.

**c) Est-ce vraiment une demande d'effacement ?** Une demande d'export (art. 15/20), de rectification, ou une simple résiliation commerciale ne se traitent pas de la même façon. En cas d'ambiguïté, faire préciser par écrit.

## 2. Réponse type — demande d'un salarié ou d'un client final

> Votre demande concerne des données traitées par [entreprise cliente], qui en est responsable. ELSATIA agit uniquement comme prestataire technique pour son compte et ne peut pas y donner suite directement. Merci d'adresser votre demande à [entreprise cliente], qui dispose des outils nécessaires dans son espace. Nous restons à sa disposition pour l'accompagner.

Consigner la demande et la redirection dans le ticket. Ne pas transmettre la demande à l'entreprise cliente sans l'accord du demandeur.

## 3. Vérification d'identité

Mêmes exigences qu'en cas de perte d'accès : voir `docs/commercial/SUPPORT_PERTE_ACCES_V1.md` §2. Une suppression est **irréversible** : le niveau de preuve exigé est au moins aussi élevé.

La politique de confidentialité §7 prévoit qu'une **pièce d'identité peut être demandée en cas de doute raisonnable**. Si elle est demandée : ne la conserver que le temps de la vérification, la détruire ensuite, et le noter dans le ticket. Ne jamais la stocker dans l'application.

## 4. Ce que l'application sait déjà faire

| Besoin | Fonction | Où | Effet |
|---|---|---|---|
| Export des données de l'entreprise (art. 15 & 20) | `exporter_donnees_entreprise` | `/parametres/donnees` | Parcourt dynamiquement toutes les tables portant `entreprise_id` ; exclut les colonnes sensibles (secrets, jetons) |
| Effacement d'une personne salariée (art. 17) | `anonymiser_employe` | Fiche employé | **Anonymise** : neutralise l'identité et vide les colonnes à caractère personnel, en **conservant** les enregistrements exigés par la loi (pointages, paie, comptabilité) |
| Demande de suppression du compte entreprise | `demander_suppression_entreprise` | `/parametres/donnees` | Enregistre la demande (auto-service, confirmation par saisie du nom de l'entreprise). **N'exécute aucune purge.** |
| Annulation de cette demande | `annuler_suppression_entreprise` | `/parametres/donnees` | Revient en arrière tant que la purge n'a pas eu lieu |

**Point de vigilance opérateur :** `demander_suppression_entreprise` n'est qu'un enregistrement d'intention. **La purge effective est une opération supervisée, manuelle, hors application.** Ne jamais confirmer à un client que ses données sont supprimées au seul motif que la demande apparaît enregistrée.

## 5. Déroulé d'une demande d'effacement (entreprise cliente)

1. **Réception** — accuser réception sous 72 h, rappeler le délai d'un mois.
2. **Qualification** (§1) et **vérification d'identité** (§3).
3. **Export préalable** — proposer systématiquement l'export (§4) avant toute suppression, et attendre confirmation que le client l'a récupéré. Une suppression sans export proposé est une mauvaise pratique.
4. **Information sur les conservations obligatoires** — annoncer explicitement, avant d'agir, ce qui ne sera **pas** supprimé (§6).
5. **Enregistrement de la demande** — par le client depuis `/parametres/donnees`, ou consigné dans le ticket s'il est arrivé par e-mail.
6. **Délai de réversibilité** — les CGV art. 10 accordent **30 jours** au client pour récupérer ses données en fin de contrat. Ne pas purger avant l'expiration de ce délai, sauf demande écrite et explicite du client d'y renoncer.
7. **Exécution** — purge/anonymisation supervisée (§7).
8. **Confirmation écrite** au client : ce qui a été supprimé, ce qui a été conservé et sur quel fondement, à quelle date.
9. **Journalisation** (§8).

## 6. Ce qui n'est PAS supprimé, et pourquoi

| Catégorie | Traitement | Fondement |
|---|---|---|
| Données de facturation ELSATIA (factures d'abonnement, pièces comptables) | **Conservées** | Obligation comptable — 10 ans, `docs/juridique/politique-confidentialite.md` §4 |
| Données de paie et pointages des salariés du client | **Conservées, anonymisées** quant à l'identité | Obligations sociales de l'employeur — **durées À CONFIRMER EXPERT-COMPTABLE** |
| Données nécessaires à la constatation/exercice/défense d'un droit en justice | **Conservées** le temps utile | RGPD art. 17.3.e — **périmètre et durée À CONFIRMER AVOCAT** |
| Sauvegardes | **Non purgées unitairement** | Voir §7 |
| Journaux techniques et d'audit plateforme | **Conservés** | Sécurité et traçabilité — **durée À CONFIRMER** |

Les durées marquées **À CONFIRMER** ne doivent pas être annoncées comme fermes à un client tant qu'elles n'ont pas été validées. Formuler alors : « conservées pour la durée légale applicable », sans chiffrer.

## 7. Sauvegardes — position à tenir

Les sauvegardes ne sont pas purgées ligne à ligne : ce n'est techniquement pas praticable, et la CNIL admet ce raisonnement dès lors qu'il est expliqué et borné.

Position à communiquer : les données supprimées de la base active **ne sont plus accessibles ni exploitées** ; elles subsistent dans les sauvegardes jusqu'à leur rotation naturelle, et seraient re-supprimées si une restauration devait avoir lieu.

**À CONFIRMER avant commercialisation :** la durée de rétention réelle des sauvegardes managées Supabase, qui dépend du plan souscrit. Ce point est dépendant de la mise en place du compte bancaire ELSATIA → Supabase Production Pro → backup managé, non réalisée à ce jour. Tant qu'il n'est pas tranché, **ne pas annoncer de durée de rotation chiffrée**.

## 8. Journalisation

À conserver pour chaque demande, dans le ticket :

- date de réception, demandeur, qualité (§1), entreprise concernée ;
- éléments de vérification d'identité retenus, et sort réservé à une éventuelle pièce d'identité ;
- périmètre demandé et périmètre réellement exécuté ;
- export proposé / récupéré, avec dates ;
- catégories conservées et fondement (§6), telles que communiquées au client ;
- date d'exécution, personne l'ayant exécutée, date de confirmation au client.

Traces automatiques disponibles côté application : `historique_mutations_plateforme`, `plateforme_journal_actions` (voir `docs/operations/AUDIT_LOG_OPERATEUR_V1.md`).

## 9. Limites connues (non fermées à ce jour)

- **Pas de purge automatisée** d'une entreprise : `demander_suppression_entreprise` enregistre l'intention, l'exécution est manuelle et supervisée. Aucun script de purge validé n'existe à ce jour.
- **Pas de registre applicatif des demandes RGPD** : le suivi repose sur les tickets support.
- **Pas d'anonymisation d'un compte utilisateur ELSATIA isolé** (distinct de la fiche salarié) exposée en libre-service.
- Les durées de conservation marquées **À CONFIRMER** (§6, §7) restent à valider par un avocat et un expert-comptable avant d'être opposées à un client.
