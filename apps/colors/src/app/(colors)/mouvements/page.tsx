import { redirect } from "next/navigation";

/**
 * L'ancienne vue « Mouvements » listait le journal sans filtre, sans auteur et
 * sans pagination. Elle est remplacée par « Activité récente », dont elle est
 * un sous-ensemble strict. L'URL est conservée : les liens et raccourcis déjà
 * posés par les équipes continuent de fonctionner.
 */
export default function MouvementsPage() {
  redirect("/activite");
}
