-- Quatre migrations posterieures au verrouillage anonyme du 2026-07-14 ont
-- accorde execute a anon sur des fonctions dont le corps contient un contournement
-- d'authentification du meme type que cloturer_session_pointage (20260723000130,
-- corrige par 20260724000154) : une condition de la forme
-- "auth.role() est distinct de 'anon' et pas de permission" (ou l'equivalent
-- "auth.role()='anon' ou permission"), qui ne leve JAMAIS d'exception quand
-- auth.role()='anon', donc laisse passer n'importe quelle requete non authentifiee.
--
-- Verifie en direct via curl avec la cle anon publique, sans aucun jeton
-- d'authentification :
--   - articles_stock_avec_prix / lignes_inventaire_avec_prix (20260718000108) :
--     retournent les prix d'achat/vente et valorisations de stock.
--   - materialiser_charge_recurrente (20260717000092) : insere une vraie ligne
--     dans depenses_fournisseurs pour n'importe quel entreprise_id/charge_id
--     ("Charge introuvable" renvoye a la place de "Acces refuse" = contournement
--     confirme, pas juste une fonction manquante).
--   - modifier_compte_poste_pointage (20260718000110) : changerait le poste ou
--     reactiverait n'importe quel utilisateur de n'importe quelle entreprise
--     ("Poste invalide" renvoye a la place de "Acces refuse" = confirme).
--   - creer_inventaire_stock_selection (20260717000094) : delegue a
--     creer_inventaire_stock (pre-verrouillage, meme contournement dans son
--     corps), qui s'execute quel que soit l'appelant car SECURITY DEFINER
--     ("Zone introuvable" renvoye a la place de "Acces refuse" = confirme).
--
-- Contrairement aux tables du verrouillage du 2026-07-14, ces fonctions ont ete
-- creees/re-octroyees APRES coup : le simple revoke suffit, elles n'ont jamais eu
-- de raison legitime d'etre appelables sans authentification.

revoke execute on function public.articles_stock_avec_prix(uuid) from anon;
revoke execute on function public.lignes_inventaire_avec_prix(uuid,uuid) from anon;
revoke execute on function public.materialiser_charge_recurrente(uuid,uuid,text,date) from anon;
revoke execute on function public.modifier_compte_poste_pointage(uuid,uuid,uuid,boolean) from anon;
revoke execute on function public.creer_inventaire_stock_selection(uuid,uuid[],uuid,text) from anon;

notify pgrst, 'reload schema';
