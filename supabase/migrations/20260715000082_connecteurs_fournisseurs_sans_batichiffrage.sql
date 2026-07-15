-- Retire BatiChiffrage et prépare des connexions fournisseurs explicites.
-- Aucun mot de passe fournisseur n'est stocké dans la base.

delete from public.connecteurs_externes where domaine = 'batichiffrage';

alter table public.connecteurs_externes
  drop constraint if exists connecteurs_externes_domaine_check,
  drop constraint if exists connecteurs_externes_type_check;

-- Normalise les éventuelles valeurs de la première version avant de poser
-- la contrainte étendue. La migration reste ainsi rejouable sur une base pilote.
update public.connecteurs_externes set type = 'punchout_cxml' where type = 'punchout';
update public.connecteurs_externes set type = 'api' where type = 'webhook';

alter table public.connecteurs_externes
  add constraint connecteurs_externes_domaine_check
    check (domaine in ('fournisseur','comptabilite','paiement','sms')),
  add constraint connecteurs_externes_type_check
    check (type in ('portail','csv','xlsx','fabdis','api','edi','punchout_oci','punchout_cxml','oauth2')),
  add column if not exists fournisseur_code text,
  add column if not exists compte_client_reference text,
  add column if not exists capacites text[] not null default '{}',
  add column if not exists activation_demandee_at timestamptz,
  add column if not exists contact_technique_email text;

create index if not exists connecteurs_externes_fournisseur_code_idx
  on public.connecteurs_externes(entreprise_id, fournisseur_code)
  where fournisseur_code is not null;

comment on column public.connecteurs_externes.compte_client_reference is
  'Numéro de compte client non secret. Ne jamais enregistrer de mot de passe dans cette table.';

notify pgrst, 'reload schema';
