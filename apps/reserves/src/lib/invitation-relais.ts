import "server-only";
import { cookies } from "next/headers";

/**
 * Relais éphémère du lien d'invitation, entre l'action qui l'émet et l'écran qui l'affiche.
 *
 * POURQUOI CE DÉTOUR.
 * Quand l'e-mail d'invitation ne part pas, l'invitation reste valide et l'application doit
 * remettre le lien à l'utilisateur pour qu'il le transmette autrement. La V5 le faisait en
 * le plaçant dans l'URL de retour (`?lien=https://…/invitation/<jeton>`). Or le jeton EST
 * le secret : le mettre dans une URL, c'est le déposer dans
 *
 *   • la barre d'adresse et l'HISTORIQUE du navigateur, qui survit à la session ;
 *   • les JOURNAUX d'accès du serveur et de l'hébergeur, où les URL complètes sont
 *     conservées bien plus longtemps que les 30 jours de validité de l'invitation ;
 *   • l'en-tête `Referer` de toute ressource tierce chargée par la page.
 *
 * Le module `lib/invitations` promet que « le jeton en clair n'existe que dans l'URL remise
 * au destinataire — jamais en base, jamais dans un journal ». Le passage par l'URL de
 * retour contredisait cette promesse ; ce relais la rétablit.
 *
 * Le lien voyage donc dans un cookie `httpOnly`, `SameSite=Strict`, de durée très courte.
 * Il n'apparaît ni dans l'historique, ni dans les journaux d'accès, et aucun script de la
 * page ne peut le lire. Il n'est pas effacé explicitement après lecture : un composant
 * serveur n'a pas le droit d'écrire un cookie. Sa durée de vie s'en charge — et un lien
 * d'invitation reste de toute façon révocable en un geste depuis l'écran des intervenants.
 */
const CLE = "elsatia-reserves-lien-invitation";

/** Assez pour recharger l'écran et copier le lien ; trop court pour traîner. */
const DUREE_SECONDES = 300;

export async function deposerLienInvitation(lien: string): Promise<void> {
  (await cookies()).set(CLE, lien, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: DUREE_SECONDES,
    path: "/",
  });
}

export async function retirerLienInvitation(): Promise<string | null> {
  return (await cookies()).get(CLE)?.value ?? null;
}
