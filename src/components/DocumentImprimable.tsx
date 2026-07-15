import { euros } from "@/lib/devis";

export type EntrepriseEntete = {
  nom: string;
  raison_sociale?: string | null;
  siret?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  logo_url?: string | null;
  assurance_decennale_numero?: string | null;
  assurance_decennale_assureur?: string | null;
  assurance_rc_pro_numero?: string | null;
  taux_penalites_retard?: number | null;
  texte_entete?: string | null;
  texte_pied_page?: string | null;
  police_documents?: "arial" | "georgia" | "trebuchet" | "verdana" | null;
  taille_police_documents?: number | null;
  logo_largeur_documents?: number | null;
  couleur_documents?: string | null;
  couleur_secondaire_documents?: string | null;
  mise_en_page_documents?: "classique" | "compacte" | "epuree" | "moderne" | "elegante" | "technique" | null;
  position_logo_documents?: "gauche" | "centre" | "droite" | null;
  afficher_logo_documents?: boolean | null;
  afficher_descriptions_documents?: boolean | null;
  afficher_tva_lignes_documents?: boolean | null;
};

export type ClientEntete = {
  nom_affiche: string;
  adresse_facturation?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  siret?: string | null;
};

export type LigneImprimable = {
  designation: string;
  description?: string | null;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  taux_tva: number;
};

