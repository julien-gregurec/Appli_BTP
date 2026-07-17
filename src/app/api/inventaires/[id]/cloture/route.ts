import { reponseCsv, nombreCsv } from "@/lib/csv";
import { getContexteEntreprise } from "@/lib/entreprise";
import { calculerSyntheseInventaire } from "@/lib/inventaires";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

type Article = { reference: string; designation: string; unite: string };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(contexte);
  if (permissions !== null && !permissions.includes("acces_stock") && !permissions.includes("gerer_stock")) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: inventaire, error: erreurInventaire }, { data: lignes, error: erreurLignes }] = await Promise.all([
    supabase.from("inventaires").select("numero,date_inventaire,statut,commentaire,valide_at").eq("id", id).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase
      .from("lignes_inventaire")
      .select("quantite_theorique,quantite_comptee,prix_achat_ht_snapshot,article:articles_stock(reference,designation,unite)")
      .eq("inventaire_id", id)
      .eq("entreprise_id", contexte.entrepriseId)
      .order("created_at"),
  ]);
  if (erreurInventaire || erreurLignes) return Response.json({ error: erreurInventaire?.message ?? erreurLignes?.message }, { status: 503 });
  if (!inventaire) return Response.json({ error: "Inventaire introuvable" }, { status: 404 });
  if (inventaire.statut !== "valide") return Response.json({ error: "L’inventaire doit être validé avant son export comptable" }, { status: 409 });

  const details = (lignes ?? []).map((ligne) => {
    const article = un(ligne.article as Article | Article[] | null);
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
    ["Quantités manquantes", nombreCsv(synthese.quantiteManquante)],
    ["Quantités excédentaires", nombreCsv(synthese.quantiteExcedentaire)],
    ["Valeur théorique HT", nombreCsv(synthese.valeurTheoriqueHt)],
    ["Valeur comptée HT", nombreCsv(synthese.valeurCompteeHt)],
    ["Écart de valeur HT", nombreCsv(synthese.ecartValeurHt)],
    [],
    ["Référence", "Article", "Unité", "Quantité théorique", "Quantité comptée", "Écart quantité", "Prix achat unitaire HT figé", "Valeur théorique HT", "Valeur comptée HT", "Écart de valeur HT"],
  ];
  for (const ligne of details) {
    csv.push([
      ligne.article?.reference ?? "",
      ligne.article?.designation ?? "",
      ligne.article?.unite ?? "",
      nombreCsv(ligne.theorique),
      nombreCsv(ligne.compte),
      nombreCsv(ligne.ecart),
      nombreCsv(ligne.prix),
      nombreCsv(ligne.valeurTheorique),
      nombreCsv(ligne.valeurComptee),
      nombreCsv(ligne.valeurComptee - ligne.valeurTheorique),
    ]);
  }
  csv.push([], ["Document préparatoire à transmettre à l’expert-comptable. La méthode de valorisation, les prix historiques et les éventuelles dépréciations restent à valider."]);
  return reponseCsv(csv, `cloture-inventaire-${inventaire.numero}-${inventaire.date_inventaire}.csv`);
}
