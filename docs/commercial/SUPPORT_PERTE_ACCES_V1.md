# Procédure support — perte totale d'accès

Complète `docs/commercial/SUPPORT_PREMIERS_CLIENTS.md` (canal, priorités, modèle de ticket) pour le cas particulier d'un client qui ne peut plus se connecter du tout.

Canal : `support@elsatia.fr`. Priorité : **P1** par défaut, **P0** si toute l'entreprise cliente est bloquée.

---

## 1. Règles absolues

Le support ne demande **jamais**, et n'accepte jamais si on les lui envoie spontanément :

- un mot de passe ;
- un code TOTP à 6 chiffres ;
- une graine (seed) TOTP, un QR code d'enrôlement, un code de secours ;
- une clé d'API, un secret webhook, un jeton de session.

Si un client transmet spontanément l'un de ces éléments : **ne pas le réutiliser**, lui demander de considérer le secret comme compromis et de le renouveler, et le signaler dans le ticket. Un secret reçu par e-mail est un secret brûlé.

Le support n'a par ailleurs **aucun** moyen technique de :

- lire ou choisir le mot de passe d'un client (Supabase Auth ne stocke que des empreintes) ;
- retirer lui-même le second facteur (MFA) d'un utilisateur — voir §4 ;
- se connecter « à la place » d'un utilisateur.

## 2. Vérification d'identité — préalable à toute action

Aucune action n'est engagée avant que **les quatre points** suivants soient établis, depuis les données déjà présentes dans l'espace plateforme (`/plateforme`) — jamais depuis ce que le demandeur affirme :

1. **L'entreprise existe** et le demandeur la nomme correctement (nom, et référence interne ou code d'adhésion).
2. **Le demandeur est rattaché à cette entreprise** : son adresse e-mail correspond à un compte de l'entreprise (`/plateforme` → entreprise → membres).
3. **Le demandeur est légitime pour la demande** : gérant / administrateur d'entreprise pour une demande touchant un autre compte que le sien ; sinon, il ne peut demander que pour lui-même.
4. **La demande arrive depuis un canal cohérent** : l'adresse e-mail expéditrice est celle du compte, ou une adresse déjà connue de l'entreprise cliente.

Si l'un des quatre points manque, **on n'agit pas** : on demande le complément, ou on escalade (§6).