// Document A4 imprimable partagé devis / facture. Styles inline pour un rendu fiable à l'impression.
export function DocumentImprimable({
  typeDoc,
  numero,
  dateEmission,
  dateSecondaire,
  entreprise,
  client,
  lignes,
  montantHt,
  montantTva,
  montantTtc,
  notesClient,
  estFacture,
}: {
  typeDoc: string;
  numero: string;
  dateEmission: string;
  dateSecondaire?: { label: string; valeur: string } | null;
  entreprise: EntrepriseEntete;
  client: ClientEntete;
  lignes: LigneImprimable[];
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  notesClient?: string | null;
  estFacture: boolean;
}) {
  const polices={arial:"Arial, Helvetica, sans-serif",georgia:"Georgia, 'Times New Roman', serif",trebuchet:"'Trebuchet MS', Arial, sans-serif",verdana:"Verdana, Geneva, sans-serif"};
  const police=polices[entreprise.police_documents??"arial"]??polices.arial;
  const couleur=/^#[0-9a-f]{6}$/i.test(entreprise.couleur_documents??"")?entreprise.couleur_documents!:"#0d1b2a";
  const accent=/^#[0-9a-f]{6}$/i.test(entreprise.couleur_secondaire_documents??"")?entreprise.couleur_secondaire_documents!:"#c9a24a";
  const modele=entreprise.mise_en_page_documents??"classique";
  const compacte=entreprise.mise_en_page_documents==="compacte";
  const epuree=entreprise.mise_en_page_documents==="epuree";
  const moderne=modele==="moderne";
  const elegante=modele==="elegante";
  const technique=modele==="technique";
  const positionLogo=entreprise.position_logo_documents??"gauche";
  const afficherLogo=entreprise.afficher_logo_documents!==false;
  const afficherDescriptions=entreprise.afficher_descriptions_documents!==false;
  const afficherTva=entreprise.afficher_tva_lignes_documents!==false;
  const adresseEntreprise = [entreprise.adresse, [entreprise.code_postal, entreprise.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
  const adresseClient = [client.adresse_facturation, [client.code_postal, client.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: compacte ? "20px" : "32px",
        fontFamily: police,
        color: couleur,
        fontSize: `${entreprise.taille_police_documents??13}px`,
        lineHeight: 1.5,
        background: "#fff",
      }}
    >
      {/* En-tête */}
      <div style={{ display: "flex", flexDirection: positionLogo==="droite"?"row-reverse":"row", justifyContent: positionLogo==="centre"?"center":"space-between", alignItems: "flex-start", gap:"20px", marginBottom: "8px", padding:moderne?"18px":"0", background:moderne?couleur:"transparent", color:moderne?"#fff":couleur, textAlign:positionLogo==="centre"?"center":"left" }}>
        <div style={{ display: "flex", flexDirection:positionLogo==="centre"?"column":"row", alignItems: positionLogo==="centre"?"center":"flex-start", gap: "14px", maxWidth: positionLogo==="centre"?"72%":"62%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {afficherLogo&&<img src={entreprise.logo_url || "/liria-gestion-pro-logo-v3.png"} alt="Logo de l’entreprise" style={{ width: `${entreprise.logo_largeur_documents??105}px`, height: "64px", objectFit: "contain", background:moderne?"#fff":"transparent", borderRadius:moderne?"4px":"0", padding:moderne?"4px":"0" }} />}
          <div>
          <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.04em" }}>{entreprise.nom}</div>
          {entreprise.raison_sociale && entreprise.raison_sociale !== entreprise.nom && <div style={{ color: moderne?"#fff":"#555" }}>{entreprise.raison_sociale}</div>}
          {adresseEntreprise && <div style={{ color: moderne?"#fff":"#555" }}>{adresseEntreprise}</div>}
          {entreprise.siret && <div style={{ color: moderne?"#fff":"#555" }}>SIRET {entreprise.siret}</div>}
          {entreprise.texte_entete && <div style={{ marginTop: "4px", color: moderne?"#fff":"#555" }}>{entreprise.texte_entete}</div>}
          </div>
        </div>
        <div style={{ textAlign: positionLogo==="droite"?"left":"right", display:positionLogo==="centre"?"none":"block" }}>
          <div style={{ fontSize: "22px", fontWeight: 700, textTransform: "uppercase", color: moderne?"#fff":couleur }}>{typeDoc}</div>
          <div style={{ fontFamily: "monospace", fontSize: "15px" }}>{numero}</div>
          <div style={{ color: "#555", marginTop: "4px" }}>Émis le {dateEmission}</div>
          {dateSecondaire && <div style={{ color: "#555" }}>{dateSecondaire.label} {dateSecondaire.valeur}</div>}
        </div>
      </div>

      {positionLogo==="centre"&&<div style={{textAlign:"center",marginBottom:"8px"}}><strong style={{fontSize:"22px",textTransform:"uppercase"}}>{typeDoc}</strong><div style={{fontFamily:"monospace"}}>{numero} · Émis le {dateEmission}</div></div>}
      <hr style={{ border: "none", borderTop: epuree ? `1px solid ${couleur}` : elegante?`1px solid ${accent}`:`3px solid ${accent}`, margin: compacte ? "8px 0 12px" : "12px 0 20px" }} />

      {/* Client */}
      <div style={{ marginBottom: "20px", marginLeft: moderne?"auto":"0", padding:moderne||technique?"12px":"0", width:moderne?"48%":"auto", background:moderne?`${accent}18`:technique?"#f3f4f6":"transparent", borderLeft:moderne?`4px solid ${accent}`:"none" }}>
        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#888" }}>
          {estFacture ? "Facturé à" : "Destinataire"}
        </div>
        <div style={{ fontWeight: 600 }}>{client.nom_affiche}</div>
        {adresseClient && <div style={{ color: "#555" }}>{adresseClient}</div>}
        {client.siret && <div style={{ color: "#555" }}>SIRET {client.siret}</div>}
      </div>

      {/* Lignes */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: epuree||elegante?"transparent":couleur, color: epuree||elegante?couleur:"#fff", textAlign: "left", borderTop:elegante?`1px solid ${accent}`:"none", borderBottom:epuree||elegante?`2px solid ${couleur}`:"none" }}>
            <th style={{ padding: "8px", fontSize: "10px", textTransform: "uppercase" }}>Désignation</th>
            <th style={{ padding: "8px", fontSize: "10px", textTransform: "uppercase", textAlign: "right" }}>Qté</th>
            <th style={{ padding: "8px", fontSize: "10px", textTransform: "uppercase", textAlign: "right" }}>PU HT</th>
            {afficherTva&&<th style={{ padding: "8px", fontSize: "10px", textTransform: "uppercase", textAlign: "right" }}>TVA</th>}
            <th style={{ padding: "8px", fontSize: "10px", textTransform: "uppercase", textAlign: "right" }}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => {
            const ht = l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #e5e5e5", background:technique&&i%2===1?"#f5f6f7":"transparent" }}>
                <td style={{ padding: "8px" }}>
                  {l.designation}
                  {afficherDescriptions&&l.description && <div style={{ color: "#777", fontSize: "11px" }}>{l.description}</div>}
                </td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{l.quantite} {l.unite}</td>
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{euros(l.prix_unitaire_ht)}</td>
                {afficherTva&&<td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{l.taux_tva} %</td>}
                <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{euros(ht)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totaux */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
        <table style={{ fontSize: "13px", minWidth: "260px" }}>
          <tbody>
            <tr>
              <td style={{ padding: "3px 8px", color: "#555" }}>Total HT</td>
              <td style={{ padding: "3px 8px", textAlign: "right", fontFamily: "monospace" }}>{euros(montantHt)}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 8px", color: "#555" }}>TVA</td>
              <td style={{ padding: "3px 8px", textAlign: "right", fontFamily: "monospace" }}>{euros(montantTva)}</td>
            </tr>
            <tr style={{ borderTop: `2px solid ${accent}`, fontWeight: 700, background:moderne?`${accent}18`:"transparent" }}>
              <td style={{ padding: "6px 8px" }}>Total TTC</td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{euros(montantTtc)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {notesClient && (
        <div style={{ marginTop: "24px", padding: "12px", background: "#f9f9f9", borderRadius: "4px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", color: "#888" }}>Notes</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{notesClient}</div>
        </div>
      )}

      {/* Mentions légales BTP */}
      <div style={{ marginTop: "32px", paddingTop: "12px", borderTop: "1px solid #ddd", fontSize: "10px", color: "#777", lineHeight: 1.6 }}>
        {entreprise.assurance_decennale_numero && (
          <div>Assurance décennale : {entreprise.assurance_decennale_numero}{entreprise.assurance_decennale_assureur ? ` (${entreprise.assurance_decennale_assureur})` : ""}</div>
        )}
        {entreprise.assurance_rc_pro_numero && <div>RC Pro : {entreprise.assurance_rc_pro_numero}</div>}
        {estFacture && (
          <div>
            Pénalités de retard : {entreprise.taux_penalites_retard ? `${entreprise.taux_penalites_retard} %` : "3× le taux d'intérêt légal"} ·
            Indemnité forfaitaire de recouvrement : 40 €
          </div>
        )}
        {entreprise.texte_pied_page && <div style={{ marginTop: "4px" }}>{entreprise.texte_pied_page}</div>}
      </div>
    </div>
  );
}
