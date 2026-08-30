import type { ElsatiaPromotion } from "@/lib/promotions";

export function PromotionCard({ promotion }: { promotion: ElsatiaPromotion }) {
  return <aside className="elsatia-promotion" aria-label={`Suggestion ${promotion.application}`}>
    <span className="promotion-brand">ELSATIA <b>{promotion.application === "gestion-pro" ? "GESTION PRO" : "COLORS"}</b></span>
    <div><strong>{promotion.title}</strong><p>{promotion.description}</p></div>
    <a href={promotion.url} rel="noreferrer">{promotion.cta} <span>→</span></a>
  </aside>;
}
