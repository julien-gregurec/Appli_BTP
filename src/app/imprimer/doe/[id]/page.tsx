import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { AutoPrint } from "@/components/AutoPrint";

type RelationArticle = { id: string; reference: string; designation: string; marque: string | null };
const un = <T,>(valeur: T | T[] | null): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

export default async function ImprimerDoePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: chantier }, { data: entreprise }, { data: documents }, { data: mouvements }] = await Promise.all([
    supabase.from("chantiers").select("id,nom,reference_interne,adresse,code_postal,ville,client:clients(nom,prenom,societe)").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("entreprises").select("nom,logo_url").eq("id", ctx.entrepriseId).single(),
    supabase.from("documents_chantier").select("id,nom,categorie,note,created_at").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("categorie"),
    supabase.from("mouvements_stock").select("article_id,quantite,article:articles_stock(id,reference,designation,marque)").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).eq("type", "sortie"),
  ]);
  if (!chantier) notFound();

  const articlesParId = new Map<string, RelationArticle>();
  for (const mouvement of mouvements ?? []) {
    const article = un(mouvement.article as RelationArticle | RelationArticle[] | null);
    if (article) articlesParId.set(article.id, article);
  }
  const articleIds = [...articlesParId.keys()];
  const { data: fiches } = articleIds.length
    ? await supabase.from("fiches_techniques_articles").select("id,article_id,titre,type_document,fabricant,version").eq("entreprise_id", ctx.entrepriseId).in("article_id", articleIds).order("titre")
    : { data: [] };

  const plans = (documents ?? []).filter((document) => document.categorie === "plan");
  const photos = (documents ?? []).filter((document) => document.categorie.startsWith("photo_"));
  const autres = (documents ?? []).filter((document) => document.categorie !== "plan" && !document.categorie.startsWith("photo_"));
  const client = un(chantier.client as { nom: string; prenom: string | null; societe: string | null } | { nom: string; prenom: string | null; societe: string | null }[] | null);

  return (
    <>
      <AutoPrint />
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px", fontFamily: "Arial, Helvetica, sans-serif", color: "#0d1b2a", fontSize: "13px", lineHeight: 1.5, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entreprise?.logo_url || "/liria-gestion-pro-logo-v5.png"} alt="Logo de l'entreprise" style={{ width: "105px", height: "64px", objectFit: "contain" }} />
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.04em" }}>{entreprise?.nom ?? ctx.entrepriseNom}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, textTransform: "uppercase" }}>Dossier des ouvrages exécutés</div>
            <div style={{ fontFamily: "monospace", fontSize: "15px" }}>{chantier.reference_interne}</div>
            <div style={{ color: "#555", marginTop: "4px" }}>Édité le {new Date().toLocaleDateString("fr-FR")}</div>
          </div>
        </div>
        <hr style={{ border: "none", borderTop: "3px solid #c9a24a", margin: "12px 0 20px" }} />

        <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "16px", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: "8px" }}>Identification du chantier</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div><span style={{ color: "#777" }}>Client :</span> {client?.societe ?? [client?.prenom, client?.nom].filter(Boolean).join(" ") ?? "—"}</div>
            <div><span style={{ color: "#777" }}>Chantier :</span> {chantier.nom}</div>
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#777" }}>Adresse :</span> {[chantier.adresse, chantier.code_postal, chantier.ville].filter(Boolean).join(" ") || "Non renseignée"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          {[["Plans", plans.length], ["Photos", photos.length], ["Autres pièces", autres.length], ["Fiches produits", fiches?.length ?? 0]].map(([label, total]) => (
            <div key={String(label)} style={{ flex: 1, border: "1px solid #ddd", borderRadius: "4px", padding: "10px" }}>
              <div style={{ fontSize: "10px", color: "#777" }}>{label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>{total}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: "8px" }}>Plans et documents du chantier</div>
          {(documents ?? []).length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <tbody>
                {(documents ?? []).map((document) => (
                  <tr key={document.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 0" }}>{document.categorie === "plan" ? "Plan" : "Pièce"} — {document.nom}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "#777" }}>{document.categorie.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#777" }}>Aucun plan ou document de chantier.</div>
          )}
        </div>

        <div style={{ marginBottom: "20px", breakInside: "avoid" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: "4px" }}>Produits utilisés et dossier technique</div>
          <div style={{ color: "#777", marginBottom: "8px" }}>Liste générée à partir des sorties de stock affectées à ce chantier.</div>
          {articlesParId.size ? (
            [...articlesParId.values()].map((article) => {
              const docs = (fiches ?? []).filter((fiche) => fiche.article_id === article.id);
              return (
                <div key={article.id} style={{ border: "1px solid #eee", borderRadius: "4px", padding: "8px 10px", marginBottom: "6px" }}>
                  <strong>{article.reference} · {article.designation}</strong>
                  {article.marque && <span style={{ marginLeft: "8px", color: "#777" }}>{article.marque}</span>}
                  <div style={{ marginTop: "4px", fontSize: "11px" }}>
                    {docs.length ? docs.map((fiche) => `${fiche.titre}${fiche.version ? ` · ${fiche.version}` : ""}`).join(" — ") : <span style={{ color: "#b45309" }}>Fiche technique manquante</span>}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ color: "#777" }}>Aucune sortie de stock n&apos;est encore rattachée à ce chantier.</div>
          )}
        </div>
      </div>
    </>
  );
}
