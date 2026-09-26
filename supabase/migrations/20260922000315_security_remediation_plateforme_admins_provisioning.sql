-- ELSATIA-SECURITY-BLOCKERS-REMEDIATION-V1 — corrige deux régressions
-- introduites par 20260922000314 (gp_pilot_plateforme_admin_role_total) en
-- réécrivant `plateforme_ajouter_admin`/`plateforme_retirer_admin` en entier
-- pour fermer une auto-promotion de rôle réellement exploitable. Ce correctif
-- garde intégralement la fermeture de 314 (rôle 'total' exigé pour gérer
-- l'équipe plateforme) et ne touche qu'aux deux régressions identifiées par
-- `platform_support_uid_security_v1.test.sql` et
-- `platform_aal2_role_integrity_v1.test.sql` (tests déjà existants et déjà
-- corrects, jamais modifiés ici).
--
-- Régression 1 — `plateforme_ajouter_admin` a été entièrement réécrite par
-- 314 (pour fermer une auto-promotion de rôle réellement exploitable — cette
-- fermeture est intégralement conservée ici, `plateforme_exiger_role('total')`
-- reste en tête de fonction) mais, ce faisant, a silencieusement perdu TROIS
-- protections que 20260826000237 avait déjà établies pour cette même
-- fonction :
--   (a) `plateforme_exiger_session_aal2()` — l'ajout d'un administrateur
--       plateforme ne demande plus de step-up MFA, contrairement à
--       `plateforme_rattacher_admin`/`plateforme_activer_admin`/
--       `plateforme_retirer_admin`, révélé par
--       `platform_aal2_role_integrity_v1.test.sql` (tests 8-10 : un JWT AAL1,
--       un claim `aal` malformé et un claim `aal` absent n'étaient plus
--       jamais refusés) et par son inventaire systémique (test 79 : recense
--       automatiquement toute fonction `plateforme_%` mutante, exécutable par
--       `authenticated`, dont le corps ne contient pas
--       `plateforme_exiger_session_aal2` — hors les deux exceptions déjà
--       nommées et justifiées dans le test pour une fermeture propre).
--   (b) `plateforme_verrouiller_mutations_admin()` — le verrou advisory
--       partagé avec les autres mutations d'équipe plateforme n'est plus
--       acquis, même fenêtre de compétition que la régression 2 ci-dessous.
--   (c) Le garde « identité déjà rattachée » : l'ancienne version distinguait
--       une ligne absente (INSERT, `en_attente`, `actif=false`) d'une ligne
--       déjà `active`/`rattachee_non_confirmee` (refus explicite — modifier
--       le rôle d'un administrateur déjà identifié doit passer par
--       `plateforme_modifier_role_admin`, pas par un second appel à
--       `plateforme_ajouter_admin`). La réécriture de 314 remplace ce garde
--       par un `INSERT ... ON CONFLICT (email) DO UPDATE SET role=...`
--       inconditionnel : un appelant 'total' pouvait donc changer
--       silencieusement le rôle d'un administrateur déjà actif via cette
--       voie annexe, sans passer par le chemin dédié — révélé par
--       `platform_aal2_role_integrity_v1.test.sql` (test 25, attend
--       `%déjà rattachée%`, plus aucune exception n'était levée).
--
-- Cette même réécriture a aussi perdu l'`actif=false` explicite à l'insertion
-- (la colonne a pour DEFAULT `true`), ce qui viole systématiquement
-- `plateforme_admins_actif_requiert_utilisateur_id` et
-- `plateforme_admins_statut_coherent_check` pour tout nouvel email — cassant
-- entièrement l'onboarding avant même d'atteindre les trois points ci-dessus
-- (ce n'est pas en soi une vulnérabilité : les contraintes rejettent bien un
-- état incohérent — mais c'est un défaut fonctionnel réel qui masquait (a)-(c)
-- derrière une erreur de contrainte plutôt que le vrai comportement attendu).
--
-- Correctif : restaure le corps de 20260826000237 pour `plateforme_ajouter_admin`
-- (jamais retouchée depuis par aucune autre migration) et le corps de
-- 20260906000266 pour `plateforme_retirer_admin` — la dernière version avant
-- 314 à avoir ajouté la garde `v_proprietaire` (le propriétaire global
-- ELSATIA ne peut pas être révoqué depuis la plateforme), que 314 avait
-- également perdue en réécrivant la fonction et que
-- `platform_global_owner_all_apps_v1.test.sql` (« un administrateur total
-- délégué ne peut pas révoquer le propriétaire global ») a détectée une fois
-- les autres régressions corrigées et ce test enfin atteint. Les deux corps
-- restaurés conservent intégralement l'exigence de rôle 'total' de 314 (déjà
-- présente dans les deux, jamais retirée par cette restauration).
--
-- Régression 2 — `plateforme_retirer_admin` : contrairement à
-- `plateforme_rattacher_admin` et `plateforme_activer_admin` (qui exigent
-- toutes deux `plateforme_exiger_session_aal2()`), le retrait/révocation d'un
-- administrateur plateforme — une des actions les plus sensibles du système —
-- ne exige plus de session AAL2 (MFA vérifié) depuis 314. Un appelant 'total'
-- en AAL1 (mot de passe seul, sans step-up MFA) peut donc révoquer n'importe
-- quel autre administrateur. Vulnérabilité réelle : incohérence démontrée par
-- rapport au reste des mutations d'équipe plateforme, confirmée par
-- `platform_aal2_role_integrity_v1.test.sql` ('total AAL1 : révocation
-- refusée', qui attendait une exception '%AAL2%' et n'en recevait aucune).
--
-- Régression 3 — même fonction : `plateforme_retirer_admin` n'acquiert plus
-- le verrou advisory partagé (`plateforme_verrouiller_mutations_admin()`,
-- déjà utilisé par `plateforme_activer_admin`) avant de recompter les
-- administrateurs pour la garde « impossible de retirer le dernier membre » —
-- fenêtre de compétition (TOCTOU) entre deux révocations concurrentes qui
-- pourrait laisser la plateforme sans administrateur 'total' actif. Démontré
-- par `platform_aal2_role_integrity_v1.test.sql` ('révocation : verrou commun
-- acquis avant le recomptage', qui vérifie littéralement que le texte source
-- de la fonction appelle `plateforme_verrouiller_mutations_admin`).
--
-- Aucun test n'est modifié par cette migration : les trois assertions
-- ci-dessus existaient déjà, intactes, avant ce correctif.

create or replace function public.plateforme_ajouter_admin(
  p_email text,
  p_nom text default null,
  p_role text default 'total'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_etat text;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Email invalide'; end if;
  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;

  select statut_identite into v_etat
  from public.plateforme_admins
  where email = v_email
  for update;

  if found then
    if v_etat not in ('en_attente', 'revoquee') then
      raise exception 'Identité déjà rattachée : utilisez la modification de rôle dédiée';
    end if;
    update public.plateforme_admins
    set role = p_role,
        nom = coalesce(nullif(trim(coalesce(p_nom,'')),''), nom),
        role_updated_at = now(),
        role_updated_by = auth.uid(),
        updated_at = now()
    where email = v_email;
  else
    insert into public.plateforme_admins(
      email, role, nom, ajoute_par, utilisateur_id, actif, statut_identite,
      role_updated_at, role_updated_by, updated_at
    ) values (
      v_email, p_role, nullif(trim(coalesce(p_nom,'')),''), auth.email(),
      null, false, 'en_attente', now(), auth.uid(), now()
    );
  end if;
end;
$$;

create or replace function public.plateforme_retirer_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role text;
  v_etat text;
  v_proprietaire boolean;
begin
  -- Un premier contrôle empêche un appelant non autorisé d'occuper le verrou. Le
  -- second, après l'attente, couvre une révocation concurrente de l'appelant.
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  select utilisateur_id, role, statut_identite, proprietaire
  into v_utilisateur_id, v_role, v_etat, v_proprietaire
  from public.plateforme_admins where email = v_email for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_proprietaire then
    raise exception 'Le propriétaire global ELSATIA ne peut pas être révoqué depuis la plateforme';
  end if;
  if v_etat = 'revoquee' then raise exception 'Administrateur déjà révoqué'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Vous ne pouvez pas révoquer votre propre compte'; end if;
  if v_role = 'total' and v_etat = 'active' and (
    select count(*) from public.plateforme_admins
    where role = 'total' and actif and statut_identite = 'active'
  ) <= 1 then
    raise exception 'Impossible de révoquer le dernier administrateur total actif';
  end if;

  update public.plateforme_admins
  set actif = false,
      statut_identite = 'revoquee',
      revocation_at = now(),
      revocation_par = auth.uid(),
      revocation_origine = 'utilisateur',
      updated_at = now()
  where email = v_email;

  update public.plateforme_acces_entreprises
  set termine_at = now(), termine_motif = 'Révocation administrateur'
  where plateforme_user_id = v_utilisateur_id and termine_at is null;
end;
$$;

notify pgrst, 'reload schema';
