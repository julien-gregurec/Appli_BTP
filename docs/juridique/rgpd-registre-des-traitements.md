# Registre des activités de traitement

_Document interne — Article 30 du RGPD — à conserver et tenir à jour._
_Responsable : [Julien GREGUREC], entrepreneur individuel — [contact@liria… ] — Dernière mise à jour : [JJ/MM/AAAA]_

Ce registre recense les traitements réalisés **en tant que responsable de traitement**. Les traitements réalisés pour le compte des entreprises clientes (sous-traitance) relèvent du DPA et du registre du sous-traitant (ci-dessous, §7).

---

## 1. Gestion des comptes et des utilisateurs

- **Finalité** : créer et gérer les comptes, permettre l'accès au Service.
- **Base légale** : exécution du contrat.
- **Personnes concernées** : représentants et utilisateurs des entreprises clientes.
- **Catégories de données** : identité, e-mail, téléphone, identifiants de connexion, journaux.
- **Destinataires** : Éditeur, hébergeurs (Supabase, Vercel).
- **Durée** : durée du contrat + 30 jours.
- **Sécurité** : mots de passe chiffrés, HTTPS, contrôle d'accès, cloisonnement par entreprise.

## 2. Facturation et gestion des abonnements

- **Finalité** : facturer l'abonnement, encaisser, tenir la comptabilité.
- **Base légale** : exécution du contrat / obligation légale.
- **Personnes concernées** : clients (entreprises et leurs représentants).
- **Catégories de données** : coordonnées, offre, historique de paiement, identifiant client Stripe.
- **Destinataires** : Éditeur, Stripe, expert-comptable le cas échéant.
- **Durée** : 10 ans (obligations comptables).
- **Sécurité** : données bancaires non stockées par l'Éditeur (gérées par Stripe).

## 3. Support client

- **Finalité** : répondre aux demandes d'assistance.
- **Base légale** : exécution du contrat / intérêt légitime.
- **Personnes concernées** : utilisateurs sollicitant le support.
- **Catégories de données** : identité, e-mail, contenu des échanges, pièces jointes.
- **Destinataires** : Éditeur.
- **Durée** : durée du contrat + 1 an.

## 4. Prospection commerciale (B2B)

- **Finalité** : présenter l'offre à des professionnels.
- **Base légale** : intérêt légitime, avec droit d'opposition et désinscription.
- **Personnes concernées** : prospects professionnels.
- **Catégories de données** : nom, e-mail professionnel, entreprise, fonction.
- **Durée** : 3 ans après le dernier contact.

## 5. Sécurité et journalisation technique

- **Finalité** : garantir la sécurité, détecter et traiter les incidents.
- **Base légale** : intérêt légitime / obligation de sécurité.
- **Catégories de données** : adresse IP, journaux de connexion et d'erreur.
- **Durée** : 6 à 12 mois.

## 6. Cookies strictement nécessaires

- **Finalité** : authentification et maintien de session.
- **Base légale** : nécessaire au fonctionnement (exemption de consentement).
- **Durée** : session.

## 7. Renvoi — Traitements en sous-traitance

Les données saisies par les entreprises clientes (leurs clients, salariés, chantiers, documents, photos) sont traitées **pour leur compte** ; l'Éditeur agit en sous-traitant. Voir `dpa-entreprises-clientes.md` et `rgpd-sous-traitants.md`.

---

## Mesures de sécurité générales (transversales)

- Chiffrement en transit (HTTPS/TLS) et des secrets ; mots de passe hachés.
- Cloisonnement des données par entreprise (règles de sécurité au niveau base de données).
- Contrôle d'accès par rôles et permissions.
- Sauvegardes automatiques régulières.
- Journalisation des accès et des erreurs ; supervision.
- Sous-traitants sélectionnés pour leurs garanties (CCT, DPF).

## En cas de violation de données

Notification à la CNIL sous **72 heures** si risque pour les personnes ; information des personnes concernées si risque élevé. Tenue d'un registre interne des violations.
