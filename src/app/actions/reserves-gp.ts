"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  messageErreurSynchronisation,
  messageSynchronisation,
  synchroniserChantierReserves,
  type ClientReservesGp,
} from "@/lib/reserves-gp";

/*
 * « Utiliser dans ELSATIA Réserves » : crée ou rattache le chantier Réserves, puis transmet
 * adresse, client, entreprises, contacts et plans. Relançable à volonté (idempotent). Les
 * droits sont vérifiés par la base, des deux côtés, sur l'entreprise du chantier.
 */
export async function utiliserDansReservesAction(chantierId: string) {
  await getContexteEntreprise();
  const supabase = await createClient();
  let destination: string;
  try {
    const { rapport, copies } = await synchroniserChantierReserves(supabase as unknown as ClientReservesGp, chantierId);
    destination = `/chantiers/${chantierId}?success=${encodeURIComponent(messageSynchronisation(rapport, copies))}#reserves`;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    destination = `/chantiers/${chantierId}?error=${encodeURIComponent(messageErreurSynchronisation(message))}#reserves`;
  }
  revalidatePath(`/chantiers/${chantierId}`);
  redirect(destination);
}
