/**
 * Rendu A4 des devis et factures — moteur de présentation v2.
 *
 * UN SEUL composant pour l'aperçu de l'éditeur, la page d'impression, le PDF (Chromium imprime
 * cette même page), le portail client et la pièce jointe d'e-mail. Il ne calcule rien : il
 * dessine une `VueDocument` (document-modele.ts) découpée par `paginer()` (pagination.ts).
 *
 * Purement présentationnel, sans état ni gestionnaire d'événement : il se rend aussi bien sur
 * le serveur que dans le navigateur. L'aperçu interactif l'enveloppe et s'appuie sur les
 * attributs `data-cle` des lignes pour ouvrir l'édition d'une ligne cliquée.
 *
 * Chaque page mesure exactement 210 × 297 mm. Le filigrane est posé SOUS le contenu, sans fond,
 * à opacité bornée : il ne peut masquer ni un montant ni une mention.
 */

import { euros } from "@/lib/devis";
import { descriptionAccessible, type FiligraneResolu } from "@/lib/devis/filigrane";
import type { VueDocument } from "@/lib/devis/document-modele";
import { MARGES_MM, PAGE_A4_MM, PIED_MM, paginer, type BlocPage, type PageDocument } from "@/lib/devis/pagination";
import type { LigneClient } from "@/lib/devis/presentation";

const POLICES: Record<VueDocument["style"]["police"], string> = {
  arial: "Arial, Helvetica, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  trebuchet: "'Trebuchet MS', Arial, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
};

