# ELSATIA — MFA / AAL2 V1

## Périmètre et autorité

Le parcours utilise exclusivement Supabase Auth MFA TOTP. Les facteurs et secrets ne sont jamais copiés dans une table métier. L’interface appelle `enroll`, `challenge`, `verify`, `listFactors`, `unenroll` et `getAuthenticatorAssuranceLevel`. Les autorisations plateforme restent fondées sur `auth.uid()` et `plateforme_admins`; aucun email n’est une preuve d’autorisation.

`/plateforme` est protégé deux fois : préfiltrage dans le Proxy et contrôle serveur dans le layout de la zone. Toute erreur ou réponse AAL inconnue bloque l’accès. Les RPC de mutation plateforme conservent leur contrôle SQL `plateforme_exiger_session_aal2()`; le frontend n’est pas l’autorité.

## États et redirections

- AAL1 sans facteur vérifié : redirection vers `/parametres/securite` pour enrôlement.
- AAL1 avec facteur vérifié : redirection vers `/mfa/challenge`.
- AAL2 : accès à la zone plateforme, sous réserve du rôle plateforme.
- Erreur Auth, timeout ou état AAL inconnu : accès refusé (fail-closed).
- Le paramètre `next` n’accepte qu’un chemin interne; schémas, URL absolues, URL protocol-relative, antislashs, contrôles et doubles encodages ambigus sont rejetés.

## Désenrôlement et verrouillage

Un facteur incomplet peut être annulé. Un facteur vérifié exige AAL2. Pour un administrateur plateforme `total`, l’API applicative refuse le retrait de son dernier facteur si aucun second administrateur total actif n’existe. Cette protection réduit le risque opérationnel dans ELSATIA; Supabase conserve par ailleurs son API d’auto-gestion du facteur pour le propriétaire de la session.

Plusieurs facteurs TOTP sont supportés et le challenge permet de choisir un facteur vérifié. Le secret et le QR d’enrôlement restent uniquement dans l’état mémoire de la page et disparaissent après vérification, annulation ou fermeture.

## Récupération

Supabase TOTP ne fournit pas de codes de récupération natifs. La stratégie ELSATIA est :

1. maintenir deux administrateurs `total` actifs, chacun avec MFA;
2. maintenir la récupération email opérationnelle;
3. en cas de perte de tous les facteurs, appliquer une procédure opérateur contrôlée avec vérification d’identité et journalisation;
4. ne jamais contourner MFA par une modification SQL manuelle.

## Enrôlement humain Production — compte officiel

Pour `julien@elsatia.fr`, après déploiement explicitement autorisé : se connecter, ouvrir **Paramètres → Sécurité du compte**, activer un facteur TOTP, scanner le QR avec l’application personnelle, saisir personnellement le code, vérifier l’état AAL2, ouvrir `/plateforme`, puis tester une action sensible. Codex ne saisit ni ne conserve le code.

## Enrôlement humain Production — compte de secours

Répéter la même procédure, séparément, pour `julien.gregurec@gmail.com`. Ne retirer aucun droit pendant cette opération. Le statut recommandé avant migration Production est : deux administrateurs `total`, deux facteurs vérifiés, et deux sessions AAL2 testées.

## Limites de ce lot

Aucun enrôlement, facteur, utilisateur, changement Auth ou déploiement Production n’est effectué. Aucune migration SQL n’est ajoutée. L’activation locale de TOTP dans `supabase/config.toml` est une configuration canonique de développement, pas une fixture temporaire.
