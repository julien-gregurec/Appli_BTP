-- ELSATIA Social : module interne de gestion des réseaux sociaux officiels
-- d'ELSATIA (Page Facebook, Instagram professionnel, Page Entreprise LinkedIn).
--
-- Report sur le train canonique V9.2 de l'ancienne migration 20261003000184
-- (jamais appliquée hors base locale), adaptée au modèle canonique :
--   * identité : auth.uid() -> plateforme_admins.utilisateur_id -> actif
--     (migration 20260826000235). L'email n'est plus une racine d'autorisation :
--     il n'est conservé que comme donnée d'affichage et d'audit ;
--   * AAL2 : plateforme_exiger_session_aal2() (migration 20260826000237) pour
--     les mutations exécutées sous le JWT de l'utilisateur (rôles, validation) ;
--     le serveur impose AAL2 avant toute autre écriture (service_role) ;
--   * rôles : le rôle plateforme canonique ('total', 'support', 'facturation',
--     'lecture') ouvre l'accès ; social_membres ne fait que spécialiser, au sein
--     de l'équipe plateforme active, les droits fonctionnels du module
--     (séparation rédaction / validation). Ce n'est pas un second système
--     d'authentification : sans ligne plateforme_admins active, aucun rôle social.
--
-- Le module appartient à l'espace plateforme (éditeur), pas aux entreprises
-- clientes : aucune table n'a d'entreprise_id.
--
-- Principes de sécurité :
--   * toutes les tables ont la RLS activée ;
--   * aucune policy d'écriture : les écritures passent par le serveur
--     (service_role) après contrôle du rôle et d'AAL2, ou par une RPC
--     SECURITY DEFINER sous le JWT de l'utilisateur ;
--   * les jetons OAuth chiffrés (social_identifiants, social_connexions_en_attente)
--     n'ont aucune policy : illisibles depuis le client, même authentifié ;
--   * une publication ne peut être validée que par un Administrateur ou un
--     Validateur social, sous sa propre session AAL2 (trigger) : le service_role
--     seul ne peut jamais poser une validation ;
--   * toute modification du contenu après validation annule la validation ;
--   * le journal d'audit est en ajout seul.
--
-- Retour arrière : supabase/production/retour_arriere_elsatia_social.sql.

-- ─────────────────────────────────────────────────────────────
-- Rôles
-- ─────────────────────────────────────────────────────────────
create table public.social_membres (
  utilisateur_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('administrateur','responsable_communication','editeur','validateur','lecture')),
  ajoute_par_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_membres_ajoute_par_idx on public.social_membres (ajoute_par_id);
alter table public.social_membres enable row level security;

