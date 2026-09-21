-- ELSATIA-RESERVES-V3-COLLABORATION-ET-LIVRABLES
--
-- Fait passer ELSATIA Réserves de « application complète » à « produit de collaboration
-- réellement exploitable au quotidien ». Ferme les manques qui obligeaient encore un
-- utilisateur à connaître des identifiants techniques, à surveiller l'application pour
-- savoir qu'il se passe quelque chose, et à recopier ses réserves à la main pour les
-- transmettre à une entreprise.
--
-- Sept chantiers, tous portés ici :
--
--   1. ANNUAIRE DES ORGANISATIONS. Inviter une entreprise ne demande plus de saisir un
--      `tenant_id`. On la cherche par SIRET exact ou par nom.
--   2. ENTREPRISE EXTÉRIEURE NON ELSATIA. On l'invite par son identité commerciale, sans
--      jamais créer un tenant à sa place.
--   3. INVITATION PAR LIEN SÉCURISÉ. Jeton haché, expiration, usage unique, révocation.
--      L'identifiant d'organisation cesse d'être un mécanisme d'accès.
--   4. NOTIFICATIONS RÉELLES. La file de 00268 était écrite mais jamais consommée : elle
--      est branchée sur deux canaux (in-app et e-mail), avec préférences et idempotence.
--   5. ÉCHÉANCES. Un producteur réel émet `echeance_proche` aux paliers retenus.
--   6. PLANS PDF. Une réserve pointée sur un PDF mémorise sa PAGE, en plus de x/y.
--   7. RÉVOCATION ET TRANSFERT. Révoquer une entreprise est un geste tracé, réversible
--      dans ses conséquences d'accès, et jamais destructeur pour l'historique.
--
-- Migration strictement ADDITIVE et POSTÉRIEURE à 00269 (ledger audité sur les 45
-- branches du dépôt : 00269 est le plus haut numéro existant, 00270 est libre). Aucune
-- table, colonne ou policy de la V1/V2 n'est supprimée. Les fonctions redéfinies le sont
-- par `create or replace` à signature identique, sauf `reserves_creer` et
-- `reserves_revoquer_intervenant`, dont le contrat change et qui sont donc reprises
-- explicitement.
--
-- Ce que cette migration ne fait PAS : la synchronisation hors-ligne, le QR de chantier,
-- la signature électronique et le canal push restent hors périmètre, conformément au
-- cadrage. Aucun point d'ancrage mensonger n'est posé pour eux.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ANNUAIRE DES ORGANISATIONS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Le problème : jusqu'ici, rattacher une entreprise intervenante à son compte ELSATIA
-- exigeait de connaître son `entreprise_id`. C'est un identifiant technique, que personne
-- ne possède sur un chantier, et le demander à l'utilisateur revenait à faire de cet
-- identifiant un mécanisme d'accès.
--
-- La solution retenue tient en deux mécanismes DISTINCTS, et c'est délibéré :
--
--   • Le SIRET EXACT (14 chiffres) interroge toutes les organisations. Un SIRET est une
--     donnée publique du registre national : il ne s'énumère pas, il se lit sur un devis
--     ou un contrat. Celui qui le saisit connaît déjà l'entreprise. La divulgation se
--     limite alors au nom et à la ville — jamais un chantier, jamais une réserve, jamais
--     la liste des clients ELSATIA.
--
--   • La RECHERCHE PAR NOM ne porte QUE sur les organisations qui se sont explicitement
--     publiées à l'annuaire. Sans cet opt-in, une recherche sur « pein » retournerait le
--     fichier client d'ELSATIA à quiconque possède un compte : ce serait une fuite, pas
--     une fonctionnalité.
--
-- Aucune de ces deux voies n'ouvre la moindre donnée métier : l'annuaire ne sert qu'à
-- DÉSIGNER une organisation, l'accès reste porté par l'invitation de la section 3.
create table public.reserves_annuaire_publication (
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
  publiee boolean not null default false,
  corps_etat text check (corps_etat is null or length(corps_etat) <= 120),
  zone_intervention text check (zone_intervention is null or length(zone_intervention) <= 200),
  email_contact text check (
    email_contact is null or email_contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  telephone_contact text check (telephone_contact is null or length(telephone_contact) <= 40),
  publiee_at timestamptz,
  maj_par uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not publiee or publiee_at is not null)
);

comment on table public.reserves_annuaire_publication is
  'Publication VOLONTAIRE d''une organisation à l''annuaire ELSATIA Réserves. Sans ligne '
  'publiée, l''organisation reste introuvable par son nom ; seul son SIRET exact la désigne.';

create index reserves_annuaire_publiees_idx
  on public.reserves_annuaire_publication (entreprise_id) where publiee;

create trigger reserves_annuaire_updated before update on public.reserves_annuaire_publication
  for each row execute function public.reserves_set_updated_at();

-- Normalisation d'un SIRET : seuls les chiffres comptent. « 123 456 789 00012 » et
-- « 12345678900012 » désignent le même établissement.
create or replace function public.reserves_siret_normalise(p_valeur text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(coalesce(p_valeur, ''), '[^0-9]', '', 'g'), '');
$$;

