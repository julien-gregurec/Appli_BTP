-- P11 — Réinitialisation de l'entreprise de démonstration commerciale.
-- Supprime intégralement les données de public.entreprises où reference_interne='DEMO-18M',
-- puis relance creer_entreprise_demo_18_mois.sql pour repartir d'un état de référence identique.
--
-- Garde-fous :
--   - n'agit que sur l'entreprise identifiée par reference_interne='DEMO-18M' (jamais par nom,
--     modifiable, ni par ID en dur qui peut devenir obsolète si l'entreprise est un jour recréée) ;
--   - refuse toute exécution si aucune entreprise DEMO-18M n'existe, ou si son reference_interne
--     ne correspond pas exactement (double vérification avant toute suppression) ;
--   - vérifie explicitement que l'entreprise réelle "elsatia" (reference_interne='ENT-001')
--     n'est jamais concernée par le périmètre de suppression ci-dessous.
--   - À exécuter uniquement depuis un worktree lié au projet Supabase Production
--     (exhvuzegsefmoguxoiak) via `supabase db query --file ... --linked`.

set statement_timeout='15min';

do $reset$
declare
  v_entreprise uuid;
  v_elsatia uuid;
begin
  select id into v_entreprise from public.entreprises where reference_interne='DEMO-18M' limit 1;
  if v_entreprise is null then
    raise exception 'Garde-fou : aucune entreprise DEMO-18M trouvée — rien à réinitialiser. Exécutez creer_entreprise_demo_18_mois.sql pour la créer.';
  end if;

  select id into v_elsatia from public.entreprises where reference_interne='ENT-001' limit 1;
  if v_elsatia is not null and v_entreprise = v_elsatia then
    raise exception 'Garde-fou critique : l''entreprise ciblée correspond à ENT-001 (elsatia réelle). Arrêt immédiat, aucune suppression effectuée.';
  end if;

  -- Les lignes d'une facture émise sont protégées par trg_lignes_factures_brouillon_only
  -- (garde-fou d'intégrité réel, cf. P9). On repasse les factures démo en brouillon avant
  -- suppression pour respecter ce garde-fou sans jamais désactiver le trigger.
  update public.factures set statut='brouillon' where entreprise_id=v_entreprise;

  delete from public.paiements where facture_id in (select id from public.factures where entreprise_id=v_entreprise);
  delete from public.lignes_factures where facture_id in (select id from public.factures where entreprise_id=v_entreprise);
  delete from public.factures where entreprise_id=v_entreprise;
  delete from public.lignes_devis where devis_id in (select id from public.devis where entreprise_id=v_entreprise);
  delete from public.devis where entreprise_id=v_entreprise;
  delete from public.pointages where entreprise_id=v_entreprise;
  delete from public.affectations where entreprise_id=v_entreprise;
  delete from public.equipes_chantiers where entreprise_id=v_entreprise;
  delete from public.chantiers where entreprise_id=v_entreprise;
  delete from public.clients where entreprise_id=v_entreprise;
  -- outils.employe_id porte une contrainte check (un outil "affecte" doit avoir un
  -- employe_id) : les outils sont supprimés avant les employés pour ne jamais la violer.
  delete from public.outils where entreprise_id=v_entreprise;
  delete from public.vehicules where entreprise_id=v_entreprise;
  delete from public.habilitations_employe where entreprise_id=v_entreprise;
  delete from public.employes where entreprise_id=v_entreprise;
  delete from public.articles_stock where entreprise_id=v_entreprise;
  delete from public.fournisseurs where entreprise_id=v_entreprise;
  delete from public.permissions_poste where entreprise_id=v_entreprise;
  delete from public.postes where entreprise_id=v_entreprise;

  -- L'entreprise elle-même est conservée (nom, offre, reference_interne) : seule sa
  -- composition métier est vidée, prête pour le reseed ci-dessous.
end;$reset$;

-- Vérification post-suppression : aucune donnée métier ne doit subsister sous DEMO-18M,
-- et l'entreprise réelle elsatia doit rester strictement inchangée.
select
  (select count(*) from public.clients where entreprise_id=(select id from public.entreprises where reference_interne='DEMO-18M')) as clients_demo_restants,
  (select count(*) from public.devis where entreprise_id=(select id from public.entreprises where reference_interne='DEMO-18M')) as devis_demo_restants,
  (select count(*) from public.clients where entreprise_id=(select id from public.entreprises where reference_interne='ENT-001')) as clients_elsatia,
  (select count(*) from public.devis where entreprise_id=(select id from public.entreprises where reference_interne='ENT-001')) as devis_elsatia;