-- Rôle social d'un utilisateur : rôle explicite, sinon Administrateur pour un
-- membre plateforme « total », sinon Lecture seule pour les autres membres
-- plateforme ACTIFS. null si l'utilisateur n'est pas un administrateur
-- plateforme actif (identité en attente, non confirmée ou révoquée comprise).
create or replace function public.social_role_de(p_utilisateur_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(
    sm.role,
    case when pa.role = 'total' then 'administrateur' else 'lecture' end
  )
  from public.plateforme_admins pa
  left join public.social_membres sm on sm.utilisateur_id = pa.utilisateur_id
  where p_utilisateur_id is not null
    and pa.utilisateur_id = p_utilisateur_id
    and pa.actif
  limit 1;
$$;

create or replace function public.social_role_courant()
returns text language sql security definer stable set search_path = public as $$
  select public.social_role_de(auth.uid());
$$;

-- Contexte de session lu par le serveur : rôle social et niveau d'assurance.
-- Source de confiance unique, comme plateforme_exiger_session_aal2() : le JWT
-- vérifié par PostgREST (auth.uid(), claim `aal`). Aucun paramètre client.
create or replace function public.social_session_courante()
returns table (utilisateur_id uuid, email text, role text, aal2 boolean)
language sql security definer stable set search_path = public as $$
  select pa.utilisateur_id,
         pa.email,
         public.social_role_de(pa.utilisateur_id),
         coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  from public.plateforme_admins pa
  where auth.uid() is not null
    and pa.utilisateur_id = auth.uid()
    and pa.actif
  limit 1;
$$;

revoke all on function public.social_role_de(uuid) from public, anon, authenticated;
revoke all on function public.social_role_courant() from public, anon;
revoke all on function public.social_session_courante() from public, anon;
grant execute on function public.social_role_courant() to authenticated;
grant execute on function public.social_session_courante() to authenticated;

create policy social_membres_lecture on public.social_membres
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Paramètres (ligne unique)
-- ─────────────────────────────────────────────────────────────
create table public.social_parametres (
  id boolean primary key default true check (id),
  -- Prévu pour une version ultérieure. Sans effet en V1 : le code refuse
  -- toute publication non validée par un humain, quelle que soit cette valeur.
  automatisation_active boolean not null default false,
  fuseau_horaire text not null default 'Europe/Paris',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.social_parametres (id) values (true) on conflict do nothing;
alter table public.social_parametres enable row level security;
create policy social_parametres_lecture on public.social_parametres
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Comptes connectés et secrets
-- ─────────────────────────────────────────────────────────────
create table public.social_comptes (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  nom_compte text not null check (btrim(nom_compte) <> ''),
  -- Page ID Facebook, IG User ID, ou ID numérique de l'organisation LinkedIn.
  external_account_id text not null check (btrim(external_account_id) <> ''),
  -- Pour Instagram : Page Facebook liée (les appels passent par son jeton).
  external_parent_id text,
  nom_utilisateur text,
  statut text not null default 'connecte'
    check (statut in ('connecte','a_reconnecter','expire','revoque','erreur')),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  -- Email affiché (audit) et identité canonique de la personne qui a connecté.
  connecte_par text,
  connecte_par_id uuid references auth.users(id) on delete set null,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  data_access_expires_at timestamptz,
  derniere_verification_at timestamptz,
  derniere_erreur text,
  -- Résultat du dernier diagnostic en lecture seule (identité, permissions, quotas).
  dernier_diagnostic jsonb,
  updated_at timestamptz not null default now(),
  check ((fournisseur = 'meta' and reseau in ('facebook','instagram')) or (fournisseur = 'linkedin' and reseau = 'linkedin')),
  unique (reseau, external_account_id)
);
-- Un seul compte actif par réseau : ce sont les comptes officiels ELSATIA.
create unique index social_comptes_un_actif_par_reseau
  on public.social_comptes (reseau) where statut <> 'revoque';
create index social_comptes_connecte_par_idx on public.social_comptes (connecte_par_id);
alter table public.social_comptes enable row level security;
create policy social_comptes_lecture on public.social_comptes
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Jetons chiffrés AES-256-GCM côté serveur (clé hors base). Aucune policy :
-- seul le service_role y accède.
create table public.social_identifiants (
  compte_id uuid primary key references public.social_comptes(id) on delete cascade,
  jeton_chiffre text not null,
  refresh_chiffre text,
  cle_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.social_identifiants enable row level security;

-- Résultat OAuth en attente de choix de la Page / de l'organisation. Expire
-- après 15 minutes et est supprimé à la finalisation. Lié à l'UID qui a lancé
-- la connexion : un autre administrateur ne peut pas la finaliser.
create table public.social_connexions_en_attente (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  donnees_chiffrees text not null,
  cree_par_id uuid not null references auth.users(id) on delete cascade,
  expire_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create index social_connexions_en_attente_cree_par_idx on public.social_connexions_en_attente (cree_par_id, expire_at);
alter table public.social_connexions_en_attente enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Médias (bucket privé, aucune policy storage : accès par URL signée serveur)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-medias', 'social-medias', false, 209715200,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.social_medias (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('image','video')),
  -- Chemin de l'objet dans le bucket privé social-medias. Volontairement PAS nommé
  -- « storage_path » : les contrôles RGPD multi-entreprise du train
  -- (verifier_storage_entreprise, manifestes de purge) parcourent toute colonne
  -- *storage_path* en supposant un entreprise_id. Les médias Social appartiennent à
  -- l'éditeur ELSATIA, jamais à une entreprise cliente : ils sont hors de ce périmètre.
  chemin_objet text not null unique check (btrim(chemin_objet) <> ''),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),
  nom_original text not null,
  taille_octets bigint not null check (taille_octets > 0),
  largeur integer check (largeur > 0),
  hauteur integer check (hauteur > 0),
  duree_secondes numeric(8,2) check (duree_secondes > 0),
  texte_alternatif text check (length(texte_alternatif) <= 1000),
  cree_par text not null,
  cree_par_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index social_medias_cree_par_idx on public.social_medias (cree_par_id);
alter table public.social_medias enable row level security;
create policy social_medias_lecture on public.social_medias
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Publications
-- ─────────────────────────────────────────────────────────────
create table public.social_publications (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  contenu_principal text not null default '' check (length(contenu_principal) <= 10000),
  contenu_facebook text check (length(contenu_facebook) <= 63206),
  contenu_instagram text check (length(contenu_instagram) <= 2200),
  contenu_linkedin text check (length(contenu_linkedin) <= 3000),
  lien_url text check (lien_url is null or lien_url ~ '^https://'),
  application text not null default 'elsatia'
    check (application in ('elsatia','gestion_pro','tools','colors','studio','reserves')),
  reseaux text[] not null default '{}'
    check (reseaux <@ array['facebook','instagram','linkedin']::text[]),
  statut text not null default 'brouillon'
    check (statut in ('idee','brouillon','a_valider','valide','programme','publication_en_cours','publie','partiel','echec','annule')),
  programme_at timestamptz,
  soumis_at timestamptz,
  soumis_par text,
  approuve_at timestamptz,
  -- Email affiché ; l'autorisation repose sur approuve_par_id (UID canonique).
  approuve_par text,
  approuve_par_id uuid references auth.users(id) on delete restrict,
  -- SHA-256 du contenu exact validé (textes, réseaux, médias, lien).
  empreinte_validee text,
  commentaire_validation text,
  publie_at timestamptz,
  cree_par text not null,
  cree_par_id uuid references auth.users(id) on delete set null,
  modifie_par text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statut not in ('valide','programme','publication_en_cours','publie','partiel') or (approuve_par_id is not null and approuve_at is not null and empreinte_validee is not null)),
  check (statut <> 'programme' or programme_at is not null)
);
create index social_publications_statut_idx on public.social_publications (statut, programme_at);
create index social_publications_calendrier_idx on public.social_publications (coalesce(publie_at, programme_at, created_at));
create index social_publications_approuve_par_idx on public.social_publications (approuve_par_id);
create index social_publications_cree_par_idx on public.social_publications (cree_par_id);
alter table public.social_publications enable row level security;
create policy social_publications_lecture on public.social_publications
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_publication_medias (
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  media_id uuid not null references public.social_medias(id) on delete restrict,
  ordre smallint not null default 0,
  primary key (publication_id, media_id)
);
create index social_publication_medias_media_idx on public.social_publication_medias (media_id);
alter table public.social_publication_medias enable row level security;
create policy social_publication_medias_lecture on public.social_publication_medias
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Garde-fous du workflow, appliqués quel que soit le code appelant.
create or replace function public.social_publications_garde_fou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contenu_change boolean;
begin
  if tg_op = 'UPDATE' then
    v_contenu_change :=
      new.titre is distinct from old.titre
      or new.contenu_principal is distinct from old.contenu_principal
      or new.contenu_facebook is distinct from old.contenu_facebook
      or new.contenu_instagram is distinct from old.contenu_instagram
      or new.contenu_linkedin is distinct from old.contenu_linkedin
      or new.lien_url is distinct from old.lien_url
      or new.reseaux is distinct from old.reseaux;

    if v_contenu_change and old.statut in ('publication_en_cours','publie','partiel') then
      raise exception 'Une publication envoyée ne peut plus être modifiée';
    end if;

    -- Toute modification du contenu après soumission ou validation renvoie en brouillon.
    if v_contenu_change and old.statut in ('a_valider','valide','programme','echec') then
      new.statut := 'brouillon';
      new.approuve_at := null;
      new.approuve_par := null;
      new.approuve_par_id := null;
      new.empreinte_validee := null;
      new.soumis_at := null;
      new.soumis_par := null;
    end if;
  end if;

  -- Une validation n'est acceptée que de la personne qui valide, sous sa propre
  -- session AAL2 (claim `aal` du JWT vérifié), avec un rôle Administrateur ou
  -- Validateur social. Le service_role (sans auth.uid()) ne peut donc jamais
  -- poser ni réattribuer une validation : il ne peut que l'effacer.
  if new.approuve_par_id is not null
     and (tg_op = 'INSERT'
          or new.approuve_par_id is distinct from old.approuve_par_id
          or new.approuve_at is distinct from old.approuve_at
          or new.empreinte_validee is distinct from old.empreinte_validee) then
    if auth.uid() is null or auth.uid() <> new.approuve_par_id then
      raise exception 'Une validation ne peut être enregistrée que par la personne qui valide';
    end if;
    perform public.plateforme_exiger_session_aal2();
    if coalesce(public.social_role_de(new.approuve_par_id), '') not in ('administrateur','validateur') then
      raise exception 'Seuls un Administrateur ou un Validateur peuvent autoriser une publication';
    end if;
  end if;

  if tg_op = 'INSERT' and new.statut not in ('idee','brouillon') then
    raise exception 'Une publication est toujours créée en idée ou en brouillon';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.social_publications_garde_fou() from public, anon, authenticated;

create trigger social_publications_garde_fou
  before insert or update on public.social_publications
  for each row execute function public.social_publications_garde_fou();

-- Une cible par réseau et par publication. La clé d'idempotence empêche
-- toute double publication, y compris en cas d'appels concurrents.
create table public.social_publication_cibles (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente','en_cours','publie','simule','echec','annule')),
  cle_idempotence text not null unique,
  external_post_id text,
  external_url text,
  -- Conteneur Instagram créé mais pas encore publié (reprise sans doublon).
  external_conteneur_id text,
  tentatives smallint not null default 0,
  prochaine_tentative_at timestamptz,
  verrou_at timestamptz,
  publie_at timestamptz,
  erreur text,
  erreur_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publication_id, reseau)
);
create index social_publication_cibles_compte_idx on public.social_publication_cibles (compte_id);
create index social_publication_cibles_reprise_idx on public.social_publication_cibles (statut, prochaine_tentative_at);
create unique index social_publication_cibles_externe_idx on public.social_publication_cibles (reseau, external_post_id) where external_post_id is not null;
alter table public.social_publication_cibles enable row level security;
create policy social_publication_cibles_lecture on public.social_publication_cibles
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- Prise de verrou atomique d'une cible avant appel à l'API (anti-doublon).
-- Une cible restée « en_cours » (processus interrompu) n'est JAMAIS reprise
-- automatiquement : la plateforme a pu recevoir la publication. Le cron la
-- passe en échec « a_verifier » et un humain décide de la relancer.
-- Une cible en échec n'est reprise que si une nouvelle tentative est prévue.
create or replace function public.social_verrouiller_cible(p_cible_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.social_publication_cibles
     set statut = 'en_cours', verrou_at = now(), tentatives = tentatives + 1, updated_at = now()
   where id = p_cible_id
     and external_post_id is null
     and (statut = 'en_attente'
          or (statut = 'echec' and prochaine_tentative_at is not null and prochaine_tentative_at <= now()));
  return found;
end;
$$;
revoke all on function public.social_verrouiller_cible(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Statistiques
-- ─────────────────────────────────────────────────────────────
create table public.social_statistiques (
  id bigint generated always as identity primary key,
  cible_id uuid not null references public.social_publication_cibles(id) on delete cascade,
  publication_id uuid not null references public.social_publications(id) on delete cascade,
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  -- null = métrique non fournie par la plateforme (jamais 0 par défaut).
  impressions bigint,
  portee bigint,
  vues bigint,
  likes bigint,
  commentaires bigint,
  partages bigint,
  clics bigint,
  enregistrements bigint,
  metriques_brutes jsonb not null default '{}',
  collecte_at timestamptz not null default now()
);
create index social_statistiques_cible_idx on public.social_statistiques (cible_id, collecte_at desc);
create index social_statistiques_publication_idx on public.social_statistiques (publication_id, collecte_at desc);
alter table public.social_statistiques enable row level security;
create policy social_statistiques_lecture on public.social_statistiques
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_abonnes (
  compte_id uuid not null references public.social_comptes(id) on delete cascade,
  collecte_le date not null default current_date,
  abonnes bigint not null check (abonnes >= 0),
  primary key (compte_id, collecte_le)
);
alter table public.social_abonnes enable row level security;
create policy social_abonnes_lecture on public.social_abonnes
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Commentaires et messages (réponses toujours validées par un humain en V1)
-- ─────────────────────────────────────────────────────────────
create table public.social_commentaires (
  id uuid primary key default gen_random_uuid(),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  cible_id uuid references public.social_publication_cibles(id) on delete set null,
  external_comment_id text not null,
  external_post_id text not null,
  external_parent_id text,
  auteur_nom text,
  auteur_external_id text,
  contenu text not null default '',
  publie_externe_at timestamptz,
  statut text not null default 'nouveau'
    check (statut in ('nouveau','lu','reponse_preparee','repondu','ignore','echec')),
  brouillon_reponse text check (length(brouillon_reponse) <= 8000),
  brouillon_par text,
  brouillon_ia boolean not null default false,
  reponse_validee_par text,
  reponse_validee_par_id uuid references auth.users(id) on delete set null,
  reponse_envoyee_at timestamptz,
  reponse_external_id text,
  erreur text,
  recu_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reseau, external_comment_id)
);
create index social_commentaires_boite_idx on public.social_commentaires (statut, publie_externe_at desc);
create index social_commentaires_compte_idx on public.social_commentaires (compte_id);
create index social_commentaires_cible_idx on public.social_commentaires (cible_id);
create index social_commentaires_valide_par_idx on public.social_commentaires (reponse_validee_par_id);
alter table public.social_commentaires enable row level security;
create policy social_commentaires_lecture on public.social_commentaires
  for select to authenticated using ((select public.social_role_courant()) is not null);

create table public.social_messages (
  id uuid primary key default gen_random_uuid(),
  reseau text not null check (reseau in ('facebook','instagram','linkedin')),
  compte_id uuid references public.social_comptes(id) on delete set null,
  external_conversation_id text not null,
  external_message_id text not null,
  sens text not null check (sens in ('entrant','sortant')),
  auteur_nom text,
  auteur_external_id text,
  contenu text not null default '',
  envoye_externe_at timestamptz,
  statut text not null default 'recu'
    check (statut in ('recu','lu','reponse_preparee','repondu','ignore','echec','envoye')),
  brouillon_reponse text check (length(brouillon_reponse) <= 2000),
  brouillon_par text,
  brouillon_ia boolean not null default false,
  reponse_validee_par text,
  reponse_validee_par_id uuid references auth.users(id) on delete set null,
  reponse_envoyee_at timestamptz,
  erreur text,
  recu_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reseau, external_message_id)
);
create index social_messages_conversation_idx on public.social_messages (reseau, external_conversation_id, envoye_externe_at);
create index social_messages_compte_idx on public.social_messages (compte_id);
create index social_messages_valide_par_idx on public.social_messages (reponse_validee_par_id);
alter table public.social_messages enable row level security;
create policy social_messages_lecture on public.social_messages
  for select to authenticated using ((select public.social_role_courant()) is not null);

-- ─────────────────────────────────────────────────────────────
-- Webhooks : idempotence, reprise et file des échecs définitifs
-- ─────────────────────────────────────────────────────────────
create table public.social_webhook_evenements (
  id bigint generated always as identity primary key,
  fournisseur text not null check (fournisseur in ('meta','linkedin')),
  cle_idempotence text not null unique,
  type_evenement text,
  payload jsonb not null,
  statut text not null default 'recu' check (statut in ('recu','traite','echec','abandonne','ignore')),
  tentatives smallint not null default 0,
  prochaine_tentative_at timestamptz not null default now(),
  erreur text,
  recu_at timestamptz not null default now(),
  traite_at timestamptz
);
create index social_webhook_evenements_file_idx on public.social_webhook_evenements (statut, prochaine_tentative_at);
alter table public.social_webhook_evenements enable row level security;
create policy social_webhook_evenements_lecture on public.social_webhook_evenements
  for select to authenticated using ((select public.social_role_courant()) in ('administrateur','responsable_communication'));

-- ─────────────────────────────────────────────────────────────
-- Limitation de débit (OAuth, IA, publications, réponses, téléversements)
-- ─────────────────────────────────────────────────────────────
create table public.social_quotas (
  cle text not null,
  fenetre_debut timestamptz not null,
  compteur integer not null default 0,
  primary key (cle, fenetre_debut)
);
alter table public.social_quotas enable row level security;

create or replace function public.social_consommer_quota(p_cle text, p_max integer, p_fenetre_secondes integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_debut timestamptz;
  v_compteur integer;
begin
  if p_cle is null or btrim(p_cle) = '' or p_max is null or p_max < 1
     or p_fenetre_secondes is null or p_fenetre_secondes < 1 then
    raise exception 'Paramètres de quota invalides';
  end if;
  v_debut := to_timestamp(floor(extract(epoch from now()) / p_fenetre_secondes) * p_fenetre_secondes);
  insert into public.social_quotas (cle, fenetre_debut, compteur) values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut) do update set compteur = public.social_quotas.compteur + 1
  returning compteur into v_compteur;
  delete from public.social_quotas where fenetre_debut < now() - interval '2 days';
  return v_compteur <= p_max;
end;
$$;
revoke all on function public.social_consommer_quota(text, integer, integer) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Journal d'audit (ajout seul)
-- ─────────────────────────────────────────────────────────────
create table public.social_audit (
  id bigint generated always as identity primary key,
  -- Email affiché, ou « système » / « planificateur » pour les tâches serveur.
  acteur text not null,
  -- Identité canonique de l'utilisateur (null pour les tâches serveur).
  acteur_id uuid references auth.users(id) on delete set null,
  action text not null,
  reseau text,
  publication_id uuid,
  objet_id text,
  avant jsonb,
  apres jsonb,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index social_audit_date_idx on public.social_audit (created_at desc);
create index social_audit_publication_idx on public.social_audit (publication_id, created_at desc);
create index social_audit_acteur_idx on public.social_audit (acteur_id, created_at desc);
alter table public.social_audit enable row level security;
create policy social_audit_lecture on public.social_audit
  for select to authenticated using ((select public.social_role_courant()) in ('administrateur','responsable_communication','validateur'));

create or replace function public.social_audit_ajout_seul()
returns trigger language plpgsql set search_path = public as $$
begin
  -- La suppression d'un utilisateur Auth anonymise acteur_id (FK on delete set
  -- null) : seule cette mise à jour technique est tolérée.
  if tg_op = 'UPDATE'
     and old.acteur_id is not null and new.acteur_id is null
     and (to_jsonb(new) - 'acteur_id') = (to_jsonb(old) - 'acteur_id') then
    return new;
  end if;
  raise exception 'Le journal ELSATIA Social est en ajout seul';
end;
$$;
create trigger social_audit_ajout_seul
  before update or delete on public.social_audit
  for each row execute function public.social_audit_ajout_seul();

-- Rafraîchit updated_at sur les tables modifiées par le serveur.
create or replace function public.social_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger social_comptes_touch before update on public.social_comptes for each row execute function public.social_touch_updated_at();
create trigger social_cibles_touch before update on public.social_publication_cibles for each row execute function public.social_touch_updated_at();
create trigger social_commentaires_touch before update on public.social_commentaires for each row execute function public.social_touch_updated_at();
create trigger social_messages_touch before update on public.social_messages for each row execute function public.social_touch_updated_at();
create trigger social_membres_touch before update on public.social_membres for each row execute function public.social_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Mutations sensibles exécutées sous le JWT de l'utilisateur (AAL2 en base)
-- ─────────────────────────────────────────────────────────────

-- Modification d'un rôle social. Réservée à un Administrateur social, en AAL2,
-- vers un administrateur plateforme ACTIF. Journalisée dans la même transaction.
create or replace function public.social_definir_role(p_utilisateur_id uuid, p_role text)
returns void language plpgsql security definer volatile set search_path = public as $$
declare
  v_acteur uuid := auth.uid();
  v_email_acteur text;
  v_email_cible text;
  v_avant text;
  v_admins integer;
begin
  perform public.plateforme_exiger_session_aal2();
  -- Même verrou de domaine pour toutes les mutations de rôles ELSATIA Social.
  perform pg_advisory_xact_lock(21453, 2001);

  if coalesce(public.social_role_de(v_acteur), '') <> 'administrateur' then
    raise exception 'Seul un Administrateur ELSATIA Social peut modifier les rôles';
  end if;
  if p_role is null or p_role not in ('administrateur','responsable_communication','editeur','validateur','lecture') then
    raise exception 'Rôle ELSATIA Social inconnu';
  end if;

  select email into v_email_cible from public.plateforme_admins
  where utilisateur_id = p_utilisateur_id and actif;
  if v_email_cible is null then
    raise exception 'Cette personne doit d''abord être un administrateur plateforme actif';
  end if;
  if p_utilisateur_id = v_acteur and p_role <> 'administrateur' then
    raise exception 'Vous ne pouvez pas retirer votre propre rôle d''administrateur';
  end if;

  v_avant := public.social_role_de(p_utilisateur_id);

  insert into public.social_membres (utilisateur_id, role, ajoute_par_id)
  values (p_utilisateur_id, p_role, v_acteur)
  on conflict (utilisateur_id) do update set role = excluded.role, ajoute_par_id = excluded.ajoute_par_id;

  -- Il doit toujours rester au moins un Administrateur social actif.
  select count(*) into v_admins
  from public.plateforme_admins pa
  where pa.actif and public.social_role_de(pa.utilisateur_id) = 'administrateur';
  if v_admins < 1 then
    raise exception 'ELSATIA Social doit conserver au moins un Administrateur';
  end if;

  select email into v_email_acteur from public.plateforme_admins where utilisateur_id = v_acteur;
  insert into public.social_audit (acteur, acteur_id, action, objet_id, avant, apres)
  values (coalesce(v_email_acteur, v_acteur::text), v_acteur, 'role_modifie', p_utilisateur_id::text,
          jsonb_build_object('role', v_avant, 'email', v_email_cible),
          jsonb_build_object('role', p_role, 'email', v_email_cible));
end;
$$;
revoke all on function public.social_definir_role(uuid, text) from public, anon, authenticated;
grant execute on function public.social_definir_role(uuid, text) to authenticated;

-- Équipe ELSATIA Social : administrateurs plateforme ACTIFS et leur rôle social.
-- Lecture sous le JWT de l'utilisateur (le service_role n'a aucun privilège sur
-- plateforme_admins depuis 20260902000255) ; réservée aux membres Social.
create or replace function public.social_lister_equipe()
returns table (utilisateur_id uuid, email text, nom text, role_plateforme text, role_social text, role_explicite boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  if public.social_role_courant() is null then
    raise exception 'Accès ELSATIA Social refusé';
  end if;
  return query
  select pa.utilisateur_id, pa.email, pa.nom, pa.role,
         public.social_role_de(pa.utilisateur_id), sm.utilisateur_id is not null
  from public.plateforme_admins pa
  left join public.social_membres sm on sm.utilisateur_id = pa.utilisateur_id
  where pa.actif and pa.utilisateur_id is not null
  order by pa.email;
end;
$$;
revoke all on function public.social_lister_equipe() from public, anon, authenticated;
grant execute on function public.social_lister_equipe() to authenticated;

-- Validation d'une publication. Le serveur calcule l'empreinte du contenu
-- (textes, réseaux, lien, médias) et la transmet ; la base vérifie la session
-- AAL2, le rôle, l'état « a_valider » et fige l'identité de la personne qui
-- valide. Journalisée dans la même transaction.
create or replace function public.social_valider_publication(p_publication_id uuid, p_empreinte text, p_commentaire text)
returns void language plpgsql security definer volatile set search_path = public as $$
declare
  v_acteur uuid := auth.uid();
  v_email text;
  v_cree_par_id uuid;
begin
  perform public.plateforme_exiger_session_aal2();
  if coalesce(public.social_role_de(v_acteur), '') not in ('administrateur','validateur') then
    raise exception 'Seuls un Administrateur ou un Validateur peuvent autoriser une publication';
  end if;
  if p_empreinte is null or p_empreinte !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de validation invalide';
  end if;

  select email into v_email from public.plateforme_admins where utilisateur_id = v_acteur and actif;

  update public.social_publications
     set statut = 'valide',
         approuve_par_id = v_acteur,
         approuve_par = v_email,
         approuve_at = now(),
         empreinte_validee = p_empreinte,
         commentaire_validation = nullif(left(btrim(coalesce(p_commentaire, '')), 1000), '')
   where id = p_publication_id and statut = 'a_valider'
  returning cree_par_id into v_cree_par_id;
  if not found then
    raise exception 'La publication a changé entre-temps : recharger la page.';
  end if;

  insert into public.social_audit (acteur, acteur_id, action, publication_id, apres, details)
  values (coalesce(v_email, v_acteur::text), v_acteur, 'publication_validee', p_publication_id,
          jsonb_build_object('statut', 'valide', 'commentaire_validation', nullif(left(btrim(coalesce(p_commentaire, '')), 1000), '')),
          jsonb_build_object('empreinte', p_empreinte, 'auto_validation', v_cree_par_id = v_acteur, 'aal', 'aal2'));
end;
$$;
revoke all on function public.social_valider_publication(uuid, text, text) from public, anon, authenticated;
grant execute on function public.social_valider_publication(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Privilèges explicites. Le projet n'expose pas automatiquement les nouvelles
-- tables aux rôles de l'API (anon, authenticated, service_role) : sans ces
-- GRANT, même le serveur (service_role) ne pourrait pas lire ni écrire.
--   * authenticated : lecture seule, filtrée par la RLS ;
--   * service_role  : lecture/écriture (le serveur, après contrôle du rôle et d'AAL2) ;
--   * anon          : rien.
-- Tout est d'abord révoqué, service_role compris : les privilèges par défaut
-- ne doivent jamais lui laisser TRUNCATE ni UPDATE/DELETE sur le journal.
-- ─────────────────────────────────────────────────────────────
revoke all on
  public.social_membres, public.social_parametres, public.social_comptes, public.social_identifiants,
  public.social_connexions_en_attente, public.social_medias, public.social_publications,
  public.social_publication_medias, public.social_publication_cibles, public.social_statistiques,
  public.social_abonnes, public.social_commentaires, public.social_messages,
  public.social_webhook_evenements, public.social_quotas, public.social_audit
from public, anon, authenticated, service_role;

grant select on
  public.social_membres, public.social_parametres, public.social_comptes, public.social_medias,
  public.social_publications, public.social_publication_medias, public.social_publication_cibles,
  public.social_statistiques, public.social_abonnes, public.social_commentaires, public.social_messages,
  public.social_webhook_evenements, public.social_audit
to authenticated;

grant select, insert, update, delete on
  public.social_membres, public.social_parametres, public.social_comptes, public.social_identifiants,
  public.social_connexions_en_attente, public.social_medias, public.social_publications,
  public.social_publication_medias, public.social_publication_cibles, public.social_statistiques,
  public.social_abonnes, public.social_commentaires, public.social_messages,
  public.social_webhook_evenements, public.social_quotas
to service_role;
-- Journal : ajout et lecture uniquement, y compris pour le serveur.
grant select, insert on public.social_audit to service_role;
grant usage, select on sequence public.social_statistiques_id_seq, public.social_webhook_evenements_id_seq, public.social_audit_id_seq to service_role;

-- Fonctions appelées par le serveur (service_role) uniquement.
grant execute on function public.social_verrouiller_cible(uuid) to service_role;
grant execute on function public.social_consommer_quota(text, integer, integer) to service_role;
grant execute on function public.social_role_de(uuid) to service_role;
revoke all on function public.social_touch_updated_at() from public, anon, authenticated;
revoke all on function public.social_audit_ajout_seul() from public, anon, authenticated;

-- Nouvelles tables : garde du mode sûr incident (règle de 20260928000807_incident_safe_mode_v1).
-- Les tables social_* relèvent de l'application « gestion_pro » : le mode lecture seule
-- ou la coupure de l'application gèlent aussi ELSATIA Social, publication comprise.
select public.incident_installer_gardes();

notify pgrst, 'reload schema';