-- Recherche d'organisation. `p_entreprise_id` est l'organisation HÔTE qui cherche : la
-- fonction exige d'elle le droit d'inviter, et s'exclut elle-même du résultat.
--
-- `deja_utilisatrice` dit seulement si l'organisation a déjà un accès Réserves actif.
-- C'est utile — l'invitation sera immédiate au lieu de passer par un onboarding — et
-- inoffensif : l'information n'est rendue que pour une organisation déjà identifiée par
-- l'appelant.
create or replace function public.reserves_annuaire_rechercher(
  p_entreprise_id uuid,
  p_terme text
) returns table (
  entreprise_id uuid,
  nom text,
  ville text,
  corps_etat text,
  zone_intervention text,
  deja_utilisatrice boolean,
  origine text
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_terme text := btrim(coalesce(p_terme, ''));
  v_siret text := public.reserves_siret_normalise(v_terme);
begin
  if not public.reserves_action_autorisee(p_entreprise_id, 'inviter_entreprise') then
    raise exception 'Recherche à l''annuaire non autorisée';
  end if;

  -- SIRET exact : 14 chiffres, rien d'autre. Un préfixe ne suffit pas — ce serait une
  -- énumération déguisée du registre des organisations ELSATIA.
  if v_siret is not null and length(v_siret) = 14 then
    return query
      select e.id,
             coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
             e.ville,
             a.corps_etat,
             a.zone_intervention,
             coalesce(acc.autorise, false),
             'siret'::text
      from public.entreprises e
      left join public.reserves_annuaire_publication a on a.entreprise_id = e.id
      left join public.acces_applications_entreprises acc
        on acc.entreprise_id = e.id and acc.application_code = 'reserves'
      where public.reserves_siret_normalise(e.siret) = v_siret
        and e.id <> p_entreprise_id
      limit 5;
    return;
  end if;

  -- Recherche par nom : uniquement parmi les organisations publiées, et à partir de
  -- trois caractères pour qu'une lettre isolée ne balaie pas l'annuaire.
  if length(v_terme) < 3 then return; end if;

  return query
    select e.id,
           coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
           e.ville,
           a.corps_etat,
           a.zone_intervention,
           coalesce(acc.autorise, false),
           'annuaire'::text
    from public.reserves_annuaire_publication a
    join public.entreprises e on e.id = a.entreprise_id
    left join public.acces_applications_entreprises acc
      on acc.entreprise_id = e.id and acc.application_code = 'reserves'
    where a.publiee
      and e.id <> p_entreprise_id
      and (
        coalesce(e.raison_sociale, '') ilike '%' || v_terme || '%'
        or e.nom ilike '%' || v_terme || '%'
      )
    order by e.nom
    limit 20;
end;
$$;

-- Publication / retrait de son organisation à l'annuaire. Geste d'administrateur, et
-- uniquement sur SA propre organisation : la fonction ne prend pas d'entreprise cible.
create or replace function public.reserves_annuaire_publier(
  p_entreprise_id uuid,
  p_publiee boolean,
  p_corps_etat text default null,
  p_zone_intervention text default null,
  p_email_contact text default null,
  p_telephone_contact text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.reserves_action_autorisee(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Publication à l''annuaire non autorisée';
  end if;

  insert into public.reserves_annuaire_publication (
    entreprise_id, publiee, corps_etat, zone_intervention,
    email_contact, telephone_contact, publiee_at, maj_par
  ) values (
    p_entreprise_id, coalesce(p_publiee, false), p_corps_etat, p_zone_intervention,
    p_email_contact, p_telephone_contact,
    case when coalesce(p_publiee, false) then now() end, auth.uid()
  )
  on conflict (entreprise_id) do update set
    publiee = excluded.publiee,
    corps_etat = excluded.corps_etat,
    zone_intervention = excluded.zone_intervention,
    email_contact = excluded.email_contact,
    telephone_contact = excluded.telephone_contact,
    publiee_at = case
      when excluded.publiee then coalesce(public.reserves_annuaire_publication.publiee_at, now())
      else null end,
    maj_par = auth.uid();
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ENTREPRISE EXTÉRIEURE : IDENTITÉ COMMERCIALE, PAS TENANT FANTÔME
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Une entreprise qui n'a pas de compte ELSATIA doit pouvoir être nommée sur le chantier
-- avec son identité réelle, et recevoir une invitation. Ce qu'on ne fait PAS : créer
-- silencieusement un tenant à sa place. Un tenant créé sans personne pour le gouverner
-- est un compte orphelin — il porterait des données, une facturation potentielle et une
-- responsabilité RGPD sans titulaire. L'organisation n'existe donc qu'au moment où un
-- humain rejoint, en connaissance de cause (section 3).
alter table public.reserves_intervenants
  add column if not exists raison_sociale text
    check (raison_sociale is null or length(raison_sociale) <= 200),
  add column if not exists siret text
    check (siret is null or public.reserves_siret_normalise(siret) ~ '^[0-9]{14}$'),
  add column if not exists contact_nom text
    check (contact_nom is null or length(contact_nom) <= 160),
  -- Trace d'onboarding : où en est cette entreprise extérieure vis-à-vis d'ELSATIA.
  -- Purement informatif pour l'hôte ; ne conditionne aucun droit.
  add column if not exists onboarding_statut text not null default 'inconnu'
    check (onboarding_statut in ('inconnu','a_inviter','invitee','compte_cree','rattachee'));

comment on column public.reserves_intervenants.onboarding_statut is
  'État d''avancement de l''entreprise extérieure vers un compte ELSATIA. Informatif : '
  'l''accès reste porté par `statut` et par l''invitation consommée.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. INVITATION PAR LIEN SÉCURISÉ
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Le jeton en clair n'est JAMAIS persisté : l'application tire 32 octets aléatoires,
-- en calcule l'empreinte SHA-256 et n'envoie que celle-ci à la base — exactement la
-- convention déjà retenue pour les liens de partage de documents commerciaux (00200).
-- Une fuite de la table ne permet donc de rejouer aucun lien.
--
-- Politique d'usage, explicite : UNE invitation vivante par intervention. Émettre un
-- nouveau lien révoque le précédent. Un lien se consomme une seule fois, expire, et
-- reste révocable à tout instant par l'hôte.
create table public.reserves_invitations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  intervenant_id uuid not null references public.reserves_intervenants(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_nom text check (contact_nom is null or length(contact_nom) <= 160),
  -- Renseignée quand l'hôte a désigné l'organisation depuis l'annuaire : l'acceptation
  -- vérifiera alors que celui qui rejoint appartient bien à CETTE organisation.
  entreprise_cible_id uuid references public.entreprises(id) on delete set null,
  expire_at timestamptz not null,
  envoye_at timestamptz,
  echec_envoi text check (echec_envoi is null or length(echec_envoi) <= 300),
  consomme_at timestamptz,
  consomme_par uuid references public.utilisateurs(id) on delete set null,
  consomme_entreprise_id uuid references public.entreprises(id) on delete set null,
  revoque_at timestamptz,
  revoque_par uuid references public.utilisateurs(id) on delete set null,
  created_by uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Une invitation ne peut pas être à la fois consommée et révoquée.
  check (consomme_at is null or revoque_at is null),
  check (consomme_at is null or consomme_entreprise_id is not null),
  check (entreprise_cible_id is null or entreprise_cible_id <> entreprise_id)
);

comment on table public.reserves_invitations is
  'Liens d''invitation d''une entreprise intervenante. `token_hash` = SHA-256 du jeton, '
  'calculé côté application ; le jeton en clair n''est jamais persisté ni journalisé.';

-- Une seule invitation vivante par intervention : l'index l'impose, la RPC d'émission
-- révoque la précédente avant d'insérer.
create unique index reserves_invitations_vivante_unique
  on public.reserves_invitations (intervenant_id)
  where consomme_at is null and revoque_at is null;
create index reserves_invitations_chantier_idx
  on public.reserves_invitations (chantier_id, created_at desc);

-- ── 3.1 Émission ─────────────────────────────────────────────────────────────
create or replace function public.reserves_inviter_intervenant(
  p_intervenant_id uuid,
  p_token_hash text,
  p_email text,
  p_contact_nom text default null,
  p_entreprise_cible_id uuid default null,
  p_duree_jours integer default 30
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_intervenant public.reserves_intervenants;
  v_duree integer := least(greatest(coalesce(p_duree_jours, 30), 1), 90);
  v_id uuid;
begin
  select * into v_intervenant from public.reserves_intervenants where id = p_intervenant_id;
  if not found then raise exception 'Intervenant introuvable'; end if;
  if not public.reserves_action_autorisee(v_intervenant.entreprise_id, 'inviter_entreprise') then
    raise exception 'Invitation non autorisée';
  end if;
  if v_intervenant.statut = 'revoquee' then
    raise exception 'Cette entreprise a été révoquée du chantier : réactivez-la avant de l''inviter';
  end if;
  if v_intervenant.statut = 'active' then
    raise exception 'Cette entreprise a déjà rejoint le chantier';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Jeton d''invitation invalide';
  end if;
  if p_entreprise_cible_id is not null then
    if p_entreprise_cible_id = v_intervenant.entreprise_id then
      raise exception 'Une organisation ne peut pas s''inviter elle-même';
    end if;
    if not exists (select 1 from public.entreprises where id = p_entreprise_cible_id) then
      raise exception 'Organisation cible introuvable';
    end if;
  end if;

  -- Émettre un nouveau lien invalide le précédent : deux liens vivants pour la même
  -- intervention seraient deux portes d'entrée à surveiller au lieu d'une.
  update public.reserves_invitations
  set revoque_at = now(), revoque_par = auth.uid()
  where intervenant_id = p_intervenant_id and consomme_at is null and revoque_at is null;

  insert into public.reserves_invitations (
    entreprise_id, chantier_id, intervenant_id, token_hash, email, contact_nom,
    entreprise_cible_id, expire_at
  ) values (
    v_intervenant.entreprise_id, v_intervenant.chantier_id, p_intervenant_id,
    p_token_hash, lower(btrim(p_email)), p_contact_nom,
    p_entreprise_cible_id, now() + make_interval(days => v_duree)
  ) returning id into v_id;

  update public.reserves_intervenants
  set invite_at = coalesce(invite_at, now()),
      email_contact = coalesce(email_contact, lower(btrim(p_email))),
      contact_nom = coalesce(contact_nom, p_contact_nom),
      onboarding_statut = case
        when p_entreprise_cible_id is not null then 'rattachee' else 'invitee' end
  where id = p_intervenant_id;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values (
    'entreprise', v_intervenant.entreprise_id, 'reserves',
    'reserves_invitation_emise:' || p_intervenant_id::text, auth.email()
  );

  return v_id;
end;
$$;

-- ── 3.2 Consultation anonyme du lien ─────────────────────────────────────────
-- Appelable sans session : le destinataire n'a par définition pas encore de compte.
-- Ce qui est révélé se limite à ce qu'il faut pour décider d'accepter — le nom de
-- l'organisation qui invite, celui du chantier, le nom sous lequel il a été inscrit.
-- Aucun identifiant technique, aucune réserve, aucun autre intervenant.
--
-- Un jeton invalide, expiré, révoqué ou déjà consommé ne renvoie AUCUNE ligne, sans
-- distinguer les cas : pas d'oracle d'énumération.
create or replace function public.reserves_invitation_consulter(p_token_hash text)
returns table (
  organisation_hote text,
  chantier text,
  intervenant text,
  contact_nom text,
  expire_at timestamptz,
  cible_designee boolean
)
language sql security definer stable set search_path = public as $$
  select coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
         c.nom,
         i.nom,
         inv.contact_nom,
         inv.expire_at,
         inv.entreprise_cible_id is not null
  from public.reserves_invitations inv
  join public.entreprises e on e.id = inv.entreprise_id
  join public.reserves_chantiers c on c.id = inv.chantier_id
  join public.reserves_intervenants i on i.id = inv.intervenant_id
  where inv.token_hash = p_token_hash
    and inv.consomme_at is null
    and inv.revoque_at is null
    and inv.expire_at > now()
  limit 1;
$$;

-- ── 3.3 Acceptation ──────────────────────────────────────────────────────────
-- C'est ICI que le jeton remplace définitivement l'identifiant d'organisation comme
-- mécanisme d'accès. L'appelant est authentifié, membre actif d'une organisation ; le
-- jeton autorise le rattachement de CETTE organisation à CETTE intervention, et rien
-- d'autre. L'hôte n'écrit jamais dans le tenant du tiers : c'est le tiers qui agit.
create or replace function public.reserves_invitation_accepter(
  p_token_hash text,
  p_entreprise_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.reserves_invitations;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;

  select * into v_inv from public.reserves_invitations
  where token_hash = p_token_hash
    and consomme_at is null and revoque_at is null and expire_at > now()
  for update;
  if not found then raise exception 'Ce lien d''invitation n''est plus valide'; end if;

  if not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Vous n''êtes pas membre actif de cette organisation';
  end if;
  if p_entreprise_id = v_inv.entreprise_id then
    raise exception 'Une organisation ne peut pas intervenir sur son propre chantier en tant qu''entreprise invitée';
  end if;
  -- Lien nominatif : s'il désigne une organisation, il ne rattache que celle-là.
  if v_inv.entreprise_cible_id is not null and v_inv.entreprise_cible_id <> p_entreprise_id then
    raise exception 'Ce lien a été émis pour une autre organisation';
  end if;

  -- Rattachement de l'intervention. `statut` reste « invitee » jusqu'ici : la ligne
  -- devient active dans le même geste, puisque la personne qui accepte EST le tiers.
  update public.reserves_intervenants
  set entreprise_intervenante_id = p_entreprise_id,
      statut = 'active',
      invite_at = coalesce(invite_at, now()),
      rejoint_at = now(),
      onboarding_statut = 'rattachee'
  where id = v_inv.intervenant_id
    and statut = 'invitee'
    and (entreprise_intervenante_id is null or entreprise_intervenante_id = p_entreprise_id);
  if not found then
    raise exception 'Cette intervention n''est plus au statut « invitée »';
  end if;

  -- Compte gratuit limité : accès applicatif à l'organisation, habilitation minimale à
  -- la personne. `do nothing` de part et d'autre : un client Réserves payant ne voit
  -- jamais son propre droit ni son rôle réécrits par l'invitation d'un tiers.
  insert into public.acces_applications_entreprises (
    entreprise_id, application_code, autorise, source, reference_externe
  ) values (
    p_entreprise_id, 'reserves', true,
    'reserves_invitation_gratuite', v_inv.intervenant_id::text
  )
  on conflict (entreprise_id, application_code) do nothing;

  insert into public.habilitations_applications_utilisateurs (
    entreprise_id, utilisateur_id, application_code, role_code, autorise, attribue_par
  ) values (
    p_entreprise_id, auth.uid(), 'reserves', 'reserves_intervenant', true, auth.uid()
  )
  on conflict (entreprise_id, utilisateur_id, application_code) do nothing;

  update public.reserves_invitations
  set consomme_at = now(),
      consomme_par = auth.uid(),
      consomme_entreprise_id = p_entreprise_id
  where id = v_inv.id;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values (
    'entreprise', p_entreprise_id, 'reserves',
    'reserves_invitation_acceptee:' || v_inv.intervenant_id::text, auth.email()
  );

  return v_inv.intervenant_id;
end;
$$;

-- ── 3.4 Révocation et suivi ──────────────────────────────────────────────────
create or replace function public.reserves_invitation_revoquer(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hote uuid;
begin
  select entreprise_id into v_hote from public.reserves_invitations where id = p_invitation_id;
  if v_hote is null then raise exception 'Invitation introuvable'; end if;
  if not public.reserves_action_autorisee(v_hote, 'inviter_entreprise') then
    raise exception 'Révocation d''invitation non autorisée';
  end if;
  update public.reserves_invitations
  set revoque_at = now(), revoque_par = auth.uid()
  where id = p_invitation_id and consomme_at is null and revoque_at is null;
end;
$$;

-- Suivi côté hôte. Le hachage du jeton n'est jamais rendu : ni ici, ni ailleurs.
create or replace function public.reserves_invitations_chantier(p_chantier_id uuid)
returns table (
  id uuid, intervenant_id uuid, intervenant text, email text, contact_nom text,
  etat text, expire_at timestamptz, envoye_at timestamptz, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select inv.id, inv.intervenant_id, i.nom, inv.email, inv.contact_nom,
         case
           when inv.consomme_at is not null then 'acceptee'
           when inv.revoque_at is not null then 'revoquee'
           when inv.expire_at <= now() then 'expiree'
           when inv.envoye_at is null then 'a_envoyer'
           else 'en_attente'
         end,
         inv.expire_at, inv.envoye_at, inv.created_at
  from public.reserves_invitations inv
  join public.reserves_intervenants i on i.id = inv.intervenant_id
  where inv.chantier_id = p_chantier_id
    and public.reserves_action_autorisee(inv.entreprise_id, 'gerer_intervenants')
  order by inv.created_at desc;
$$;

-- Marquage d'envoi : appelé par la couche applicative après remise au transporteur
-- e-mail. Sépare « lien créé » de « lien effectivement parti », pour que l'hôte sache
-- s'il doit relancer.
create or replace function public.reserves_invitation_marquer_envoyee(
  p_invitation_id uuid, p_echec text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_hote uuid;
begin
  select entreprise_id into v_hote from public.reserves_invitations where id = p_invitation_id;
  if v_hote is null then raise exception 'Invitation introuvable'; end if;
  if not public.reserves_action_autorisee(v_hote, 'inviter_entreprise') then
    raise exception 'Action non autorisée';
  end if;
  update public.reserves_invitations
  set envoye_at = case when p_echec is null then now() else envoye_at end,
      echec_envoi = left(p_echec, 300)
  where id = p_invitation_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS RÉELLES
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- La V1 écrivait `reserves_evenements_notifications` mais ne la consommait jamais :
-- `distribue_at` restait nul, aucun canal n'existait. C'est le manque le plus coûteux du
-- produit — un intervenant ne savait qu'une réserve lui était attribuée qu'en ouvrant
-- l'application de sa propre initiative.
--
-- Le modèle retenu sépare trois choses, et cette séparation est ce qui rend la
-- déduplication possible :
--
--   • L'ÉVÉNEMENT MÉTIER (`reserves_evenements_notifications`) : il s'est passé quelque
--     chose. Un seul par geste, garanti par `cle_evenement` quand le geste est répétable.
--   • Le DESTINATAIRE IN-APP : l'événement est adressé à une ORGANISATION ; chaque
--     personne de cette organisation le voit, et marque SA propre lecture.
--   • L'ENVOI E-MAIL (`reserves_notifications_envois`) : une ligne par (événement, canal,
--     personne), avec une clé d'idempotence UNIQUE. Une action métier ne peut donc pas
--     produire trois fois le même e-mail, même si le distributeur est relancé.
create table public.reserves_notifications_types (
  type text primary key,
  categorie text not null check (categorie in (
    'attribution','responsabilite','levee','message','echeance','intervention'
  )),
  libelle text not null,
  -- Une notification critique reste TOUJOURS distribuée in-app, quelles que soient les
  -- préférences : couper l'e-mail est un confort, se rendre aveugle n'en est pas un.
  critique boolean not null default false
);

insert into public.reserves_notifications_types (type, categorie, libelle, critique) values
  ('reserve_creee','attribution','Nouvelle réserve',false),
  ('reserve_assignee','attribution','Réserve attribuée à votre entreprise',true),
  ('reserve_annulee','attribution','Réserve annulée',false),
  ('reserve_reouverte','attribution','Réserve rouverte',true),
  ('reserve_transferee','attribution','Réserve transférée à une autre entreprise',true),
  ('responsabilite_refusee','responsabilite','Responsabilité refusée',true),
  ('responsabilite_acceptee','responsabilite','Responsabilité acceptée',false),
  ('levee_demandee','levee','Levée demandée',true),
  ('levee_validee','levee','Levée validée',true),
  ('levee_refusee','levee','Levée refusée',true),
  ('message_recu','message','Nouveau message',false),
  ('echeance_proche','echeance','Échéance proche',false),
  ('invitation_envoyee','intervention','Invitation envoyée',false),
  ('intervenant_revoque','intervention','Accès entreprise révoqué',true);

-- Le `check` inline de 00268 figeait la liste des types. Il est remplacé par une clé
-- étrangère vers la table de référence ci-dessus : ajouter un type devient une insertion
-- de donnée, plus une réécriture de contrainte.
alter table public.reserves_evenements_notifications
  drop constraint if exists reserves_evenements_notifications_type_check;
alter table public.reserves_evenements_notifications
  add constraint reserves_evenements_notifications_type_fk
  foreign key (type) references public.reserves_notifications_types(type);

-- Clé d'idempotence de l'ÉVÉNEMENT lui-même. Nulle pour les gestes uniques (une
-- transition est un fait daté, qui peut légitimement se répéter) ; renseignée pour les
-- producteurs répétables — au premier rang desquels les échéances, qui repassent chaque
-- nuit sur les mêmes réserves.
alter table public.reserves_evenements_notifications
  add column if not exists cle_evenement text
    check (cle_evenement is null or length(cle_evenement) <= 200);
create unique index if not exists reserves_notifications_cle_unique
  on public.reserves_evenements_notifications (cle_evenement) where cle_evenement is not null;

-- ── 4.1 Lecture in-app, par personne ─────────────────────────────────────────
create table public.reserves_notifications_lectures (
  evenement_id uuid not null
    references public.reserves_evenements_notifications(id) on delete cascade,
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  lu_at timestamptz not null default now(),
  primary key (evenement_id, utilisateur_id)
);
create index reserves_notifications_lectures_utilisateur_idx
  on public.reserves_notifications_lectures (utilisateur_id, lu_at desc);

-- ── 4.2 Préférences, par personne et par organisation ────────────────────────
-- Portées par (personne, organisation) et non par personne seule : quelqu'un qui
-- intervient chez deux donneurs d'ordre peut vouloir des e-mails de l'un et pas de
-- l'autre. Seul le canal E-MAIL est réglable — l'in-app reste toujours disponible.
create table public.reserves_preferences_notifications (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  categorie text not null check (categorie in (
    'attribution','responsabilite','levee','message','echeance','intervention'
  )),
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (utilisateur_id, entreprise_id, categorie)
);

create trigger reserves_preferences_updated before update on public.reserves_preferences_notifications
  for each row execute function public.reserves_set_updated_at();

-- ── 4.3 Envois, avec clé d'idempotence ───────────────────────────────────────
-- `cle_idempotence` est UNIQUE et déterministe : événement + canal + destinataire.
-- Deux passages du distributeur sur le même événement produisent donc au plus une
-- ligne, donc au plus un e-mail. C'est la garantie demandée : « une action métier ne
-- doit pas produire trois fois le même e-mail ».
create table public.reserves_notifications_envois (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null
    references public.reserves_evenements_notifications(id) on delete cascade,
  canal text not null check (canal in ('email')),
  destinataire_utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  destinataire_email text not null,
  cle_idempotence text not null unique,
  statut text not null default 'a_envoyer'
    check (statut in ('a_envoyer','envoye','echec','ignore')),
  tentatives integer not null default 0 check (tentatives >= 0),
  envoye_at timestamptz,
  erreur text check (erreur is null or length(erreur) <= 500),
  created_at timestamptz not null default now(),
  check (statut <> 'envoye' or envoye_at is not null)
);
create index reserves_envois_a_traiter_idx
  on public.reserves_notifications_envois (created_at)
  where statut = 'a_envoyer';

-- ── 4.4 Qui reçoit quoi ──────────────────────────────────────────────────────
-- Destinataires d'un événement : les personnes actives de l'organisation destinataire
-- qui possèdent réellement un accès Réserves. On ne notifie jamais un compte qui ne
-- pourrait pas ouvrir le lien reçu.
create or replace function public.reserves_notification_destinataires(p_evenement_id uuid)
returns table (utilisateur_id uuid, entreprise_id uuid, email text, email_actif boolean)
language sql security definer stable set search_path = public as $$
  select u.id,
         ev.destinataire_entreprise_id,
         au.email,
         coalesce(pref.email, true)
  from public.reserves_evenements_notifications ev
  join public.reserves_notifications_types t on t.type = ev.type
  join public.utilisateurs_entreprises ue
    on ue.entreprise_id = ev.destinataire_entreprise_id and ue.statut = 'actif'
  join public.utilisateurs u on u.id = ue.utilisateur_id
  join auth.users au on au.id = u.id
  left join public.reserves_preferences_notifications pref
    on pref.utilisateur_id = u.id
   and pref.entreprise_id = ev.destinataire_entreprise_id
   and pref.categorie = t.categorie
  where ev.id = p_evenement_id
    and ev.destinataire_entreprise_id is not null
    and au.email is not null
    -- Accès de l'ORGANISATION destinataire, vérifié directement plutôt que par
    -- `a_acces_application` : cette dernière répond pour l'UTILISATEUR COURANT, or le
    -- distributeur s'exécute sous le rôle de service, sans session. L'appeler ici
    -- renverrait toujours faux et la file ne partirait jamais.
    and exists (
      select 1
      from public.acces_applications_entreprises ae
      join public.applications_elsatia app on app.code = ae.application_code and app.actif
      where ae.entreprise_id = ev.destinataire_entreprise_id
        and ae.application_code = 'reserves'
        and ae.autorise
        and (ae.valide_du is null or ae.valide_du <= now())
        and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())
    )
    -- Une personne n'est destinataire que si elle est habilitée à Réserves dans cette
    -- organisation : l'accès de l'organisation ne suffit pas.
    and exists (
      select 1 from public.habilitations_applications_utilisateurs h
      where h.entreprise_id = ev.destinataire_entreprise_id
        and h.utilisateur_id = u.id
        and h.application_code = 'reserves'
        and h.autorise
        and (h.valide_du is null or h.valide_du <= now())
        and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
    );
$$;

-- ── 4.5 Distribution ─────────────────────────────────────────────────────────
-- Appelée par le distributeur applicatif (rôle service, cf. section 11). Elle ne fait
-- que PRÉPARER les envois : elle n'expédie rien, elle grave l'intention avec sa clé
-- d'idempotence. L'expédition réelle est le métier de la couche applicative, qui
-- possède seule le canal Brevo commun à ELSATIA.
create or replace function public.reserves_notifications_preparer(p_limite integer default 200)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_prepares integer := 0;
begin
  with a_traiter as (
    select ev.id
    from public.reserves_evenements_notifications ev
    -- Aucun filtre sur le destinataire : un événement sans organisation destinataire
    -- (entreprise extérieure pas encore rattachée) ne produit aucun envoi, mais doit
    -- tout de même sortir de la file, sinon le distributeur le rescanne indéfiniment.
    where ev.distribue_at is null
    order by ev.created_at
    limit least(greatest(coalesce(p_limite, 200), 1), 2000)
    for update skip locked
  ),
  inseres as (
    insert into public.reserves_notifications_envois (
      evenement_id, canal, destinataire_utilisateur_id, destinataire_email,
      cle_idempotence, statut
    )
    select a.id, 'email', d.utilisateur_id, d.email,
           a.id::text || ':email:' || d.utilisateur_id::text,
           case when d.email_actif then 'a_envoyer' else 'ignore' end
    from a_traiter a
    cross join lateral public.reserves_notification_destinataires(a.id) d
    on conflict (cle_idempotence) do nothing
    returning evenement_id
  ),
  marques as (
    update public.reserves_evenements_notifications ev
    set distribue_at = now(), canal = 'in_app'
    where ev.id in (select id from a_traiter)
    returning ev.id
  )
  select count(*) into v_prepares from marques;
  return v_prepares;
end;
$$;

-- File d'expédition, pour le distributeur applicatif. Rend le strict nécessaire à la
-- composition du message : jamais le hachage d'un jeton, jamais une donnée d'un autre
-- tenant que celui du destinataire.
create or replace function public.reserves_notifications_a_expedier(p_limite integer default 100)
returns table (
  envoi_id uuid, email text, type text, libelle text, categorie text,
  chantier text, reserve_numero integer, reserve_titre text, reserve_id uuid,
  organisation text, payload jsonb
)
language sql security definer stable set search_path = public as $$
  select en.id, en.destinataire_email, ev.type, t.libelle, t.categorie,
         c.nom, r.numero, r.titre, r.id,
         coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
         ev.payload
  from public.reserves_notifications_envois en
  join public.reserves_evenements_notifications ev on ev.id = en.evenement_id
  join public.reserves_notifications_types t on t.type = ev.type
  left join public.reserves_chantiers c on c.id = ev.chantier_id
  left join public.reserves r on r.id = ev.reserve_id
  left join public.entreprises e on e.id = ev.entreprise_id
  where en.statut = 'a_envoyer'
  order by en.created_at
  limit least(greatest(coalesce(p_limite, 100), 1), 500);
$$;

create or replace function public.reserves_notification_envoi_statuer(
  p_envoi_id uuid, p_succes boolean, p_erreur text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reserves_notifications_envois
  set statut = case when p_succes then 'envoye' else 'echec' end,
      envoye_at = case when p_succes then now() else envoye_at end,
      tentatives = tentatives + 1,
      erreur = case when p_succes then null else left(p_erreur, 500) end
  where id = p_envoi_id;
end;
$$;

-- ── 4.6 In-app ───────────────────────────────────────────────────────────────
-- Ce que la personne voit dans l'application. La visibilité reprend exactement la règle
-- de la policy de 00268 : membre actif de l'organisation destinataire, avec accès
-- Réserves. Rien n'est élargi ici.
create or replace function public.reserves_notifications_in_app(
  p_limite integer default 50, p_non_lues_seulement boolean default false
) returns table (
  id uuid, type text, libelle text, categorie text, critique boolean,
  chantier_id uuid, chantier text, reserve_id uuid, reserve_numero integer,
  reserve_titre text, payload jsonb, lu boolean, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select ev.id, ev.type, t.libelle, t.categorie, t.critique,
         ev.chantier_id, c.nom, ev.reserve_id, r.numero, r.titre,
         ev.payload, lec.utilisateur_id is not null, ev.created_at
  from public.reserves_evenements_notifications ev
  join public.reserves_notifications_types t on t.type = ev.type
  left join public.reserves_chantiers c on c.id = ev.chantier_id
  left join public.reserves r on r.id = ev.reserve_id
  left join public.reserves_notifications_lectures lec
    on lec.evenement_id = ev.id and lec.utilisateur_id = auth.uid()
  where ev.destinataire_entreprise_id is not null
    and public.est_membre_actif(ev.destinataire_entreprise_id)
    and public.a_acces_application(ev.destinataire_entreprise_id, 'reserves')
    and (not coalesce(p_non_lues_seulement, false) or lec.utilisateur_id is null)
  order by ev.created_at desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

create or replace function public.reserves_notifications_marquer_lues(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_lues integer;
begin
  if auth.uid() is null then return 0; end if;
  with visibles as (
    select ev.id from public.reserves_evenements_notifications ev
    where ev.destinataire_entreprise_id is not null
      and public.est_membre_actif(ev.destinataire_entreprise_id)
      and public.a_acces_application(ev.destinataire_entreprise_id, 'reserves')
      and (p_ids is null or ev.id = any (p_ids))
  ),
  inserees as (
    insert into public.reserves_notifications_lectures (evenement_id, utilisateur_id)
    select v.id, auth.uid() from visibles v
    on conflict (evenement_id, utilisateur_id) do nothing
    returning evenement_id
  )
  select count(*) into v_lues from inserees;
  return v_lues;
end;
$$;

create or replace function public.reserves_notifications_compteur()
returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::integer
  from public.reserves_evenements_notifications ev
  left join public.reserves_notifications_lectures lec
    on lec.evenement_id = ev.id and lec.utilisateur_id = auth.uid()
  where ev.destinataire_entreprise_id is not null
    and public.est_membre_actif(ev.destinataire_entreprise_id)
    and public.a_acces_application(ev.destinataire_entreprise_id, 'reserves')
    and lec.utilisateur_id is null;
$$;

create or replace function public.reserves_preferences_lire(p_entreprise_id uuid)
returns table (categorie text, libelle text, email boolean, contient_critique boolean)
language sql security definer stable set search_path = public as $$
  select cat.categorie,
         cat.libelle,
         coalesce(pref.email, true),
         cat.contient_critique
  from (
    select t.categorie,
           min(t.libelle) as libelle,
           bool_or(t.critique) as contient_critique
    from public.reserves_notifications_types t
    group by t.categorie
  ) cat
  left join public.reserves_preferences_notifications pref
    on pref.categorie = cat.categorie
   and pref.utilisateur_id = auth.uid()
   and pref.entreprise_id = p_entreprise_id
  where public.est_membre_actif(p_entreprise_id)
  order by cat.categorie;
$$;

-- Le réglage ne porte que sur l'e-mail. Il n'existe volontairement aucune fonction pour
-- couper l'in-app : une notification critique doit rester atteignable dans le produit.
create or replace function public.reserves_preferences_definir(
  p_entreprise_id uuid, p_categorie text, p_email boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Vous n''êtes pas membre actif de cette organisation';
  end if;
  if not exists (
    select 1 from public.reserves_notifications_types where categorie = p_categorie
  ) then
    raise exception 'Catégorie de notification inconnue';
  end if;

  insert into public.reserves_preferences_notifications (
    utilisateur_id, entreprise_id, categorie, email
  ) values (auth.uid(), p_entreprise_id, p_categorie, coalesce(p_email, true))
  on conflict (utilisateur_id, entreprise_id, categorie)
  do update set email = excluded.email, updated_at = now();
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRANSFERT DE RESPONSABILITÉ : LA MATRICE S'ÉTEND, PAS LE CODE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Jusqu'ici, une réserve ne pouvait être réattribuée que depuis `assignee` ou
-- `refusee_responsabilite`. Or le cas qui compte vraiment est celui d'une entreprise
-- révoquée en cours de chantier, alors qu'elle avait déjà accepté, voire demandé la
-- levée : la réserve restait bloquée sur une entreprise qui n'a plus accès.
--
-- Trois lignes de matrice suffisent. Le motif est obligatoire : transférer une
-- responsabilité déjà acceptée est une décision qui doit se justifier au dossier.
insert into public.reserves_transitions (statut_avant, statut_apres, acteur, action, commentaire_obligatoire) values
  ('acceptee','assignee','hote','reassignation',true),
  ('levee_demandee','assignee','hote','reassignation',true),
  ('levee_refusee','assignee','hote','reassignation',true)
on conflict (statut_avant, statut_apres, acteur) do nothing;

-- Redéfinition de la transition. Par rapport à 00269, trois ajouts et rien de retiré :
--   • l'acceptation de responsabilité produit enfin une notification ;
--   • un transfert prévient AUSSI l'entreprise dessaisie, qui doit savoir qu'elle n'a
--     plus la charge — sans quoi elle continuerait à travailler pour rien ;
--   • le payload transporte le chantier, utile à la composition des e-mails.
create or replace function public.reserves_appliquer_transition(
  p_reserve_id uuid,
  p_statut_apres text,
  p_commentaire text default null,
  p_intervenant_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_transition public.reserves_transitions;
  v_intervenant uuid;
  v_entreprise_intervenante uuid;
  v_entreprise_dessaisie uuid;
  v_type_notification text;
  v_destinataire uuid;
  v_payload jsonb;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id for update;
  if not found then raise exception 'Réserve introuvable'; end if;

  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Action non autorisée sur cette réserve'; end if;

  select * into v_transition from public.reserves_transitions
  where statut_avant = v_reserve.statut and statut_apres = p_statut_apres and acteur = v_acteur;
  if not found then
    raise exception 'Transition % → % impossible pour l''acteur %',
      v_reserve.statut, p_statut_apres, v_acteur;
  end if;

  if v_transition.commentaire_obligatoire and coalesce(btrim(p_commentaire), '') = '' then
    raise exception 'Un motif est obligatoire pour l''action %', v_transition.action;
  end if;

  v_intervenant := v_reserve.intervenant_id;
  if v_transition.action in ('assignation','reassignation') then
    if p_intervenant_id is null then raise exception 'Aucune entreprise intervenante fournie'; end if;
    v_intervenant := p_intervenant_id;
  elsif p_intervenant_id is not null and p_intervenant_id is distinct from v_reserve.intervenant_id then
    raise exception 'Cette action ne peut pas réattribuer la réserve';
  end if;

  if v_transition.action = 'demande_levee' and v_reserve.photo_obligatoire_levee then
    if not exists (
      select 1 from public.reserves_photos
      where reserve_id = p_reserve_id
        and usage in ('travaux','levee')
        and disponible_at is not null
        and supprimee_at is null
    ) then
      raise exception 'Photo obligatoire : ajoutez une preuve avant de demander la levée';
    end if;
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves set
    statut = p_statut_apres,
    intervenant_id = v_intervenant,
    assignee_at = case when v_transition.action in ('assignation','reassignation','reouverture')
                       then now() else assignee_at end,
    acceptee_at = case when v_transition.action = 'acceptation' then now()
                       when v_transition.action in ('reouverture','reassignation') then null
                       else acceptee_at end,
    levee_demandee_at = case when v_transition.action = 'demande_levee' then now()
                             when v_transition.action in ('reouverture','reassignation') then null
                             else levee_demandee_at end,
    levee_at = case when v_transition.action = 'levee_validee' then now()
                    when v_transition.action in ('reouverture','reassignation') then null
                    else levee_at end,
    cloturee_at = case when p_statut_apres in ('levee','annulee') then now() else null end
  where id = p_reserve_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  update public.reserves_photos
  set verrouillee_at = now()
  where reserve_id = p_reserve_id
    and disponible_at is not null and supprimee_at is null and verrouillee_at is null;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, v_transition.action, v_reserve.statut, p_statut_apres,
    case when v_intervenant is distinct from v_reserve.intervenant_id then 'intervenant_id' end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_reserve.intervenant_id::text end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_intervenant::text end,
    nullif(btrim(coalesce(p_commentaire, '')), ''), auth.uid(),
    case when v_acteur = 'hote' then v_reserve.entreprise_id else null end
  );

  select i.entreprise_intervenante_id into v_entreprise_intervenante
  from public.reserves_intervenants i where i.id = v_intervenant;

  v_type_notification := case v_transition.action
    when 'assignation' then 'reserve_assignee'
    when 'reassignation' then 'reserve_assignee'
    when 'acceptation' then 'responsabilite_acceptee'
    when 'refus_responsabilite' then 'responsabilite_refusee'
    when 'demande_levee' then 'levee_demandee'
    when 'levee_validee' then 'levee_validee'
    when 'levee_refusee' then 'levee_refusee'
    when 'reouverture' then 'reserve_reouverte'
    when 'annulation' then 'reserve_annulee'
    else null end;

  v_destinataire := case when v_acteur = 'hote' then v_entreprise_intervenante
                         else v_reserve.entreprise_id end;

  v_payload := jsonb_build_object(
    'statut_avant', v_reserve.statut, 'statut_apres', p_statut_apres,
    'numero', v_reserve.numero, 'titre', v_reserve.titre,
    'action', v_transition.action
  );

  if v_type_notification is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_type_notification,
      v_destinataire, v_payload
    );
  end if;

  -- Entreprise dessaisie : elle apprend le transfert. Sans cette notification, elle
  -- découvrirait la perte de la charge en constatant que la réserve a disparu de sa
  -- liste — ce qui ressemble à un bug, pas à une décision.
  if v_intervenant is distinct from v_reserve.intervenant_id
     and v_reserve.intervenant_id is not null then
    select i.entreprise_intervenante_id into v_entreprise_dessaisie
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
    if v_entreprise_dessaisie is not null
       and v_entreprise_dessaisie is distinct from v_entreprise_intervenante then
      insert into public.reserves_evenements_notifications (
        entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
      ) values (
        v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, 'reserve_transferee',
        v_entreprise_dessaisie, v_payload
      );
    end if;
  end if;
end;
$$;

-- Transfert explicite, avec motif obligatoire. C'est le geste qu'on pose après avoir
-- révoqué une entreprise : la réserve retourne au statut « assignée » chez le nouveau
-- porteur, et l'historique conserve intégralement le passage de l'ancien.
create or replace function public.reserves_transferer_responsabilite(
  p_reserve_id uuid, p_intervenant_cible_id uuid, p_motif text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_cible public.reserves_intervenants;
begin
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Un motif est obligatoire pour transférer une réserve';
  end if;
  select entreprise_id into v_entreprise from public.reserves where id = p_reserve_id;
  if v_entreprise is null then raise exception 'Réserve introuvable'; end if;
  if not public.reserves_action_autorisee(v_entreprise, 'assigner') then
    raise exception 'Transfert non autorisé';
  end if;

  select * into v_cible from public.reserves_intervenants where id = p_intervenant_cible_id;
  if not found then raise exception 'Entreprise intervenante introuvable'; end if;
  if v_cible.statut = 'revoquee' then
    raise exception 'Impossible de transférer vers une entreprise révoquée';
  end if;

  perform public.reserves_appliquer_transition(
    p_reserve_id, 'assignee', p_motif, p_intervenant_cible_id
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. RÉVOCATION D'UNE ENTREPRISE INTERVENANTE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Conséquences, énoncées sans ambiguïté parce qu'une révocation mal comprise détruit la
-- confiance dans le produit :
--
--   • ACCÈS COUPÉ IMMÉDIATEMENT. `reserves_intervenant_courant` exige `statut = 'active'` :
--     la ligne passée à « revoquee », l'entreprise ne voit plus rien du chantier — ni les
--     nouvelles réserves, ni celles qu'elle portait. « Révoquer l'accès » veut dire cela ;
--     prétendre le contraire serait mentir sur ce que fait le bouton.
--   • HISTORIQUE INTACT. Aucune ligne de `reserves_historique`, `reserves_photos`,
--     `reserves_messages` ni `reserves_transitions` n'est touchée. Côté hôte, le dossier
--     reste complet et exportable, l'entreprise dessaisie y figure nommément.
--   • RÉSERVES EN COURS SIGNALÉES. La fonction renvoie le nombre de réserves encore
--     ouvertes sur cette entreprise : c'est la liste de ce qu'il reste à transférer.
--   • ACCÈS APPLICATIF GRATUIT RETIRÉ, mais SEULEMENT s'il venait d'une invitation et
--     qu'aucune autre intervention active ne le justifie encore. On ne coupe jamais
--     l'accès d'un client qui paie Réserves pour son propre compte.
drop function if exists public.reserves_revoquer_intervenant(uuid);

create or replace function public.reserves_revoquer_intervenant(
  p_intervenant_id uuid,
  p_motif text default null
) returns table (reserves_ouvertes integer, acces_retire boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_intervenant public.reserves_intervenants;
  v_ouvertes integer;
  v_acces_retire boolean := false;
  v_autres integer;
begin
  select * into v_intervenant from public.reserves_intervenants where id = p_intervenant_id;
  if not found then raise exception 'Intervenant introuvable'; end if;
  if not public.reserves_action_autorisee(v_intervenant.entreprise_id, 'gerer_intervenants') then
    raise exception 'Révocation non autorisée';
  end if;
  if v_intervenant.statut = 'revoquee' then
    raise exception 'Cette entreprise est déjà révoquée';
  end if;

  select count(*) into v_ouvertes from public.reserves r
  where r.intervenant_id = p_intervenant_id and r.statut not in ('levee','annulee');

  update public.reserves_intervenants
  set statut = 'revoquee', revoque_at = now()
  where id = p_intervenant_id;

  -- Toute invitation encore vivante tombe avec l'intervention : un lien envoyé la veille
  -- ne doit pas rouvrir demain une porte qu'on vient de fermer.
  update public.reserves_invitations
  set revoque_at = now(), revoque_par = auth.uid()
  where intervenant_id = p_intervenant_id and consomme_at is null and revoque_at is null;

  if v_intervenant.entreprise_intervenante_id is not null then
    select count(*) into v_autres from public.reserves_intervenants i
    where i.entreprise_intervenante_id = v_intervenant.entreprise_intervenante_id
      and i.id <> p_intervenant_id
      and i.statut = 'active';

    if v_autres = 0 then
      delete from public.acces_applications_entreprises
      where entreprise_id = v_intervenant.entreprise_intervenante_id
        and application_code = 'reserves'
        -- Uniquement l'accès GRATUIT né d'une invitation. Un abonnement propre, une
        -- attribution commerciale ou un accès plateforme ne sont jamais retirés ici.
        and source = 'reserves_invitation_gratuite';
      v_acces_retire := found;
    end if;

    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, type, destinataire_entreprise_id, payload
    ) values (
      v_intervenant.entreprise_id, v_intervenant.chantier_id, 'intervenant_revoque',
      v_intervenant.entreprise_intervenante_id,
      jsonb_build_object('intervenant', v_intervenant.nom,
                         'motif', nullif(btrim(coalesce(p_motif, '')), ''))
    );
  end if;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values (
    'entreprise', v_intervenant.entreprise_id, 'reserves',
    'reserves_intervenant_revoque:' || p_intervenant_id::text, auth.email()
  );

  return query select v_ouvertes, v_acces_retire;
end;
$$;

-- Réactivation, parce qu'une révocation par erreur doit se réparer sans repasser par
-- une invitation complète quand l'organisation est déjà rattachée.
create or replace function public.reserves_reactiver_intervenant(p_intervenant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_intervenant public.reserves_intervenants;
begin
  select * into v_intervenant from public.reserves_intervenants where id = p_intervenant_id;
  if not found then raise exception 'Intervenant introuvable'; end if;
  if not public.reserves_action_autorisee(v_intervenant.entreprise_id, 'gerer_intervenants') then
    raise exception 'Réactivation non autorisée';
  end if;
  if v_intervenant.statut <> 'revoquee' then
    raise exception 'Cette entreprise n''est pas révoquée';
  end if;

  if v_intervenant.entreprise_intervenante_id is null then
    -- Jamais rattachée : elle repart au statut « invitée », donc par une invitation.
    update public.reserves_intervenants
    set statut = 'invitee', revoque_at = null where id = p_intervenant_id;
    return;
  end if;

  update public.reserves_intervenants
  set statut = 'active', revoque_at = null, rejoint_at = coalesce(rejoint_at, now())
  where id = p_intervenant_id;

  insert into public.acces_applications_entreprises (
    entreprise_id, application_code, autorise, source, reference_externe
  ) values (
    v_intervenant.entreprise_intervenante_id, 'reserves', true,
    'reserves_invitation_gratuite', p_intervenant_id::text
  )
  on conflict (entreprise_id, application_code) do nothing;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. ÉCHÉANCES : UN PRODUCTEUR RÉEL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Le type `echeance_proche` existait depuis 00268 sans que rien ne l'émette jamais.
-- Le producteur ci-dessous est appelé par la tâche planifiée de l'application. Il est
-- IDEMPOTENT par construction : la clé d'événement porte la réserve et le palier, donc
-- repasser dix fois dans la journée ne produit pas dix alertes.
--
-- Paliers par défaut : J-7, J-3, J-1. Ils sont paramétrables parce que la bonne cadence
-- dépend du chantier — une réception en fin de gros œuvre ne se pilote pas comme une
-- levée de finitions.
--
-- Destinataire : l'entreprise PORTEUSE, celle qui doit agir. Une réserve encore émise et
-- non attribuée n'a pas de porteur : c'est alors l'organisation hôte qui est alertée,
-- puisque c'est elle qui doit l'attribuer avant l'échéance.
create or replace function public.reserves_produire_echeances(
  p_paliers integer[] default array[7,3,1]
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_produits integer;
begin
  with cibles as (
    select r.id as reserve_id, r.entreprise_id, r.chantier_id, r.numero, r.titre,
           r.echeance, p.palier,
           i.entreprise_intervenante_id
    from public.reserves r
    cross join unnest(coalesce(p_paliers, array[7,3,1])) as p(palier)
    left join public.reserves_intervenants i on i.id = r.intervenant_id
    where r.echeance is not null
      and r.statut not in ('levee','annulee')
      and r.echeance = current_date + p.palier
  ),
  inseres as (
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type,
      destinataire_entreprise_id, payload, cle_evenement
    )
    select c.entreprise_id, c.chantier_id, c.reserve_id, 'echeance_proche',
           coalesce(c.entreprise_intervenante_id, c.entreprise_id),
           jsonb_build_object(
             'numero', c.numero, 'titre', c.titre,
             'echeance', c.echeance, 'jours_restants', c.palier
           ),
           'echeance:' || c.reserve_id::text || ':J-' || c.palier::text
    from cibles c
    where coalesce(c.entreprise_intervenante_id, c.entreprise_id) is not null
    -- L'index d'unicité est PARTIEL (`where cle_evenement is not null`) : son prédicat
    -- doit être répété ici, sinon PostgreSQL ne sait pas quel index inférer.
    on conflict (cle_evenement) where cle_evenement is not null do nothing
    returning id
  )
  select count(*) into v_produits from inseres;
  return v_produits;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. PLANS PDF : LA PAGE DEVIENT UNE COORDONNÉE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- La V2 savait afficher un PDF mais pas y poser de pastille : le repérage exigeait une
-- image. Sur un chantier, les plans arrivent en PDF multipages — c'est le format réel,
-- pas un cas limite.
--
-- Le contrat de coordonnées devient donc (plan_id, page, x_norm, y_norm), avec x et y
-- toujours dans [0,1] RELATIVEMENT À LA PAGE. C'est ce qui rend le zoom sans effet sur
-- la donnée : la fraction de page ne dépend d'aucun facteur d'échelle d'affichage.
alter table public.reserves
  add column if not exists plan_page integer
    check (plan_page is null or (plan_page >= 1 and plan_page <= 500));

-- Les réserves déjà pointées l'ont été sur une image, c'est-à-dire une page unique.
update public.reserves set plan_page = 1 where position_x is not null and plan_page is null;

alter table public.reserves
  add constraint reserves_plan_page_coherence
    check (plan_page is null or plan_id is not null),
  -- Toute réserve pointée porte une page. Pour une image, c'est 1.
  add constraint reserves_position_page_coherence
    check (position_x is null or plan_page is not null);

create index if not exists reserves_plan_page_idx
  on public.reserves (plan_id, plan_page) where plan_id is not null;

-- `reserves_supprimer_plan` (00269) libérait `plan_id`, `position_x` et `position_y`,
-- mais la page n'existait pas encore. Sans cette reprise, retirer un plan qui portait
-- des réserves violerait la contrainte de cohérence qu'on vient de poser : la page
-- survivrait à son plan. Le reste de la fonction est inchangé.
create or replace function public.reserves_supprimer_plan(p_plan_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_plan public.reserves_plans;
begin
  select * into v_plan from public.reserves_plans where id = p_plan_id;
  if not found then raise exception 'Plan introuvable'; end if;
  if not public.reserves_action_autorisee(v_plan.entreprise_id, 'gerer_plans') then
    raise exception 'Suppression de plan non autorisée';
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves
  set plan_id = null, plan_page = null, position_x = null, position_y = null
  where plan_id = p_plan_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  delete from public.reserves_plans where id = p_plan_id;
end;
$$;

-- Pagination réelle du document, renseignée par le client au premier rendu (pdf.js
-- connaît le nombre de pages ; PostgreSQL, non). Sert au sélecteur de pages et à
-- refuser une page qui n'existe pas.
alter table public.reserves_plans
  add column if not exists nb_pages integer
    check (nb_pages is null or (nb_pages >= 1 and nb_pages <= 500));

create or replace function public.reserves_enregistrer_pagination(
  p_plan_id uuid, p_nb_pages integer
) returns void
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.reserves_plans where id = p_plan_id;
  if v_entreprise is null then raise exception 'Plan introuvable'; end if;
  -- Lire le plan suffit pour en constater la pagination : un intervenant qui ouvre le
  -- document est légitime à enregistrer ce que le rendu lui apprend.
  if not (public.reserves_action_autorisee(v_entreprise, 'voir')
          or public.reserves_plan_visible_intervenant(p_plan_id)) then
    raise exception 'Plan non accessible';
  end if;
  if p_nb_pages is null or p_nb_pages < 1 or p_nb_pages > 500 then
    raise exception 'Nombre de pages invalide';
  end if;
  update public.reserves_plans set nb_pages = p_nb_pages
  where id = p_plan_id and nb_pages is distinct from p_nb_pages;
end;
$$;

-- `reserves_creer` gagne la page du plan. La signature change : la fonction de 00268 est
-- retirée explicitement plutôt que dupliquée en surcharge, pour qu'il n'existe jamais
-- deux chemins de création dont l'un ignorerait la page.
drop function if exists public.reserves_creer(uuid,text,text,text,uuid,uuid,numeric,numeric,boolean,date,uuid);

create or replace function public.reserves_creer(
  p_chantier_id uuid,
  p_titre text,
  p_description text default null,
  p_priorite text default 'normale',
  p_intervenant_id uuid default null,
  p_plan_id uuid default null,
  p_position_x numeric default null,
  p_position_y numeric default null,
  p_photo_obligatoire_levee boolean default false,
  p_echeance date default null,
  p_origine_client_id uuid default null,
  p_plan_page integer default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_id uuid; v_page integer;
begin
  select entreprise_id into v_entreprise from public.reserves_chantiers where id = p_chantier_id;
  if v_entreprise is null then raise exception 'Chantier Réserves introuvable'; end if;
  if not public.reserves_action_autorisee(v_entreprise, 'creer_reserve') then
    raise exception 'Création de réserve non autorisée';
  end if;

  if p_origine_client_id is not null then
    select id into v_id from public.reserves
    where entreprise_id = v_entreprise and origine_client_id = p_origine_client_id;
    if v_id is not null then return v_id; end if;
  end if;

  -- Une réserve pointée sans page explicite est sur la première : c'est le cas des
  -- plans image, et le comportement attendu d'un PDF d'une seule page.
  v_page := case when p_position_x is null then null else coalesce(p_plan_page, 1) end;
  if v_page is not null and p_plan_id is not null then
    if exists (
      select 1 from public.reserves_plans
      where id = p_plan_id and nb_pages is not null and v_page > nb_pages
    ) then
      raise exception 'Cette page n''existe pas dans le plan';
    end if;
  end if;

  insert into public.reserves (
    entreprise_id, chantier_id, titre, description, priorite, intervenant_id,
    plan_id, position_x, position_y, plan_page, photo_obligatoire_levee, echeance,
    statut, assignee_at, origine_client_id
  ) values (
    v_entreprise, p_chantier_id, p_titre, p_description, coalesce(p_priorite,'normale'),
    p_intervenant_id, p_plan_id, p_position_x, p_position_y, v_page,
    coalesce(p_photo_obligatoire_levee, false), p_echeance,
    case when p_intervenant_id is null then 'emise' else 'assignee' end,
    case when p_intervenant_id is null then null else now() end,
    p_origine_client_id
  ) returning id into v_id;

  if p_intervenant_id is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    )
    select v_entreprise, p_chantier_id, v_id, 'reserve_assignee', i.entreprise_intervenante_id,
           jsonb_build_object('titre', p_titre)
    from public.reserves_intervenants i
    where i.id = p_intervenant_id and i.entreprise_intervenante_id is not null;
  end if;
  return v_id;
end;
$$;

-- Repositionnement d'une réserve existante sur un plan. Passe par une RPC plutôt que par
-- un `update` direct pour que la cohérence page / plan / bornes soit vérifiée au même
-- endroit qu'à la création.
create or replace function public.reserves_repositionner(
  p_reserve_id uuid,
  p_plan_id uuid,
  p_plan_page integer,
  p_position_x numeric,
  p_position_y numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare v_reserve public.reserves; v_page integer;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  if not public.reserves_action_autorisee(v_reserve.entreprise_id, 'creer_reserve') then
    raise exception 'Repositionnement non autorisé';
  end if;

  if p_plan_id is null then
    update public.reserves
    set plan_id = null, plan_page = null, position_x = null, position_y = null
    where id = p_reserve_id;
    return;
  end if;

  if p_position_x is null or p_position_y is null
     or p_position_x < 0 or p_position_x > 1 or p_position_y < 0 or p_position_y > 1 then
    raise exception 'Position invalide';
  end if;

  v_page := coalesce(p_plan_page, 1);
  if exists (
    select 1 from public.reserves_plans
    where id = p_plan_id and nb_pages is not null and v_page > nb_pages
  ) then
    raise exception 'Cette page n''existe pas dans le plan';
  end if;

  update public.reserves
  set plan_id = p_plan_id, plan_page = v_page,
      position_x = p_position_x, position_y = p_position_y
  where id = p_reserve_id;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_apres, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, 'modification', v_reserve.statut, v_reserve.statut,
    'position', 'page ' || v_page::text, auth.uid(), v_reserve.entreprise_id
  );
end;
$$;

-- Pastilles d'une page. Une seule source pour la visionneuse : elle ne recalcule rien et
-- ne filtre rien côté client, donc elle ne peut pas afficher un repère que l'appelant
-- n'aurait pas le droit de voir.
create or replace function public.reserves_reperes_plan(
  p_plan_id uuid, p_page integer default 1
) returns table (
  id uuid, numero integer, titre text, statut text, priorite text,
  position_x numeric, position_y numeric
)
language sql security definer stable set search_path = public as $$
  select r.id, r.numero, r.titre, r.statut, r.priorite, r.position_x, r.position_y
  from public.reserves r
  where r.plan_id = p_plan_id
    and r.position_x is not null
    and coalesce(r.plan_page, 1) = coalesce(p_page, 1)
    and (
      public.reserves_action_autorisee(r.entreprise_id, 'voir')
      or public.reserves_intervenant_courant(r.intervenant_id)
    )
  order by r.numero;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. MESSAGERIE : NON-LUS ET PIÈCE JOINTE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Le suivi de lecture est porté par un POINTEUR par conversation, pas par une ligne par
-- message. Une conversation de deux cents messages coûte alors une ligne, pas deux cents,
-- et le compteur de non-lus reste une comparaison d'horodatage.
create table public.reserves_conversations_lectures (
  conversation_id uuid not null
    references public.reserves_conversations(id) on delete cascade,
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  lu_jusqu_a timestamptz not null default now(),
  primary key (conversation_id, utilisateur_id)
);

-- Pièce jointe : plutôt qu'un second stockage à sécuriser, une photo de la réserve est
-- rattachée au message. Elle emprunte donc EXACTEMENT le chemin, les policies et le
-- cycle de vie de 00269 — chemin composé par la base, vérifié contre la réserve réelle.
-- L'usage `echange` la distingue des preuves : elle ne satisfait jamais l'exigence de
-- photo à la levée, qui reste réservée aux usages `travaux` et `levee`.
--
-- La signature de `reserves_commenter` gagne un paramètre : l'ancienne est retirée pour
-- qu'il n'existe pas deux surcharges dont l'une ignorerait la pièce jointe.
alter table public.reserves_photos drop constraint if exists reserves_photos_usage_check;
alter table public.reserves_photos
  add constraint reserves_photos_usage_check
  check (usage in ('constat','preuve_refus','travaux','levee','echange'));

alter table public.reserves_photos
  add column if not exists message_id uuid
    references public.reserves_messages(id) on delete set null;
create index if not exists reserves_photos_message_idx
  on public.reserves_photos (message_id) where message_id is not null;

-- `reserves_commenter` accepte une photo déjà déposée. Elle n'est rattachée que si elle
-- appartient à la même réserve et qu'elle est réellement disponible : on ne rattache pas
-- une preuve fantôme, ni la photo d'une autre réserve.
drop function if exists public.reserves_commenter(uuid, text);

create or replace function public.reserves_commenter(
  p_reserve_id uuid, p_contenu text, p_photo_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves; v_acteur text; v_conversation uuid;
  v_entreprise_auteur uuid; v_message uuid;
begin
  if coalesce(btrim(p_contenu), '') = '' then raise exception 'Message vide'; end if;
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Commentaire non autorisé'; end if;

  if v_acteur = 'hote' then
    v_entreprise_auteur := v_reserve.entreprise_id;
  else
    select i.entreprise_intervenante_id into v_entreprise_auteur
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
  end if;

  select id into v_conversation from public.reserves_conversations where reserve_id = p_reserve_id;
  if v_conversation is null then
    insert into public.reserves_conversations (
      entreprise_id, chantier_id, reserve_id, intervenant_id, portee, titre
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_reserve.intervenant_id,
      'reserve', 'Réserve n°' || v_reserve.numero || ' — ' || left(v_reserve.titre, 150)
    ) returning id into v_conversation;
  else
    -- La conversation suit le porteur courant : après un transfert, l'entreprise
    -- dessaisie ne doit plus lire les échanges qui suivent.
    update public.reserves_conversations
    set intervenant_id = v_reserve.intervenant_id, updated_at = now()
    where id = v_conversation and intervenant_id is distinct from v_reserve.intervenant_id;
  end if;

  insert into public.reserves_messages (
    entreprise_id, conversation_id, auteur_entreprise_id, contenu
  ) values (v_reserve.entreprise_id, v_conversation, v_entreprise_auteur, p_contenu)
  returning id into v_message;

  if p_photo_id is not null then
    update public.reserves_photos
    set message_id = v_message
    where id = p_photo_id
      and reserve_id = p_reserve_id
      and disponible_at is not null
      and supprimee_at is null
      and message_id is null;
    if not found then raise exception 'Photo introuvable ou déjà rattachée'; end if;
  end if;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, 'commentaire', v_reserve.statut, v_reserve.statut,
    left(p_contenu, 2000), auth.uid(), v_entreprise_auteur
  );

  insert into public.reserves_evenements_notifications (
    entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
  )
  select v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, 'message_recu',
         case when v_acteur = 'hote' then i.entreprise_intervenante_id else v_reserve.entreprise_id end,
         jsonb_build_object('numero', v_reserve.numero, 'titre', v_reserve.titre)
  from public.reserves_intervenants i
  where i.id = v_reserve.intervenant_id
    and (v_acteur <> 'hote' or i.entreprise_intervenante_id is not null);

  -- L'auteur a évidemment lu son propre message : sans cela, son compteur de non-lus
  -- s'incrémenterait à chaque envoi.
  insert into public.reserves_conversations_lectures (conversation_id, utilisateur_id, lu_jusqu_a)
  values (v_conversation, auth.uid(), now())
  on conflict (conversation_id, utilisateur_id) do update set lu_jusqu_a = now();

  return v_conversation;
end;
$$;

create or replace function public.reserves_conversation_marquer_lue(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.reserves_conversation_visible(p_conversation_id) then
    raise exception 'Conversation non accessible';
  end if;
  insert into public.reserves_conversations_lectures (conversation_id, utilisateur_id, lu_jusqu_a)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, utilisateur_id) do update set lu_jusqu_a = now();
end;
$$;

-- Fil de discussion d'un utilisateur : ce qu'il voit, avec ses non-lus et le lien direct
-- vers la réserve concernée.
create or replace function public.reserves_conversations_visibles(p_chantier_id uuid default null)
returns table (
  id uuid, titre text, chantier_id uuid, chantier text, reserve_id uuid,
  reserve_numero integer, intervenant text, non_lus integer,
  dernier_message timestamptz, dernier_extrait text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.titre, c.chantier_id, ch.nom, c.reserve_id, r.numero, i.nom,
         (select count(*)::integer from public.reserves_messages m
          where m.conversation_id = c.id
            and m.auteur_id is distinct from auth.uid()
            and m.created_at > coalesce(lec.lu_jusqu_a, 'epoch'::timestamptz)),
         (select max(m.created_at) from public.reserves_messages m where m.conversation_id = c.id),
         (select left(m.contenu, 140) from public.reserves_messages m
          where m.conversation_id = c.id order by m.created_at desc limit 1)
  from public.reserves_conversations c
  join public.reserves_chantiers ch on ch.id = c.chantier_id
  left join public.reserves r on r.id = c.reserve_id
  left join public.reserves_intervenants i on i.id = c.intervenant_id
  left join public.reserves_conversations_lectures lec
    on lec.conversation_id = c.id and lec.utilisateur_id = auth.uid()
  where public.reserves_conversation_visible(c.id)
    and (p_chantier_id is null or c.chantier_id = p_chantier_id)
  order by (select max(m.created_at) from public.reserves_messages m where m.conversation_id = c.id) desc nulls last;
$$;

create or replace function public.reserves_messages_non_lus()
returns integer
language sql security definer stable set search_path = public as $$
  select coalesce(sum(
    (select count(*) from public.reserves_messages m
     where m.conversation_id = c.id
       and m.auteur_id is distinct from auth.uid()
       and m.created_at > coalesce(lec.lu_jusqu_a, 'epoch'::timestamptz))
  ), 0)::integer
  from public.reserves_conversations c
  left join public.reserves_conversations_lectures lec
    on lec.conversation_id = c.id and lec.utilisateur_id = auth.uid()
  where public.reserves_conversation_visible(c.id);
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. TABLEAU DE BORD : CE QU'IL RESTE À FAIRE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Les compteurs de 00268 décrivaient un état ; ceux-ci décrivent une CHARGE DE TRAVAIL.
-- La distinction compte : « 42 réserves » n'appelle aucune action, « 3 demandes de levée
-- et 2 refus de responsabilité » en appelle une aujourd'hui.
--
-- Le type de retour change (cinq colonnes ajoutées) : la fonction est donc retirée puis
-- recréée, plutôt que surchargée.
drop function if exists public.reserves_tableau_de_bord(uuid,uuid,uuid,text,text,date);

create or replace function public.reserves_tableau_de_bord(
  p_entreprise_id uuid default null,
  p_chantier_id uuid default null,
  p_intervenant_id uuid default null,
  p_statut text default null,
  p_priorite text default null,
  p_echeance_avant date default null
) returns table (
  total bigint, emises bigint, assignees bigint, refusees bigint, acceptees bigint,
  demandes_levee bigint, levees_refusees bigint, levees bigint, annulees bigint,
  en_attente bigint, en_retard bigint,
  a_traiter bigint, echeance_proche bigint,
  messages_non_lus bigint, notifications_non_lues bigint, invitations_a_suivre bigint
)
language sql security definer stable set search_path = public as $$
  with visibles as (
    select r.* from public.reserves r
    where (p_entreprise_id is null or r.entreprise_id = p_entreprise_id)
      and (
        public.reserves_action_autorisee(r.entreprise_id, 'voir')
        or public.reserves_intervenant_courant(r.intervenant_id)
      )
      and (p_chantier_id is null or r.chantier_id = p_chantier_id)
      and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
      and (p_statut is null or r.statut = p_statut)
      and (p_priorite is null or r.priorite = p_priorite)
      and (p_echeance_avant is null or (r.echeance is not null and r.echeance <= p_echeance_avant))
  )
  select count(*),
         count(*) filter (where statut = 'emise'),
         count(*) filter (where statut = 'assignee'),
         count(*) filter (where statut = 'refusee_responsabilite'),
         count(*) filter (where statut = 'acceptee'),
         count(*) filter (where statut = 'levee_demandee'),
         count(*) filter (where statut = 'levee_refusee'),
         count(*) filter (where statut = 'levee'),
         count(*) filter (where statut = 'annulee'),
         count(*) filter (where statut in ('emise','levee_demandee')),
         count(*) filter (where echeance < current_date and statut not in ('levee','annulee')),
         -- « À traiter » : tout ce qui attend une décision, quel que soit le camp.
         count(*) filter (where statut in ('emise','assignee','refusee_responsabilite','levee_demandee','levee_refusee')),
         count(*) filter (where echeance is not null
                            and echeance between current_date and current_date + 7
                            and statut not in ('levee','annulee')),
         public.reserves_messages_non_lus()::bigint,
         public.reserves_notifications_compteur()::bigint,
         (select count(*) from public.reserves_invitations inv
          where inv.consomme_at is null and inv.revoque_at is null and inv.expire_at > now()
            and public.reserves_action_autorisee(inv.entreprise_id, 'gerer_intervenants')
            and (p_chantier_id is null or inv.chantier_id = p_chantier_id))
  from visibles;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. JEUX DE DONNÉES D'EXPORT
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Le PDF est rendu par la couche applicative (Chromium headless sur une page déjà rendue
-- par Next.js, moteur documentaire canonique d'ELSATIA). La base, elle, ne fournit que
-- des JEUX DE DONNÉES — et surtout, elle applique aux exports EXACTEMENT les mêmes
-- prédicats qu'à la lecture normale. Un export ne peut donc jamais révéler ce qu'un écran
-- n'aurait pas montré, y compris l'export « par entreprise » demandé par un intervenant.
create or replace function public.reserves_export_entete(p_chantier_id uuid)
returns table (
  chantier text, reference text, adresse text, code_postal text, ville text,
  statut text, date_reception date,
  organisation text, organisation_siret text,
  total bigint, ouvertes bigint, levees bigint, en_retard bigint
)
language sql security definer stable set search_path = public as $$
  select c.nom, c.reference, c.adresse, c.code_postal, c.ville,
         c.statut, c.date_reception,
         coalesce(nullif(btrim(e.raison_sociale), ''), e.nom), e.siret,
         count(r.id),
         count(r.id) filter (where r.statut not in ('levee','annulee')),
         count(r.id) filter (where r.statut = 'levee'),
         count(r.id) filter (where r.echeance < current_date and r.statut not in ('levee','annulee'))
  from public.reserves_chantiers c
  join public.entreprises e on e.id = c.entreprise_id
  left join public.reserves r on r.chantier_id = c.id
  where c.id = p_chantier_id
    and (
      public.reserves_action_autorisee(c.entreprise_id, 'exporter')
      or public.reserves_chantier_visible_intervenant(c.id)
    )
  group by c.nom, c.reference, c.adresse, c.code_postal, c.ville, c.statut,
           c.date_reception, e.raison_sociale, e.nom, e.siret;
$$;

-- Export filtré. Les quatre filtres du cadrage — entreprise, statut, priorité, échéance —
-- sont portés EN BASE : le PDF par entreprise n'est donc pas un PDF complet qu'on aurait
-- filtré à l'affichage, c'est un jeu de données qui ne contient que les réserves de cette
-- entreprise. Ce qui n'est pas dans le PDF n'a jamais quitté la base.
drop function if exists public.reserves_export_chantier(uuid, uuid);

create or replace function public.reserves_export_chantier(
  p_chantier_id uuid,
  p_intervenant_id uuid default null,
  p_statut text default null,
  p_priorite text default null,
  p_echeance_avant date default null,
  p_inclure_levees boolean default true
) returns table (
  id uuid, numero integer, titre text, description text, statut text, priorite text,
  intervenant text, intervenant_corps_etat text,
  plan text, plan_niveau text, plan_zone text, plan_page integer,
  position_x numeric, position_y numeric, echeance date,
  photo_obligatoire_levee boolean, nb_photos bigint,
  created_at timestamptz, assignee_at timestamptz, acceptee_at timestamptz,
  levee_demandee_at timestamptz, levee_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select r.id, r.numero, r.titre, r.description, r.statut, r.priorite,
         i.nom, i.corps_etat,
         pl.nom, pl.niveau, pl.zone, r.plan_page, r.position_x, r.position_y, r.echeance,
         r.photo_obligatoire_levee,
         (select count(*) from public.reserves_photos ph
          where ph.reserve_id = r.id and ph.disponible_at is not null and ph.supprimee_at is null),
         r.created_at, r.assignee_at, r.acceptee_at, r.levee_demandee_at, r.levee_at
  from public.reserves r
  left join public.reserves_intervenants i on i.id = r.intervenant_id
  left join public.reserves_plans pl on pl.id = r.plan_id
  where r.chantier_id = p_chantier_id
    and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
    and (p_statut is null or r.statut = p_statut)
    and (p_priorite is null or r.priorite = p_priorite)
    and (p_echeance_avant is null or (r.echeance is not null and r.echeance <= p_echeance_avant))
    and (coalesce(p_inclure_levees, true) or r.statut not in ('levee','annulee'))
    and (
      public.reserves_action_autorisee(r.entreprise_id, 'exporter')
      or public.reserves_intervenant_courant(r.intervenant_id)
    )
  order by r.numero;
$$;

-- Historique d'export. Le PDF « avec historique complet » et le PDF « synthèse » ne sont
-- pas deux rendus du même jeu : la synthèse n'appelle simplement pas cette fonction, donc
-- l'historique ne transite pas. Ce qui n'est pas imprimé n'est pas non plus chargé.
create or replace function public.reserves_export_historique(
  p_chantier_id uuid, p_intervenant_id uuid default null
) returns table (
  reserve_id uuid, numero integer, action text, statut_avant text, statut_apres text,
  commentaire text, auteur text, auteur_organisation text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select h.reserve_id, r.numero, h.action, h.statut_avant, h.statut_apres, h.commentaire,
         nullif(btrim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), ''),
         coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
         h.created_at
  from public.reserves_historique h
  join public.reserves r on r.id = h.reserve_id
  left join public.utilisateurs u on u.id = h.auteur_id
  left join public.entreprises e on e.id = h.auteur_entreprise_id
  where r.chantier_id = p_chantier_id
    and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
    and public.reserves_lecture_autorisee(h.reserve_id)
  order by r.numero, h.created_at;
$$;

-- Photos à joindre à l'export. Rend les CHEMINS, jamais des URL : la signature est émise
-- par la couche applicative, pour une durée courte, au moment du rendu.
create or replace function public.reserves_export_photos(
  p_chantier_id uuid, p_intervenant_id uuid default null
) returns table (
  reserve_id uuid, numero integer, photo_id uuid, usage text,
  legende text, storage_path text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select ph.reserve_id, r.numero, ph.id, ph.usage, ph.legende, ph.storage_path, ph.created_at
  from public.reserves_photos ph
  join public.reserves r on r.id = ph.reserve_id
  where r.chantier_id = p_chantier_id
    and (p_intervenant_id is null or r.intervenant_id = p_intervenant_id)
    and ph.disponible_at is not null
    and ph.supprimee_at is null
    and public.reserves_lecture_autorisee(ph.reserve_id)
  order by r.numero, ph.created_at;
$$;

-- Entreprises exportables d'un chantier : la liste qui alimente le sélecteur « PDF par
-- entreprise », avec le décompte réel de ce que chacune porte.
create or replace function public.reserves_export_intervenants(p_chantier_id uuid)
returns table (
  intervenant_id uuid, nom text, corps_etat text, statut text,
  total bigint, ouvertes bigint, levees bigint
)
language sql security definer stable set search_path = public as $$
  select i.id, i.nom, i.corps_etat, i.statut,
         count(r.id),
         count(r.id) filter (where r.statut not in ('levee','annulee')),
         count(r.id) filter (where r.statut = 'levee')
  from public.reserves_intervenants i
  left join public.reserves r on r.intervenant_id = i.id
  where i.chantier_id = p_chantier_id
    and public.reserves_action_autorisee(i.entreprise_id, 'exporter')
  group by i.id, i.nom, i.corps_etat, i.statut
  order by i.nom;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. ROW LEVEL SECURITY DES NOUVELLES TABLES
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.reserves_annuaire_publication enable row level security;
alter table public.reserves_invitations enable row level security;
alter table public.reserves_notifications_types enable row level security;
alter table public.reserves_notifications_lectures enable row level security;
alter table public.reserves_preferences_notifications enable row level security;
alter table public.reserves_notifications_envois enable row level security;
alter table public.reserves_conversations_lectures enable row level security;

-- Une organisation ne voit et ne règle QUE sa propre fiche d'annuaire. La recherche
-- passe exclusivement par la fonction de la section 1 : aucune policy n'ouvre la table
-- en lecture transverse, sans quoi l'opt-in ne servirait à rien.
create policy reserves_annuaire_select on public.reserves_annuaire_publication
  for select to authenticated using (public.est_membre_actif(entreprise_id));

-- Les invitations sont visibles de l'organisation HÔTE seule. L'invité, lui, n'a que son
-- lien : il ne lit jamais cette table, et le hachage n'en sort par aucun chemin.
create policy reserves_invitations_select on public.reserves_invitations
  for select to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));

-- Référentiel produit, pas donnée client.
create policy reserves_notifications_types_select on public.reserves_notifications_types
  for select to authenticated using (true);

create policy reserves_lectures_select on public.reserves_notifications_lectures
  for select to authenticated using (utilisateur_id = auth.uid());

create policy reserves_preferences_select on public.reserves_preferences_notifications
  for select to authenticated using (utilisateur_id = auth.uid());

create policy reserves_conversations_lectures_select on public.reserves_conversations_lectures
  for select to authenticated using (utilisateur_id = auth.uid());

-- Aucune policy de lecture sur `reserves_notifications_envois` : la file d'expédition
-- contient des adresses e-mail de plusieurs organisations. Elle n'est atteignable que par
-- les fonctions de distribution, appelées par le rôle de service.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. DROITS
-- ═══════════════════════════════════════════════════════════════════════════════
grant select on
  public.reserves_annuaire_publication, public.reserves_invitations,
  public.reserves_notifications_types, public.reserves_notifications_lectures,
  public.reserves_preferences_notifications, public.reserves_conversations_lectures
to authenticated;

-- Tout ce qui écrit passe par une action métier : aucune écriture directe n'est ouverte
-- sur les nouvelles tables, y compris celles qui portent des données de l'utilisateur
-- lui-même (lectures, préférences). Les RPC correspondantes sont le seul chemin.
revoke insert, update, delete on
  public.reserves_annuaire_publication, public.reserves_invitations,
  public.reserves_notifications_types, public.reserves_notifications_lectures,
  public.reserves_preferences_notifications, public.reserves_notifications_envois,
  public.reserves_conversations_lectures
from authenticated;
revoke all on public.reserves_notifications_envois from authenticated, anon;

-- Consultation d'un lien d'invitation : ANONYME par nécessité. C'est la seule fonction
-- Réserves ouverte à `anon`, et elle ne rend rien qu'un jeton valide ne justifie déjà.
revoke all on function public.reserves_invitation_consulter(text) from public;
grant execute on function public.reserves_invitation_consulter(text) to anon, authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.reserves_siret_normalise(text)',
    'public.reserves_annuaire_rechercher(uuid,text)',
    'public.reserves_annuaire_publier(uuid,boolean,text,text,text,text)',
    'public.reserves_inviter_intervenant(uuid,text,text,text,uuid,integer)',
    'public.reserves_invitation_accepter(text,uuid)',
    'public.reserves_invitation_revoquer(uuid)',
    'public.reserves_invitations_chantier(uuid)',
    'public.reserves_invitation_marquer_envoyee(uuid,text)',
    'public.reserves_notifications_in_app(integer,boolean)',
    'public.reserves_notifications_marquer_lues(uuid[])',
    'public.reserves_notifications_compteur()',
    'public.reserves_preferences_lire(uuid)',
    'public.reserves_preferences_definir(uuid,text,boolean)',
    'public.reserves_transferer_responsabilite(uuid,uuid,text)',
    'public.reserves_revoquer_intervenant(uuid,text)',
    'public.reserves_reactiver_intervenant(uuid)',
    'public.reserves_enregistrer_pagination(uuid,integer)',
    'public.reserves_creer(uuid,text,text,text,uuid,uuid,numeric,numeric,boolean,date,uuid,integer)',
    'public.reserves_repositionner(uuid,uuid,integer,numeric,numeric)',
    'public.reserves_reperes_plan(uuid,integer)',
    'public.reserves_commenter(uuid,text,uuid)',
    'public.reserves_conversation_marquer_lue(uuid)',
    'public.reserves_conversations_visibles(uuid)',
    'public.reserves_messages_non_lus()',
    'public.reserves_tableau_de_bord(uuid,uuid,uuid,text,text,date)',
    'public.reserves_export_entete(uuid)',
    'public.reserves_export_chantier(uuid,uuid,text,text,date,boolean)',
    'public.reserves_export_historique(uuid,uuid)',
    'public.reserves_export_photos(uuid,uuid)',
    'public.reserves_export_intervenants(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

-- Chaîne de distribution : réservée au RÔLE DE SERVICE. Ces fonctions traversent les
-- organisations par construction — elles préparent les envois de tous les tenants. Les
-- ouvrir à `authenticated` reviendrait à offrir la liste des adresses e-mail du parc.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.reserves_notification_destinataires(uuid)',
    'public.reserves_notifications_preparer(integer)',
    'public.reserves_notifications_a_expedier(integer)',
    'public.reserves_notification_envoi_statuer(uuid,boolean,text)',
    'public.reserves_produire_echeances(integer[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

-- Le cœur de transition reste inatteignable directement, comme en V1 et en V2.
revoke all on function public.reserves_appliquer_transition(uuid, text, text, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
