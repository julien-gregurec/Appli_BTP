import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chargerHabilitationsAnnuaire } from "@/lib/plateforme-annuaire-habilitations";
import { chargerAnnuairePourExport, PLAFOND_EXPORT } from "@/lib/plateforme-annuaire-serveur";
import { analyserRequeteAnnuaire, COLONNES_ANNUAIRE } from "@/lib/plateforme-annuaire";
import { construireCsvAnnuaire } from "@/lib/plateforme-annuaire-csv";

export const dynamic = "force-dynamic";

/**
 * Export CSV de l'annuaire filtré.
 *
 * Trois garde-fous, dans cet ordre :
 *  1. le rôle plateforme doit porter l'habilitation d'export ;
 *  2. l'extraction est JOURNALISÉE avant d'être produite — un export massif de
 *     données clients sans trace est précisément ce que le cahier des charges
 *     interdit (§15). Si la journalisation n'aboutit pas, l'export est refusé
 *     plutôt que produit en silence ;
 *  3. les colonnes exportées sont celles de l'écran, filtrées par les
 *     habilitations : un rôle sans accès facturation n'exporte aucun montant.
 *
 * Les lignes proviennent d'une relecture serveur complète du jeu filtré, pas
 * de la page affichée.
 */
export async function GET(requeteHttp: NextRequest) {
  const habilitations = await chargerHabilitationsAnnuaire();
  if (!habilitations.peutConsulter) {
    return new NextResponse("Introuvable", { status: 404 });
  }
  if (!habilitations.peutExporter) {
    return NextResponse.json(
      { erreur: "Votre rôle plateforme ne permet pas d'exporter l'annuaire." },
      { status: 403 },
    );
  }

  const params = Object.fromEntries(requeteHttp.nextUrl.searchParams);
  const requete = analyserRequeteAnnuaire(params);
  const maintenant = new Date();

  const colonnes = COLONNES_ANNUAIRE.filter(
    (colonne) =>
      requete.colonnes.includes(colonne.cle) &&
      (habilitations.peutVoirFacturation || colonne.groupe !== "Facturation"),
  ).map((colonne) => colonne.cle);

  const trace = await journaliserExport(requete.q, requete.onglet, colonnes.length, habilitations.modeDemonstration);
  if (!trace.ok) {
    return NextResponse.json(
      {
        erreur:
          "Export refusé : l'extraction n'a pas pu être journalisée, or un export de données clients doit " +
          "rester traçable. " + trace.raison,
      },
      { status: 503 },
    );
  }

  const resultat = await chargerAnnuairePourExport(requete, maintenant);
  const csv = construireCsvAnnuaire(resultat.lignes, colonnes, maintenant);
  const horodatage = maintenant.toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="elsatia-entreprises-${horodatage}.csv"`,
      "Cache-Control": "no-store",
      "X-Elsatia-Export-Lignes": String(resultat.lignes.length),
      "X-Elsatia-Export-Total": String(resultat.total),
      "X-Elsatia-Export-Tronque": resultat.tronque ? `oui (plafond ${PLAFOND_EXPORT})` : "non",
      "X-Elsatia-Export-Mode": resultat.mode,
    },
  });
}

async function journaliserExport(
  recherche: string,
  onglet: string,
  nbColonnes: number,
  modeDemonstration: boolean,
): Promise<{ ok: true } | { ok: false; raison: string }> {
  if (modeDemonstration) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_journaliser", {
    p_action: "annuaire_export_csv",
    p_cible_type: "annuaire",
    p_cible_id: onglet,
    // Ni identifiants d'entreprise ni contenu exporté : seulement le périmètre.
    p_details: { recherche_non_vide: recherche.length > 0, onglet, colonnes: nbColonnes },
  });

  if (!error) return { ok: true };
  return {
    ok: false,
    raison:
      `La fonction \`plateforme_journaliser\` n'est pas exécutable par cette session (${error.message}). ` +
      "Elle n'est aujourd'hui accordée à aucun rôle applicatif : voir la proposition SQL " +
      "docs/migrations-proposees/ (grant d'exécution au rôle `authenticated`).",
  };
}
