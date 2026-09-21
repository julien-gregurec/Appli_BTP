# ELSATIA — réinitialisation de mot de passe multi-application

Lot `ELSATIA-COLORS-MULTIAPP-PASSWORD-RESET-FLOW-V1`, branche
`feat/colors-multiapp-password-reset-v1`, base `5b21590`.

## 1. La contrainte, mesurée

Le compte ELSATIA est commun aux applications ; le projet Supabase l'est aussi,
et avec lui **un unique gabarit d'e-mail « Reset password »** :

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

`SiteURL` vaut `https://app.elsatia.fr`. Le lien reçu est donc **identique**,
que la réinitialisation ait été demandée depuis Gestion Pro ou depuis Colors.

Trois canaux auraient pu porter la provenance. Aucun n'est disponible :

| Canal | Pourquoi il ne sert pas |
| --- | --- |
| Le lien | Le gabarit est figé et partagé. `{{ .RedirectTo }}` porte une URL complète, pas une origine : l'y substituer produit un lien concaténé, cassé pour les deux applications (mesuré au lot précédent). |
| Un cookie | Les cookies d'authentification sont posés sans attribut `domain`, dans les deux applications : ils sont propres à l'hôte. Une page de `colors.elsatia.fr` ne peut rien écrire ni lire sur `app.elsatia.fr`. |
| Une ligne en base | `applications_elsatia` et les tables d'accès sont en RLS `to authenticated`. Sur `/auth/confirm`, avant `verifyOtp`, il n'y a pas de session : rien n'est lisible. |

Et la provenance **ne peut pas** être déduite après coup : `verifyOtp` consomme
le jeton à usage unique. Une fois l'utilisateur identifié, il est trop tard pour
relayer quoi que ce soit.

**Conclusion : la seule donnée fiable disponible avant `verifyOtp` est le choix
explicite de la personne.** Toute autre piste — deviner l'application d'après
les habilitations, sonder un cookie tiers, encoder la cible dans le jeton —
serait une inférence, c'est-à-dire exactement la mécanique fragile à éviter.

## 2. Stratégie retenue — relais de jeton, cible choisie explicitement

```
Colors /mot-de-passe-oublie
  → resetPasswordForEmail (inchangé)
  → e-mail : app.elsatia.fr/auth/confirm?token_hash=…&type=recovery
  → Gestion Pro /auth/confirm : deux issues, aucune ne consomme le jeton au chargement
       • « Confirmer »                      → verifyOtp sur Gestion Pro  → /nouveau-mot-de-passe   (comportement actuel, inchangé)
       • « Poursuivre sur ELSATIA Colors »  → lien vers colors.elsatia.fr/auth/confirm, jeton NON consommé
  → Colors /auth/confirm : clic explicite → verifyOtp sur Colors
  → session de récupération ouverte sur colors.elsatia.fr
  → Colors /nouveau-mot-de-passe → mot de passe modifié → Colors /login
```

Pourquoi le relais transporte le jeton **non vérifié** : la session naît là où
`verifyOtp` est exécuté. La vérifier sur Gestion Pro puis rediriger vers Colors
ne transmettrait rien — les cookies ne franchissent pas le sous-domaine. C'est
le point qui commande toute l'architecture.

Cible : un ensemble fermé de deux applications. L'origine de Colors vient de la
configuration serveur de Gestion Pro, jamais de la requête ; le chemin
`/auth/confirm` est une constante. Aucune URL libre, aucun hôte fourni par
l'utilisateur.

## 3. Ce que chaque application fait

### Gestion Pro — additif, sans changement de comportement par défaut

`src/lib/auth-relais-colors.ts` : `origineColors()` valide
`NEXT_PUBLIC_COLORS_URL` (HTTPS exigé hors développement) ; `lienRelaisColors()`
compose la destination et ne renvoie rien si le type n'est pas `recovery`, si le
jeton manque, ou si Colors n'est pas configurée.

`src/app/auth/confirm/page.tsx` : un lien secondaire s'affiche sous le bouton
« Confirmer », **uniquement** pour `type=recovery` et **uniquement** si
`NEXT_PUBLIC_COLORS_URL` est définie. Variable absente ⇒ page strictement
identique à aujourd'hui. Aucune modification de `confirmerCompteAction`, de
`urlCallbackReinitialisation()` ni du parcours Gestion Pro existant.

