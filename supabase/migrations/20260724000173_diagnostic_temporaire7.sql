-- Diagnostic temporaire (a supprimer juste apres usage) : verifier isolement le calcul
-- du garde-fou de surfacturation introduit dans 20260724000172, sans passer par le
-- garde-fou d'authentification de creer_facture_avancee (a_permission echoue sans
-- session utilisateur reelle, meme avec la cle service).
create or replace function public.debug_garde_fou_devis(p_devis_id uuid, p_pourcentage numeric)
returns table(montant_devis numeric, deja_facture numeric, montant_nouveau numeric, serait_bloque boolean)
language sql stable security definer set search_path = public as $$
  select d.montant_ht,
    coalesce((select sum(f.montant_ht) from public.factures f where f.devis_origine_id=p_devis_id and f.statut<>'annulee'),0),
    d.montant_ht*(p_pourcentage/100),
    coalesce((select sum(f.montant_ht) from public.factures f where f.devis_origine_id=p_devis_id and f.statut<>'annulee'),0) + d.montant_ht*(p_pourcentage/100) > d.montant_ht+0.01
  from public.devis d where d.id=p_devis_id;
$$;
revoke all on function public.debug_garde_fou_devis(uuid,numeric) from public,anon,authenticated;
grant execute on function public.debug_garde_fou_devis(uuid,numeric) to service_role;
