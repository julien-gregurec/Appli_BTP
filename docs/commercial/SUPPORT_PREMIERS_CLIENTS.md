# Procédure support — premiers clients ELSATIA

Procédure interne pour traiter les demandes des premiers clients réels. Aucun SLA contractuel n'est promis ici — ces délais sont un usage interne, pas un engagement client tant qu'il n'a pas été validé juridiquement et communiqué explicitement dans un contrat.

## Canal principal

`support@elsatia.fr` — adresse confirmée opérationnelle (voir `docs/organisation/PREPARATION_JURIDIQUE.md`, lot P14).

## Catégories de priorité

| Niveau | Définition |
|---|---|
| **P0** | Application inaccessible, perte de données, incident de sécurité. |
| **P1** | Fonction essentielle bloquée (devis, factures, pointage, connexion pour une partie des utilisateurs). |
| **P2** | Fonction secondaire en défaut, contournement possible. |
| **P3** | Question d'usage, demande d'amélioration. |

## Informations à demander systématiquement

- Nom de l'entreprise cliente et de l'utilisateur concerné.
- Rôle/poste de l'utilisateur dans l'application.
- URL exacte où le problème se produit.
- Heure précise de l'incident.
- Navigateur et appareil (desktop/mobile/tablette).
- Capture d'écran si possible.
- Impact réel : combien de personnes bloquées, depuis quand.

## Délais de traitement internes (usage interne uniquement, non contractuel)

- **P0** : traitement immédiat.
- **P1** : priorité haute, traité avant toute tâche non urgente.
- **P2** : planifié, traité dans les jours suivants.
- **P3** : backlog, réponse ou conseil sans urgence.

Ne jamais communiquer ces délais comme un engagement contractuel (« SLA ») à un client tant qu'ils n'ont pas été validés juridiquement et intégrés aux CGV.

## Modèle de ticket bug

Champs à renseigner pour tout bug réel remonté par un client :

- **Client** : nom de l'entreprise cliente.
- **Utilisateur** : personne ayant remonté le problème, rôle.
- **Environnement** : navigateur, appareil, version le cas échéant.
- **URL** : page exacte concernée.
- **Reproduction** : étapes précises pour reproduire le problème.
- **Attendu** : comportement normal attendu.
- **Observé** : comportement réellement constaté.
- **Capture** : lien vers une capture d'écran ou vidéo si disponible.
- **Gravité** : P0/P1/P2/P3.
- **Date** : date et heure du signalement.
- **Statut** : ouvert / en cours / résolu / fermé.
- **Correctif** : référence du commit ou de la mise en Production ayant résolu le problème, une fois traité.
- **Validation** : confirmation par le client (ou en interne) que le correctif résout bien le problème signalé.

## Répondre dans l'application

Le fil in-app (`/plateforme/support`) reste le canal de réponse. Depuis
ELSATIA-GP-SUPPORT-REPLY-EMAIL-P1, **une réponse envoyée depuis ce fil notifie
automatiquement le demandeur par e-mail** (objet : « Réponse du support
ELSATIA »). Conséquences pratiques :

- Il n'est plus nécessaire de doubler la réponse in-app par un e-mail manuel
  depuis `support@elsatia.fr` — le client est prévenu.
- L'e-mail ne transporte qu'un **extrait** de la réponse (240 caractères) et un
  lien vers l'espace d'aide : la conversation complète reste dans
  l'application. Écrire la première phrase de façon autoportante aide le client.
- Le destinataire est **l'auteur du dernier message côté entreprise**. Si
  plusieurs personnes de la même entreprise ont écrit, seule la dernière est
  notifiée ; les autres voient la réponse en se connectant.
- Aucune adresse n'est reconstruite : si le demandeur n'est plus membre actif de
  l'entreprise ou n'a pas d'adresse confirmée, **aucun e-mail ne part** et la
  réponse reste visible in-app. Reprendre alors le contact par
  `support@elsatia.fr`.
- L'envoi est best-effort : une panne d'envoi n'annule jamais la réponse
  enregistrée. En cas de doute sur la réception, vérifier les journaux serveur
  (catégories `destinataire_absent`, `envoi_impossible`).

## Ce que cette procédure ne fait pas

- Elle ne crée aucun outil de ticketing — c'est une procédure manuelle pour un usage aux tout premiers clients.
- Elle ne promet aucun délai contractuel.
- Elle ne remplace pas la FAQ produit existante dans l'application (`src/components/FaqAide.tsx`), qui couvre l'usage fonctionnel au quotidien — cette procédure couvre les incidents et bugs réels remontés par un client.