const quantiteFr = (x: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(x);
const tauxFr = (x: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(x)} %`;

const CSS = `
.doc-a4{--doc-couleur:#0d1b2a;--doc-accent:#c9a24a;color:var(--doc-couleur);}
.doc-a4 *{box-sizing:border-box;}
.doc-a4__page{position:relative;width:${PAGE_A4_MM.largeur}mm;height:${PAGE_A4_MM.hauteur}mm;
  padding:${MARGES_MM.haut}mm ${MARGES_MM.droite}mm ${MARGES_MM.bas + PIED_MM}mm ${MARGES_MM.gauche}mm;
  background:#fff;overflow:hidden;line-height:1.45;}
.doc-a4--apercu .doc-a4__page{margin:0 auto 8mm;box-shadow:0 1px 4px rgba(0,0,0,.18);}
.doc-a4__page[data-debordement="true"]{outline:3px dashed #b91c1c;outline-offset:-3px;}
.doc-a4__contenu{position:relative;z-index:1;height:100%;}
.doc-a4__pied{position:absolute;z-index:1;left:${MARGES_MM.gauche}mm;right:${MARGES_MM.droite}mm;bottom:${MARGES_MM.bas}mm;
  height:${PIED_MM}mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:8px;color:#666;}
.doc-a4__filigrane{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;display:flex;justify-content:center;}
.doc-a4__filigrane[data-position="centre"]{align-items:center;}
.doc-a4__filigrane[data-position="haut"]{align-items:flex-start;padding-top:30mm;}
.doc-a4__filigrane[data-position="bas"]{align-items:flex-end;padding-bottom:40mm;}
.doc-a4__filigrane-grille{display:grid;grid-template-columns:repeat(2,1fr);grid-auto-rows:1fr;width:100%;height:100%;place-items:center;}
.doc-a4__motif{display:flex;flex-direction:column;align-items:center;gap:4mm;white-space:nowrap;font-weight:700;letter-spacing:.08em;}
.doc-a4__motif img{max-width:100%;object-fit:contain;}
.doc-a4__entete{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.doc-a4__entete[data-logo="droite"]{flex-direction:row-reverse;}
.doc-a4__entete[data-logo="centre"]{flex-direction:column;align-items:center;text-align:center;}
.doc-a4__emetteur{display:flex;gap:14px;align-items:flex-start;max-width:62%;}
.doc-a4__entete[data-logo="centre"] .doc-a4__emetteur{flex-direction:column;align-items:center;max-width:80%;}
.doc-a4__nom{font-size:18px;font-weight:700;letter-spacing:.04em;}
.doc-a4__gris{color:#555;}
.doc-a4__titre{text-align:right;}
.doc-a4__entete[data-logo="droite"] .doc-a4__titre{text-align:left;}
.doc-a4__entete[data-logo="centre"] .doc-a4__titre{text-align:center;}
.doc-a4__titre strong{display:block;font-size:22px;text-transform:uppercase;}
.doc-a4__numero{font-family:monospace;font-size:15px;}
.doc-a4__filet{border:none;border-top:3px solid var(--doc-accent);margin:12px 0 18px;}
.doc-a4__rappel{font-size:10px;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px;}
.doc-a4__destinataire{margin-bottom:18px;}
.doc-a4__etiquette{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#888;}
.doc-a4__tableau{width:100%;border-collapse:collapse;font-size:calc(var(--doc-taille) - 1px);}
.doc-a4__tableau th{padding:7px 8px;font-size:10px;text-transform:uppercase;text-align:right;background:var(--doc-couleur);color:#fff;}
.doc-a4__tableau th:first-child{text-align:left;width:46%;}
.doc-a4__tableau td{padding:7px 8px;text-align:right;vertical-align:top;border-bottom:1px solid #e5e5e5;font-family:monospace;}
.doc-a4__tableau td:first-child{text-align:left;font-family:inherit;}
.doc-a4__tableau tr[data-niveau="1"] td{font-size:calc(var(--doc-taille) - 2px);color:#333;}
.doc-a4__tableau tr[data-niveau="1"] td:first-child{padding-left:22px;}
.doc-a4__tableau tr[data-entete-ouvrage="true"] td{font-weight:700;background:rgba(0,0,0,.03);}
.doc-a4__description{color:#777;font-size:calc(var(--doc-taille) - 2px);font-weight:400;white-space:pre-wrap;}
.doc-a4__suite{font-size:10px;color:#888;text-align:right;margin-bottom:2px;}
.doc-a4__totaux{display:flex;justify-content:flex-end;margin-top:14px;}
.doc-a4__totaux table{min-width:290px;font-size:var(--doc-taille);border-collapse:collapse;}
.doc-a4__totaux td{padding:3px 8px;}
.doc-a4__totaux td:last-child{text-align:right;font-family:monospace;}
.doc-a4__totaux tr[data-total="ttc"]{border-top:2px solid var(--doc-accent);font-weight:700;}
.doc-a4__ecart{margin-top:6px;padding:6px;border:1px solid #b91c1c;color:#b91c1c;font-size:10px;}
.doc-a4__texte{margin-top:18px;padding:10px 12px;background:rgba(0,0,0,.025);border-radius:4px;white-space:pre-wrap;}
.doc-a4__accord{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.doc-a4__accord div{border:1px solid #bbb;border-radius:4px;padding:10px;height:28mm;font-size:10px;color:#555;}
.doc-a4__mentions{margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:10px;color:#777;line-height:1.5;}
.doc-a4[data-mise-en-page="compacte"] .doc-a4__tableau td{padding:4px 6px;}
.doc-a4[data-mise-en-page="epuree"] .doc-a4__tableau th,.doc-a4[data-mise-en-page="elegante"] .doc-a4__tableau th{background:transparent;color:var(--doc-couleur);border-bottom:2px solid var(--doc-couleur);}
.doc-a4[data-mise-en-page="epuree"] .doc-a4__filet{border-top-width:1px;border-color:var(--doc-couleur);}
.doc-a4[data-mise-en-page="elegante"] .doc-a4__filet{border-top-width:1px;}
.doc-a4[data-mise-en-page="moderne"] .doc-a4__entete{background:var(--doc-couleur);color:#fff;padding:14px;}
.doc-a4[data-mise-en-page="moderne"] .doc-a4__gris{color:#fff;}
.doc-a4[data-mise-en-page="technique"] .doc-a4__tableau tbody tr:nth-child(even) td{background:#f5f6f7;}
@media print{
  @page{size:A4;margin:0;}
  html,body{margin:0;padding:0;background:#fff;}
  .doc-a4__page{margin:0!important;box-shadow:none!important;outline:none!important;break-after:page;page-break-after:always;}
  .doc-a4__page:last-child{break-after:auto;page-break-after:auto;}
  .doc-a4,.doc-a4 *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
`;

function Filigrane({ f, logoUrl }: { f: FiligraneResolu; logoUrl: string | null }) {
  if (f.type === "aucun") return null;
  const avecLogo = (f.type === "logo" || f.type === "logo_texte") && !!logoUrl;
  const avecTexte = (f.type === "texte" || f.type === "logo_texte") && !!f.texte;
  if (!avecLogo && !avecTexte) return null;
  const largeurMm = (f.taillePct / 100) * PAGE_A4_MM.largeur * (f.repetition ? 0.5 : 1);
  const texte = f.texte ?? "";
  // Taille de police telle que le texte occupe la largeur demandée (≈ 0,62 em par capitale).
  const policeMm = Math.max(6, Math.min(60, largeurMm / Math.max(3, texte.length * 0.62)));
  const motif = (i: number) => (
    <div key={i} className="doc-a4__motif" style={{ transform: `rotate(${f.rotationDeg}deg)`, color: f.couleur, width: `${largeurMm}mm` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avecLogo && <img src={logoUrl!} alt="" style={{ width: `${largeurMm * (avecTexte ? 0.5 : 1)}mm` }} />}
      {avecTexte && <span style={{ fontSize: `${policeMm}mm` }}>{texte}</span>}
    </div>
  );
  return (
    <div className="doc-a4__filigrane" data-position={f.position} aria-hidden="true" data-testid="filigrane" style={{ opacity: f.opacite }}>
      {f.repetition ? <div className="doc-a4__filigrane-grille">{[0, 1, 2, 3, 4, 5].map(motif)}</div> : motif(0)}
    </div>
  );
}

function Entete({ vue }: { vue: VueDocument }) {
  const e = vue.emetteur;
  const adresse = [e.adresse, [e.codePostal, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <>
      <div className="doc-a4__entete" data-logo={vue.style.positionLogo}>
        <div className="doc-a4__emetteur">
          {vue.style.afficherLogo && e.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.logoUrl} alt="Logo de l’entreprise" style={{ width: `${vue.style.logoLargeur}px`, height: "64px", objectFit: "contain" }} />
          )}
          <div>
            <div className="doc-a4__nom">{e.nom}</div>
            {e.raisonSociale && e.raisonSociale !== e.nom && <div className="doc-a4__gris">{e.raisonSociale}</div>}
            {adresse && <div className="doc-a4__gris">{adresse}</div>}
            {e.siret && <div className="doc-a4__gris">SIRET {e.siret}</div>}
            {e.texteEntete && <div className="doc-a4__gris" style={{ whiteSpace: "pre-wrap" }}>{e.texteEntete}</div>}
          </div>
        </div>
        <div className="doc-a4__titre">
          <strong>{vue.titre}</strong>
          <div className="doc-a4__numero">{vue.numero}</div>
          {vue.dateEmission && <div className="doc-a4__gris">Émis le {vue.dateEmission}</div>}
          {vue.dateSecondaire && <div className="doc-a4__gris">{vue.dateSecondaire.libelle} {vue.dateSecondaire.valeur}</div>}
        </div>
      </div>
      <hr className="doc-a4__filet" />
    </>
  );
}

function Ligne({ l, afficherTva, afficherDescription }: { l: LigneClient; afficherTva: boolean; afficherDescription: boolean }) {
  return (
    <tr data-cle={l.cle} data-niveau={l.niveau} data-entete-ouvrage={l.enTeteOuvrage}>
      <td>
        {l.designation}
        {afficherDescription && l.description && <div className="doc-a4__description">{l.description}</div>}
        {l.mentionTva && <div className="doc-a4__description">{l.mentionTva}</div>}
      </td>
      <td>{l.quantite !== null ? `${quantiteFr(l.quantite)} ${l.unite ?? ""}`.trim() : ""}</td>
      <td>{l.prixUnitaireHt !== null ? euros(l.prixUnitaireHt) : ""}{l.remisePct ? <div className="doc-a4__description">−{tauxFr(l.remisePct)}</div> : null}</td>
      {afficherTva && <td>{l.tauxTva !== null ? tauxFr(l.tauxTva) : l.mentionTva ? "multiple" : ""}</td>}
      <td>{l.totalHt !== null ? euros(l.totalHt) : ""}</td>
    </tr>
  );
}

function Tableau({ vue, bloc }: { vue: VueDocument; bloc: Extract<BlocPage, { type: "tableau" }> }) {
  const tva = vue.style.afficherTvaLignes;
  return (
    <>
      {bloc.suite && <div className="doc-a4__suite">Suite du détail</div>}
      <table className="doc-a4__tableau">
        <thead>
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>PU HT</th>
            {tva && <th>TVA</th>}
            <th>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {bloc.lignes.map((l) => <Ligne key={l.cle} l={l} afficherTva={tva} afficherDescription={vue.style.afficherDescriptions} />)}
        </tbody>
      </table>
    </>
  );
}

function Totaux({ vue, apercu }: { vue: VueDocument; apercu: boolean }) {
  const t = vue.totaux;
  const a = vue.totauxAffiches;
  return (
    <div className="doc-a4__totaux">
      <table>
        <tbody>
          {t.remiseGlobaleHt !== 0 && (
            <>
              <tr><td className="doc-a4__gris">Sous-total HT</td><td>{euros(t.sousTotalHt)}</td></tr>
              <tr><td className="doc-a4__gris">Remise globale ({tauxFr(vue.remiseGlobalePct)})</td><td>−{euros(t.remiseGlobaleHt)}</td></tr>
            </>
          )}
          <tr data-total="ht"><td className="doc-a4__gris">Total HT</td><td>{euros(a.totalHt)}</td></tr>
          {t.ventilation.length > 1 && t.ventilation.map((v) => (
            <tr key={v.tauxTva} data-total="tva-taux">
              <td className="doc-a4__gris">TVA {tauxFr(v.tauxTva)} sur {euros(v.baseHt)}</td><td>{euros(v.montantTva)}</td>
            </tr>
          ))}
          <tr data-total="tva"><td className="doc-a4__gris">{t.ventilation.length === 1 ? `TVA ${tauxFr(t.ventilation[0].tauxTva)}` : "Total TVA"}</td><td>{euros(a.totalTva)}</td></tr>
          <tr data-total="ttc"><td>Total TTC</td><td>{euros(a.totalTtc)}</td></tr>
        </tbody>
      </table>
      {apercu && vue.ecartTotaux && <div className="doc-a4__ecart" role="alert">{vue.ecartTotaux}</div>}
    </div>
  );
}

function Bloc({ vue, bloc, apercu }: { vue: VueDocument; bloc: BlocPage; apercu: boolean }) {
  switch (bloc.type) {
    case "entete":
      return <Entete vue={vue} />;
    case "rappel":
      return <div className="doc-a4__rappel">{vue.emetteur.nom} — {vue.titre} {vue.numero} (suite)</div>;
    case "destinataire": {
      const d = vue.destinataire;
      const adresse = [d.adresse, [d.codePostal, d.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
      return (
        <div className="doc-a4__destinataire">
          <div className="doc-a4__etiquette">{vue.typeDocument === "facture" ? "Facturé à" : "Destinataire"}</div>
          <div style={{ fontWeight: 600 }}>{d.nomAffiche}</div>
          {adresse && <div className="doc-a4__gris">{adresse}</div>}
          {d.siret && <div className="doc-a4__gris">SIRET {d.siret}</div>}
        </div>
      );
    }
    case "tableau":
      return <Tableau vue={vue} bloc={bloc} />;
    case "totaux":
      return <Totaux vue={vue} apercu={apercu} />;
    case "conditions":
      return <div className="doc-a4__texte"><div className="doc-a4__etiquette">Conditions</div>{vue.conditions}</div>;
    case "notes":
      return <div className="doc-a4__texte"><div className="doc-a4__etiquette">Notes</div>{vue.notes}</div>;
    case "bon_pour_accord":
      return (
        <div className="doc-a4__accord">
          <div>Date :</div>
          <div>Signature du client, précédée de la mention « Bon pour accord »</div>
        </div>
      );
    case "mentions":
      return (
        <div className="doc-a4__mentions">
          {vue.mentions.map((m, i) => <div key={i}>{m}</div>)}
          <div>{vue.piedProduit}</div>
        </div>
      );
  }
}

export function DocumentA4({
  vue,
  pages = paginer(vue),
  mode = "impression",
}: {
  vue: VueDocument;
  pages?: PageDocument[];
  mode?: "apercu" | "impression";
}) {
  const apercu = mode === "apercu";
  return (
    <div
      className={`doc-a4 doc-a4--${mode}`}
      data-moteur={vue.moteurVersion}
      data-pages={pages.length}
      data-mise-en-page={vue.style.miseEnPage}
      data-filigrane={descriptionAccessible(vue.filigrane) ?? ""}
      role="document"
      aria-label={vue.resumeAccessible}
      style={{
        ["--doc-couleur" as string]: vue.style.couleur,
        ["--doc-accent" as string]: vue.style.couleurSecondaire,
        ["--doc-taille" as string]: `${vue.style.taillePolice}px`,
        fontFamily: POLICES[vue.style.police],
        fontSize: `${vue.style.taillePolice}px`,
      }}
    >
      <style>{CSS}</style>
      {pages.map((p) => (
        <section key={p.numero} className="doc-a4__page" data-page={p.numero} data-debordement={p.debordement} aria-label={`Page ${p.numero} sur ${p.total}`}>
          {(vue.filigrane.pages === "toutes" || p.numero === 1) && <Filigrane f={vue.filigrane} logoUrl={vue.emetteur.logoUrl} />}
          <div className="doc-a4__contenu">
            {p.blocs.map((b, i) => <Bloc key={`${b.type}-${i}`} vue={vue} bloc={b} apercu={apercu} />)}
          </div>
          <footer className="doc-a4__pied">
            <span>{vue.emetteur.nom} · {vue.titre} {vue.numero}</span>
            <span>Page {p.numero} / {p.total}</span>
          </footer>
        </section>
      ))}
    </div>
  );
}
