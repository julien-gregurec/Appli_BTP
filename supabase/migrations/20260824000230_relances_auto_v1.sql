-- RELANCES-AUTO-V1 : relances automatiques/manuelles contrôlées pour devis et factures.
--
-- Distinct de `relances_impayes` (existant, module CRM, gérée par gerer_crm, relance
-- multi-canal — email/sms/courrier/téléphone — manuelle uniquement, envoi email par
-- mailto: côté client) : ce lot couvre un besoin différent (relances email automatiques
-- ET manuelles, devis ET factures, moteur d'éligibilité partagé, anti-doublon fort). Les
-- deux systèmes restent volontairement séparés — `relances_impayes` n'est pas touché.

create table public.parametres_relances (
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,

  devis_auto_actif boolean not null default false,
  devis_delai_premiere_relance_jours int not null default 7 check (devis_delai_premiere_relance_jours between 1 and 90),
  devis_delai_entre_relances_jours int not null default 7 check (devis_delai_entre_relances_jours between 1 and 90),
  devis_nombre_max_relances int not null default 2 check (devis_nombre_max_relances between 1 and 5),

  factures_auto_actif boolean not null default false,
  factures_delai_premiere_relance_jours int not null default 3 check (factures_delai_premiere_relance_jours between 1 and 90),
  factures_delai_entre_relances_jours int not null default 7 check (factures_delai_entre_relances_jours between 1 and 90),
  factures_nombre_max_relances int not null default 3 check (factures_nombre_max_relances between 1 and 5),

  -- §39 : aucune règle de calendrier ouvré n'existe ailleurs dans le produit — option simple
  -- plutôt qu'une convention silencieuse imposée.
  envoyer_weekend boolean not null default false,
  -- §27 : pause temporaire simple (toute la politique auto, devis+factures) plutôt qu'un
  -- statut dédié plus riche — suffisant pour le cas d'usage (vacances, situation exceptionnelle).
  pause_jusqu_au date,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.parametres_relances enable row level security;

create policy "membres parametres_relances" on public.parametres_relances
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Défense en profondeur (même schéma que permissions_rls_gestion.sql) : la configuration
-- des relances automatiques est une action de paramétrage, jamais ouverte à un poste sans
-- gerer_parametres même s'il a par ailleurs gerer_devis/gerer_factures.
create policy "gerer_parametres ecrit parametres_relances" on public.parametres_relances
  as restrictive for insert to authenticated
  with check (public.a_permission(entreprise_id, 'gerer_parametres'));
create policy "gerer_parametres modifie parametres_relances" on public.parametres_relances
  as restrictive for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_parametres'))
  with check (public.a_permission(entreprise_id, 'gerer_parametres'));
create policy "gerer_parametres supprime parametres_relances" on public.parametres_relances
  as restrictive for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_parametres'));

-- Historique + verrou anti-doublon. Une ligne par relance PLANIFIÉE/ENVOYÉE/IGNORÉE/EN ÉCHEC.
create table public.relances_documents (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type_document text not null check (type_document in ('devis', 'facture')),
  document_id uuid not null,
  niveau int not null check (niveau between 1 and 5),

  destinataire text,
  sujet text,

  statut text not null default 'planifiee'
    check (statut in ('planifiee', 'envoyee', 'ignoree', 'echec')),
  motif text,                    -- raison si ignorée (§23-25) ou détail bref si échec
  erreur_public_safe text,       -- jamais le corps brut de la réponse Brevo (cf. brevo.ts)
  provider_message_id text,

  automatique boolean not null default true,
  declenche_par uuid references auth.users(id) on delete set null,

  date_envoi timestamptz,
  created_at timestamptz not null default now()
);

-- §21/§22 : le verrou réel. Un document ne peut avoir qu'une seule relance
-- PLANIFIÉE-ou-ENVOYÉE active pour un niveau donné à un instant T — c'est cette contrainte,
-- pas une vérification applicative seule, qui garantit qu'un double déclenchement (deux crons
-- simultanés, double clic manuel) ne peut produire qu'un seul envoi réel : le second insert
-- échoue silencieusement (ON CONFLICT DO NOTHING côté RPC relance_reclamer), donc n'appelle
-- jamais Brevo. Un statut 'echec' ou 'ignoree' ne bloque pas de nouvelle tentative future
-- (hors de l'index), permettant le retry (§47) sans intervention manuelle.
create unique index relances_documents_verrou
  on public.relances_documents (type_document, document_id, niveau)
  where statut in ('planifiee', 'envoyee');

create index relances_documents_document_idx on public.relances_documents (type_document, document_id, created_at desc);
create index relances_documents_entreprise_idx on public.relances_documents (entreprise_id, created_at desc);

alter table public.relances_documents enable row level security;

create policy "membres relances_documents" on public.relances_documents
  for select using (public.est_membre_actif(entreprise_id));
-- Aucune policy insert/update/delete pour authenticated : toute écriture passe exclusivement
-- par les RPC security definer ci-dessous (revalidation de permission + appartenance document
-- centralisée, jamais confiée à une policy générique qui ne peut pas vérifier "ce devis
-- appartient bien à cette entreprise" sans dupliquer la logique).

-- §28 : exclusion par document. §29 : exclusion par client (ajout simple, évalué utile).
alter table public.devis add column if not exists relance_auto_exclue boolean not null default false;
alter table public.factures add column if not exists relance_auto_exclue boolean not null default false;
alter table public.clients add column if not exists relance_auto_exclue boolean not null default false;

-- RPC 1/2 : réclamation atomique. Ne fait AUCUNE vérification d'éligibilité métier (statut
-- devis/facture, solde, délais) — celle-ci vit uniquement côté applicatif (src/lib/
-- relances-moteur.ts), pour respecter l'exigence "un seul moteur d'éligibilité, pas deux
-- règles différentes" (§5) entre manuel et auto. Cette fonction ne fait que : (a) vérifier
-- que l'appelant a bien le droit de gérer ce type de document pour cette entreprise, (b)
-- vérifier que le document appartient réellement à cette entreprise, (c) réclamer le verrou
-- de façon atomique. Retourne l'id de la ligne réclamée, ou null si déjà réclamée/envoyée.
create or replace function public.relance_reclamer(
  p_entreprise_id uuid,
  p_type_document text,
  p_document_id uuid,
  p_niveau int,
  p_destinataire text,
  p_sujet text,
  p_automatique boolean,
  p_declenche_par uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission text;
  v_appartient boolean;
  v_id uuid;
begin
  if p_type_document not in ('devis', 'facture') then
    raise exception 'Type de document invalide';
  end if;

  v_permission := case when p_type_document = 'devis' then 'gerer_devis' else 'gerer_factures' end;
  if p_automatique then
    -- Le cron appelle avec le client admin (service_role) : aucune session utilisateur,
    -- donc auth.uid() est null et est_membre_actif()/a_permission() (qui en dépendent tous
    -- les deux) renverraient toujours faux ici — ce n'est PAS un contrôle d'accès pertinent
    -- pour ce chemin. La légitimité de l'appel automatique est garantie en amont côté
    -- applicatif (le cron ne construit sa liste de candidats qu'à partir des entreprises où
    -- parametres_relances.devis_auto_actif/factures_auto_actif est déjà activé par un admin).
    -- p_declenche_par doit être null pour une relance auto (jamais un acteur humain).
    if p_declenche_par is not null then
      raise exception 'Une relance automatique ne doit jamais porter de déclencheur humain';
    end if;
  else
    if not public.est_membre_actif(p_entreprise_id) then
      raise exception 'Accès refusé';
    end if;
    if p_declenche_par is null or p_declenche_par <> auth.uid() then
      raise exception 'Déclencheur invalide';
    end if;
    if not public.a_permission(p_entreprise_id, v_permission) then
      raise exception 'Accès refusé';
    end if;
  end if;

  if p_type_document = 'devis' then
    select exists(select 1 from public.devis where id = p_document_id and entreprise_id = p_entreprise_id) into v_appartient;
  else
    select exists(select 1 from public.factures where id = p_document_id and entreprise_id = p_entreprise_id) into v_appartient;
  end if;
  if not v_appartient then
    raise exception 'Document introuvable dans cette entreprise';
  end if;

  insert into public.relances_documents (
    entreprise_id, type_document, document_id, niveau, destinataire, sujet, statut, automatique, declenche_par
  ) values (
    p_entreprise_id, p_type_document, p_document_id, p_niveau, p_destinataire, p_sujet, 'planifiee', p_automatique, p_declenche_par
  )
  on conflict (type_document, document_id, niveau) where statut in ('planifiee', 'envoyee')
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.relance_reclamer(uuid, text, uuid, int, text, text, boolean, uuid) from public, anon;
grant execute on function public.relance_reclamer(uuid, text, uuid, int, text, text, boolean, uuid) to authenticated, service_role;

-- RPC 2/2 : finalisation après tentative d'envoi réelle (appel Brevo fait côté applicatif,
-- entre les deux appels RPC — un appel réseau externe ne doit jamais vivre dans une fonction
-- plpgsql). 'ignoree' est utilisé quand la revalidation juste avant l'envoi (§23-25) a
-- trouvé le document devenu inéligible entre la réclamation et l'envoi : libère aussi le
-- verrou (hors de l'index unique), donc une future tentative pour ce niveau reste possible
-- si le document redevient éligible.
create or replace function public.relance_finaliser(
  p_id uuid,
  p_statut text,
  p_provider_message_id text,
  p_erreur_public_safe text,
  p_motif text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
  v_automatique boolean;
begin
  if p_statut not in ('envoyee', 'ignoree', 'echec') then
    raise exception 'Statut de finalisation invalide';
  end if;
  select entreprise_id, automatique into v_entreprise_id, v_automatique from public.relances_documents where id = p_id;
  if v_entreprise_id is null then
    raise exception 'Relance introuvable';
  end if;
  -- Même raison qu'au-dessus (relance_reclamer) : une ligne automatique a été réclamée par
  -- le cron (service_role, sans auth.uid()) — la finalisation qui lui correspond doit passer
  -- par le même chemin sans exiger de session utilisateur. Une ligne manuelle, elle, ne peut
  -- être finalisée que par un membre actif de l'entreprise concernée.
  if not v_automatique and not public.est_membre_actif(v_entreprise_id) then
    raise exception 'Accès refusé';
  end if;

  update public.relances_documents
  set statut = p_statut,
      provider_message_id = p_provider_message_id,
      erreur_public_safe = p_erreur_public_safe,
      motif = p_motif,
      date_envoi = case when p_statut = 'envoyee' then now() else date_envoi end
  where id = p_id;
end;
$$;

revoke all on function public.relance_finaliser(uuid, text, text, text, text) from public, anon;
grant execute on function public.relance_finaliser(uuid, text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
