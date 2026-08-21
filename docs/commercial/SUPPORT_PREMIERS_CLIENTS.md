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

## Ce que cette procédure ne fait pas

- Elle ne crée aucun outil de ticketing — c'est une procédure manuelle pour un usage aux tout premiers clients.
- Elle ne promet aucun délai contractuel.
- Elle ne remplace pas la FAQ produit existante dans l'application (`src/components/FaqAide.tsx`), qui couvre l'usage fonctionnel au quotidien — cette procédure couvre les incidents et bugs réels remontés par un client.