Le jeton traverse une navigation vers `colors.elsatia.fr`. Il apparaît donc dans
les journaux d'accès de Colors comme il apparaît déjà dans ceux de Gestion Pro ;
le `Referer` sortant, lui, ne le transporte pas — `Referrer-Policy` vaut
`strict-origin-when-cross-origin` sur les deux applications.

### Colors — un écran, aucune destination paramétrable

`src/lib/jeton-recuperation.ts` : `jetonRecuperationSur()` n'accepte que
`type=recovery` et une forme de jeton limitée à l'alphabet non réservé des URL
(16 à 512 caractères). Tout le reste est écarté sans appel réseau.

`src/app/auth/confirm/page.tsx` : rendue dynamiquement, elle **ne consomme rien
au chargement**. Un préchargement par un client mail ou un scanner de sécurité
ne fait qu'un GET inerte ; le jeton reste disponible pour le vrai clic. C'est la
protection retenue pour Gestion Pro en `AUTH-RECOVERY-V1`, reprise à
l'identique.

`confirmerRecuperationAction` (`src/app/actions.ts`) : `verifyOtp`, puis
redirection vers la **constante** `DESTINATION_NOUVEAU_MOT_DE_PASSE`. Cette
action n'accepte aucun `next` : la surface d'open redirect est nulle, pas
seulement validée.

## 4. Ce qui n'a pas changé

- Gabarit d'e-mail Supabase : **non modifié**.
- `SiteURL` Supabase : **non modifié**.
- Liste blanche « Redirect URLs » : **aucune entrée requise par ce lot**.
  `verifyOtp` est un appel serveur avec `token_hash` ; il ne met en jeu aucun
  `redirect_to`. Les entrées existantes restent valables pour
  `resetPasswordForEmail`, dont le `redirectTo` ne sert plus qu'à la validation
  Supabase avec ce gabarit.
- Anti-énumération : `demanderReinitialisationAction` n'est pas touchée. La
  réponse reste le même message neutre, adresse connue ou non, succès technique
  ou non.
- Base de données : aucune migration, aucune table, aucune RLS.

## 5. Charges hostiles couvertes

| Payload | Comportement |
| --- | --- |
| `type` autre que `recovery` (`email`, `signup`, `magiclink`, `invite`…) | Gestion Pro ne propose pas le relais ; Colors refuse avant `verifyOtp` |
| `token_hash` absent, trop court, porteur de `<`, `"`, espace | refusé sans appel réseau, jamais réinjecté dans le formulaire |
| `next` externe glissé dans le formulaire de Colors | ignoré : la destination est une constante |
| Jeton invalide ou expiré | même message, même page de retour, échec technique journalisé côté serveur seulement |
| Application inconnue | impossible : la seule cible est l'origine de configuration |

## 6. Limite connue, assumée

Le lien reçu ouvre le portail de compte ELSATIA avant d'atteindre Colors : la
personne fait un clic de plus et voit une page Gestion Pro au passage. C'est le
prix du gabarit unique, et l'écran de Colors le dit explicitement.

L'architecture qui supprimerait ce détour est celle où **chaque application émet
son propre e-mail** : `auth.admin.generateLink({ type: "recovery" })` côté
serveur, puis envoi par le transport de l'application, avec un lien pointant
directement sur son `/auth/confirm`. Elle suppose un transport e-mail et des
secrets propres à Colors, qui n'existent pas : c'est un lot distinct, pas une
variante de celui-ci.

## 7. Action humaine requise avant déploiement

Une seule, non exécutée ici : définir `NEXT_PUBLIC_COLORS_URL` sur le projet
Vercel **`elsatia-production`** (Gestion Pro), valeur `https://colors.elsatia.fr`,
pour les environnements Production et Preview. Variable non secrète, déjà
présente sous ce nom et cette valeur sur le projet `elsatia-colors`.

Tant qu'elle est absente, le relais ne s'affiche pas et Gestion Pro se comporte
exactement comme aujourd'hui : la réinitialisation demandée depuis Colors se
termine sur Gestion Pro, sans erreur. Le déploiement des deux applications reste
donc découplé et l'ordre est libre.
