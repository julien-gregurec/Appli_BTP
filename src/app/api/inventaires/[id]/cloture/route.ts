import { reponseCsv } from "@/lib/csv";
import { getContexteEntreprise } from "@/lib/entreprise";
import { calculerSyntheseInventaire } from "@/lib/inventaires";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { reponseXlsx } from "@/lib/xlsx";

type Article = { reference: string; designation: string; unite: string };
type LignePrix = {
  reference: string;
  designation: string;
  unite: string;
  quantite_theorique: number;
  quantite_comptee: number | null;
  prix_achat_ht_snapshot: number;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(contexte);
  const peutVoirPrix = permissions === null || permissions.includes("voir_prix_stock") || permissions.includes("gerer_prix_stock");
  if (!peutVoirPrix) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: inventaire, error: erreurInventaire }, { data: lignes, error: erreurLignes }] = await Promise.all([
    supabase.from("inventaires").select("numero,date_inventaire,statut,commentaire,valide_at").eq("id", id).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase.rpc("lignes_inventaire_avec_prix", {
      p_entreprise_id: contexte.entrepriseId,
      p_inventaire_id: id,
    }),
  ]);
  if (erreurInventaire || erreurLignes) return Response.json({ error: erreurInventaire?.message ?? erreurLignes?.message }, { status: 503 });
  if (!inventaire) return Response.json({ error: "Inventaire introuvable" }, { status: 404 });
  if (inventaire.statut !== "valide") return Response.json({ error: "L’inventaire doit être validé avant son export comptable" }, { status: 409 });

  const details = ((lignes ?? []) as LignePrix[]).map((ligne) => {
    const article: Article = {
      reference: String(ligne.reference ?? ""),
      designation: String(ligne.designation ?? ""),
      unite: String(ligne.unite ?? ""),
    };
    const theorique = Number(ligne.quantite_theorique);
    const compte = Number(ligne.quantite_comptee);
    const prix = Number(ligne.prix_achat_ht_snapshot);
    return { article, theorique, compte, prix, ecart: compte - theorique, valeurTheorique: theorique * prix, valeurComptee: compte * prix };
  });
  const synthese = calculerSyntheseInventaire(details.map((ligne) => ({
    quantiteTheorique: ligne.theorique,
    quantiteComptee: ligne.compte,
    prixAchatHt: ligne.prix,
  })));

  const csv: unknown[][] = [
    ["RAPPORT DE CLÔTURE D’INVENTAIRE"],
    ["Inventaire", inventaire.numero],
    ["Date d’inventaire", inventaire.date_inventaire],
    ["Date de validation", inventaire.valide_at ?? ""],
    ["Statut", inventaire.statut],
    ["Commentaire", inventaire.commentaire ?? ""],
    ["Traçabilité du prix", String(inventaire.date_inventaire) < "2026-07-17" ? "Inventaire antérieur à la migration 93 : prix initialisés depuis le catalogue le 17/07/2026, à vérifier" : "Prix d’achat HT figés à la création de l’inventaire"],
    [],
    ["SYNTHÈSE"],
    ["Nombre d’articles", synthese.articles],
    ["Articles avec écart", synthese.articlesAvecEcart],
    ["Quantités manquantes", synthese.quantiteManquante],
    ["Quantités excédentaires", synthese.quantiteExcedentaire],
    ["Valeur théorique HT", synthese.valeurTheoriqueHt],
    ["Valeur comptée HT", synthese.valeurCompteeHt],
    ["Écart de valeur HT", synthese.ecartValeurHt],
    [],
    ["Référence", "Article", "Unité", "Quantité théorique", "Quantité comptée", "Écart quantité", "Prix achat unitaire HT figé", "Valeur théorique HT", "Valeur comptée HT", "Écart de valeur HT"],
  ];
  for (const ligne of details) {
    csv.push([
      ligne.article?.reference ?? "",
      ligne.article?.designation ?? "",
      ligne.article?.unite ?? "",
      ligne.theorique,
      ligne.compte,
      ligne.ecart,
      ligne.prix,
      ligne.valeurTheorique,
      ligne.valeurComptee,
      ligne.valeurComptee - ligne.valeurTheorique,
    ]);
  }
  csv.push([], ["Document préparatoire à transmettre à l’expert-comptable. La méthode de valorisation, les prix historiques et les éventuelles dépréciations restent à valider."]);
  const nom = `cloture-inventaire-${inventaire.numero}-${inventaire.date_inventaire}`;
  if (new URL(request.url).searchParams.get("format") === "csv") return reponseCsv(csv, `${nom}.csv`);
  return reponseXlsx(csv, `${nom}.xlsx`, { nomFeuille: "Clôture inventaire", ligneEntetes: 18 });
}