Élément de contrôle supplémentaire recommandé quand un doute subsiste : demander un élément que seul un membre réel connaît et que l'on peut recouper dans l'application (numéro d'un devis récent, nom d'un chantier en cours, montant d'une facture). Ne jamais accepter un élément que le demandeur pourrait lire dans un e-mail transféré.

## 3. Cas — mot de passe perdu, boîte mail accessible

**Voie normale, à privilégier systématiquement : l'auto-service.** Diriger le client vers `/mot-de-passe-oublie`. Le support n'a rien à faire.

Si l'auto-service échoue (e-mail non reçu après vérification des indésirables) :

1. Vérifier l'identité (§2).
2. `/plateforme` → entreprise concernée → **Réinitialiser le mot de passe**, en saisissant l'adresse exacte du compte et un **motif d'au moins 5 caractères**.
3. L'application vérifie elle-même que l'adresse correspond bien à un compte **de cette entreprise** (refus explicite sinon) et journalise la demande dans `plateforme_reinitialisations_mot_de_passe` (entreprise, utilisateur, e-mail, motif, auteur).
4. Le client reçoit un lien de réinitialisation **sur sa propre adresse**. Le support ne voit jamais le nouveau mot de passe.

Le lien part toujours vers l'adresse du compte : cette procédure ne permet **pas** de rediriger un accès vers une autre adresse.

## 4. Cas — second facteur (MFA/TOTP) perdu

**Le support ne peut pas retirer un facteur MFA vérifié.** La suppression exige une session déjà authentifiée au niveau AAL2 (`peutSupprimerFacteur`, `src/lib/auth/mfa.ts`) — c'est-à-dire qu'il faut déjà pouvoir passer le MFA pour le retirer. C'est une protection voulue, pas un défaut.

Conséquences, à annoncer clairement au client :

- Si l'utilisateur a **un autre appareil ou une autre application TOTP** encore synchronisée : l'utiliser.
- Sinon, l'accès de ce compte est **définitivement bloqué en l'état**. La seule sortie est une **intervention administrateur sur le compte Auth**, qui n'est pas exposée dans l'application (§6).

Contournement immédiat quand l'entreprise n'est pas bloquée dans son ensemble : un **autre administrateur de l'entreprise** peut créer/réactiver un compte pour la personne concernée et reprendre la main sur ses accès métier, pendant que le cas MFA est traité.

Cas particulier — **administrateur plateforme unique** : le dernier administrateur `total` actif ne peut pas retirer son propre dernier facteur vérifié. C'est pour cette raison qu'il faut **au moins deux administrateurs plateforme `total` avec MFA actif** avant la mise en service commerciale.

Depuis ELSATIA-GP-PLATFORM-SECOND-ADMIN-OPERABILITY-P1, ce second administrateur se crée **entièrement depuis `/plateforme` → « Équipe plateforme »**, par le cycle *déclarer → rattacher → activer* : aucune intervention SQL n'est requise, et donc aucune escalade §6 pour ce seul motif. Procédure détaillée : `docs/operations/PLATFORM_ADMIN_ACTIVATION_RUNBOOK.md`. Chaque étape exige le rôle `total` et une session AAL2 ; l'auto-rattachement et l'auto-activation sont refusés par la base.

Cas particulier — **propriétaire global ELSATIA** (`julien@elsatia.fr`, unique ligne marquée `proprietaire`) : son identité ne peut pas être révoquée depuis l'écran, et la base refuse par ailleurs de révoquer le dernier administrateur `total` actif. S'il perd son MFA, aucun chemin applicatif n'existe : c'est une escalade §6 systématique. Raison de plus pour que le second administrateur `total` existe **avant** la mise en service.

## 5. Cas — boîte mail inaccessible

Sans accès à la boîte mail, **aucune** procédure de l'application ne fonctionne : réinitialisation, invitation et vérification passent toutes par l'e-mail.

Marche à suivre :

1. Vérifier l'identité (§2) — avec une exigence renforcée, puisque le canal habituel est justement celui qui manque.
2. Si un **second administrateur de l'entreprise** est disponible : c'est lui qui traite. Il peut modifier l'adresse e-mail du compte concerné, ou désactiver puis réinviter la personne sur une nouvelle adresse. **C'est la voie normale et de loin la plus sûre.**
3. Si **aucun** second administrateur n'existe : escalade (§6). Ne jamais modifier une adresse e-mail de compte sur la seule foi d'un message entrant — c'est le scénario type de prise de contrôle d'un compte.

## 6. Escalade

Escalader à l'exploitation ELSATIA (responsable technique / titulaire des accès Supabase) quand :

- le MFA est perdu et aucun autre facteur n'est disponible (§4) ;
- la boîte mail est inaccessible et il n'existe pas de second administrateur (§5) ;
- l'entreprise cliente n'a plus **aucun** administrateur joignable ;
- le propriétaire global ELSATIA a perdu son second facteur (§4) ;
- un doute sérieux subsiste sur l'identité du demandeur.

L'escalade doit contenir : entreprise, compte concerné, ce qui a été vérifié au titre du §2, ce qui a déjà été tenté, l'impact (nombre de personnes bloquées, depuis quand).

Ce qui est fait au niveau exploitation (hors application, sur la console Supabase) sort de cette procédure et reste soumis à `docs/runbooks/ELSATIA_RELEASE_GOVERNANCE_V1.md`. **À CONFIRMER** avant commercialisation : désigner nommément qui détient cette capacité et sous quelle double validation.

## 7. Traçabilité

À conserver pour chaque demande de perte d'accès, dans le ticket :

- date/heure, demandeur, entreprise, compte concerné ;
- éléments de vérification d'identité retenus (§2) ;
- action réalisée, ou refus et son motif ;
- escalade éventuelle et sa suite.

Traces automatiques déjà produites par l'application, à citer en référence :

| Trace | Table | Contenu |
|---|---|---|
| Réinitialisation déclenchée par la plateforme | `plateforme_reinitialisations_mot_de_passe` | entreprise, utilisateur, e-mail, motif, auteur, date |
| Mutations plateforme (support, facturation, entreprise, multi-app) | `historique_mutations_plateforme` | domaine, action, objet, auteur, avant/après |
| Actions plateforme (rôles, remises, snapshots) | `plateforme_journal_actions` | acteur, action, cible, détails |

Voir `docs/operations/AUDIT_LOG_OPERATEUR_V1.md` pour la carte complète des journaux.

## 8. Limites connues (non fermées à ce jour)

- Pas de codes de secours (recovery codes) à l'enrôlement MFA : c'est ce qui rend le §4 aussi rigide. **Amélioration produit identifiée, non planifiée.**
- Pas de procédure de récupération d'entreprise « sans aucun administrateur » exposée dans l'application : traitée uniquement par escalade.
- Aucun e-mail de notification n'est envoyé au titulaire lorsqu'un administrateur plateforme déclenche une réinitialisation (la demande est journalisée, mais le titulaire ne reçoit que le lien Supabase standard).
