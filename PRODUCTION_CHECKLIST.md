# Passage en production — ELSATIA Gestion Pro

> Le script manuel de sortie du prototype est prêt mais **non appliqué**. Il est volontairement rangé hors des migrations automatiques, car son application coupe immédiatement le mode prototype anonyme.

## Préconditions déjà vérifiées le 12 juillet 2026

- L’entreprise `ENT-001` est bien `ELSATIA`.
- Elle possède un membre actif et un poste Admin/Gérant.
- Le profil public du propriétaire existe et pointe sur `ENT-001` comme entreprise active.
- Le compte Supabase Auth correspondant existe, a un mot de passe, un email confirmé et a déjà réussi une connexion.
- Le script de production passe en transaction de test puis peut être annulé sans modifier la base. Nouveau dry-run après migrations 30–37 réussi ; rollback contrôlé (fonction prototype + accès anon + 46 policies anon toujours présents).
- **Correctif 2026-07-12 :** le script réaccorde désormais toutes les RPC appelées par l’application après les migrations 30 à 37 : accès/postes, rattachement par code, import stock, validation des pointages, justificatifs fournisseurs et espace propriétaire.
- **Renforcement 2026-07-13 validé :** les migrations 43 et 44 sont appliquées. La 43 impose les droits `gerer_*` au niveau RLS, stockage et wrappers RPC ; la 44 prépare les comptes depuis les fiches employés. Le script de production réaccorde `a_permission` après avoir retiré les droits anonymes.

## Décisions et actions avant la coupure

1. Utiliser `https://elsatia.fr` comme domaine principal et canonique. Le domaine secondaire `https://elsatia.com` devra rediriger de façon permanente vers `https://elsatia.fr`. La valeur publique de production attendue est `NEXT_PUBLIC_APP_URL=https://elsatia.fr` ; elle devra être configurée ultérieurement dans Vercel et n'est pas un secret.
2. Créer ou vérifier une sauvegarde Supabase restaurable avant la bascule.
3. Dans Supabase Auth, renseigner `https://elsatia.fr` comme `Site URL` et autoriser `https://elsatia.fr/auth/callback` ainsi que `http://localhost:3000/auth/callback` pour le développement local.
4. Dans **Authentication → Email Templates**, utiliser les liens SSR suivants :
   - confirmation d’inscription : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - récupération de mot de passe : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nouveau-mot-de-passe`
   Ces liens évitent de dépendre du navigateur ayant initié la demande et créent correctement la session en cookie.
5. Configurer sur l’hébergement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publiable)
   - `DISABLE_EMAIL_LOGIN=false`
6. Tester la connexion du propriétaire, la confirmation d’un compte test et « Mot de passe oublié » sur un environnement de préproduction avec `DISABLE_EMAIL_LOGIN=false`.
7. Appliquer manuellement `supabase/production/sortie_mode_prototype.sql` dans Supabase.
8. Vérifier qu’un appel REST anonyme aux tables métier est refusé, puis tester en session authentifiée : dashboard, création devis, facture, paiement, document privé, commande, dépense et inventaire.
9. Déployer la production et conserver le mode prototype uniquement sur une base locale/de démonstration séparée.

## Domaine et intégrations à configurer ultérieurement

Aucune de ces opérations n'est réalisée par ce document. Une fois la configuration de production autorisée :

- rattacher `elsatia.fr` à Vercel et créer la redirection permanente de `elsatia.com` vers `https://elsatia.fr` ;
- utiliser `https://elsatia.fr` pour les redirections Stripe Checkout et portail ;
- déclarer `https://elsatia.fr/api/stripe/oauth/callback` pour Stripe Connect ;
- exposer sur le domaine principal les webhooks `/api/stripe/webhook`, `/api/stripe/abonnement/webhook` et `/api/stripe/boutique/webhook` ;
- déclarer `https://elsatia.fr/api/paiements-bancaires/powens/callback` auprès de Powens ;
- configurer le webhook de notifications sur `https://elsatia.fr/api/webhooks/notifications-push` ;
- vérifier les métadonnées absolues et décider séparément de l'ajout éventuel d'un canonical explicite ;
- vérifier le manifeste, le service worker et l'installation PWA sous HTTPS.

## Services externes encore optionnels

- Envoi automatique des devis/factures par email avec pièce jointe : choisir un fournisseur SMTP/Resend et fournir sa clé.
- Adresse d’envoi professionnelle sur le domaine validé.
- Sauvegardes/PITR selon le plan Supabase choisi.

## Retour arrière d’urgence

Ne pas remettre `DISABLE_EMAIL_LOGIN=true` sur une base durcie : la fonction prototype aura été supprimée. Restaurer la sauvegarde pré-migration ou réappliquer explicitement la migration 08 sur une base de démonstration isolée.
