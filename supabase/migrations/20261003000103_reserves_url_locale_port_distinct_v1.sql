-- ELSATIA SATELLITES PREVIEW READINESS V1 — A-10 (prérequis de la matrice de navigation locale).
--
-- Le catalogue donnait à Réserves `url_locale = http://localhost:3020`, le port de
-- développement de Tools (apps/tools, `localPort: 3020`) ; Studio occupe 3030. En local, le
-- lanceur de Gestion Pro envoyait donc « ELSATIA Réserves » vers Tools. Réserves passe sur 3040
-- (apps/reserves/package.json, `next dev -p 3040`).
--
-- Données de référence locales uniquement : `url_preview` et `url_production` ne sont pas
-- touchées. La mise à jour ne s'applique que si la valeur est encore celle d'origine — une
-- valeur déjà personnalisée n'est jamais écrasée. Aucune décision d'accès n'en dépend.

update public.applications_elsatia
   set url_locale = 'http://localhost:3040', updated_at = now()
 where code = 'reserves'
   and url_locale = 'http://localhost:3020';
