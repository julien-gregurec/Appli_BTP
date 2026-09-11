// Entrée du banc de la bibliothèque d'articles — données FICTIVES, actions remplacées par des boutons
// inertes (les vraies sont des Server Actions rendues côté serveur).
import { createRoot } from "react-dom/client";
import { BlocPrixArticle } from "@/components/prestations/BlocPrixArticle";
import { TableCataloguePrestations, type LignePrestationV2 } from "@/components/prestations/TableCataloguePrestations";

const etoile = (favori: boolean, designation: string) => (
  <button type="button" className="min-h-11 min-w-11 text-lg text-amber-500" aria-label={favori ? `Retirer « ${designation} » des favoris` : `Ajouter « ${designation} » aux favoris`}>
    {favori ? "★" : "☆"}
  </button>
);
const actions = (
  <div className="flex flex-wrap items-center gap-3 md:justify-end">
    <a href="#modifier" className="inline-flex min-h-11 items-center hover:underline">Modifier</a>
    <button type="button" className="min-h-11 text-neutral-500 hover:underline">Archiver</button>
  </div>
);

const ligne = (p: Omit<LignePrestationV2, "favoriBouton" | "actions">): LignePrestationV2 => ({
  ...p, favoriBouton: etoile(p.favori, p.designation), actions,
});

const lignes: LignePrestationV2[] = [
  ligne({ id: "1", designation: "Plaque de plâtre BA13 standard (fictif)", description: "2 500 × 1 200 mm", referenceInterne: "ART-00012", referenceFabricant: "PLACO-4521", fabricant: "Fabricant fictif", codeFournisseur: "DIS-9001", familleId: "f-pq", famille: "Plâtrerie › Plaques", favori: true, type: "Fourniture", prix: "20,00 € / m²", tva: "20 %", actif: true }),
  ligne({ id: "2", designation: "Plaque BA13 hydrofuge (fictif)", description: null, referenceInterne: "ART-00013", referenceFabricant: "PLACO-4522", fabricant: "Fabricant fictif", codeFournisseur: "DIS-9002", familleId: "f-pq", famille: "Plâtrerie › Plaques", favori: false, type: "Fourniture", prix: "24,00 € / m²", tva: "20 %", actif: true }),
  ligne({ id: "3", designation: "Rail métallique 48 (fictif)", description: null, referenceInterne: "ART-00020", referenceFabricant: "RAIL-48", fabricant: null, codeFournisseur: null, familleId: "f-os", famille: "Plâtrerie › Ossature", favori: false, type: "Fourniture", prix: "3,10 € / ml", tva: "20 %", actif: true }),
  ligne({ id: "4", designation: "Pose de cloison sèche (fictif)", description: "Main-d’œuvre, hors fournitures", referenceInterne: "PRS-0004", referenceFabricant: null, fabricant: null, codeFournisseur: null, familleId: "f-pl", famille: "Plâtrerie", favori: true, type: "Main-d’œuvre", prix: "38,00 € / h", tva: "10 %", actif: true }),
  ligne({ id: "5", designation: "Porte isoplane 83 (fictif)", description: null, referenceInterne: "ART-00031", referenceFabricant: "PI-83", fabricant: "Autre fabricant fictif", codeFournisseur: "PT-77", familleId: "f-me", famille: "Menuiserie", favori: false, type: "Fourniture", prix: "96,00 € / u", tva: "20 %", actif: true }),
  ligne({ id: "6", designation: "Ancien carreau 30 × 30 (fictif)", description: null, referenceInterne: null, referenceFabricant: null, fabricant: null, codeFournisseur: null, familleId: null, famille: "Carrelage", favori: false, type: "Fourniture", prix: "18,50 € / m²", tva: "20 %", actif: false }),
];

function Section({ id, titre, children }: { id: string; titre: string; children: React.ReactNode }) {
  return (
    <section data-banc={id} aria-labelledby={`${id}-titre`} className="space-y-3">
      <h2 id={`${id}-titre`} className="text-base font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

function Banc() {
  return (
    <main className="mx-auto max-w-7xl space-y-10 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">Banc — bibliothèque d’articles V1 (données fictives)</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <Section id="prix-edition" titre="Prix — gestionnaire des coûts (mode calculé)">
          <form><BlocPrixArticle prixVenteInitial={20} cout="edition" prixAchatInitial={12.5} coefficientInitial={1.6} modeInitial="calcule" /></form>
        </Section>
        <Section id="prix-lecture" titre="Prix — lecture des coûts seulement">
          <form><BlocPrixArticle prixVenteInitial={19.9} cout="lecture" prixAchatInitial={12.5} coefficientInitial={1.35} modeInitial="saisi" /></form>
        </Section>
        <Section id="prix-absent" titre="Prix — sans droit sur les coûts">
          <form><BlocPrixArticle prixVenteInitial={19.9} cout="absent" prixAchatInitial={null} coefficientInitial={null} modeInitial="saisi" /></form>
        </Section>
      </div>
      <Section id="catalogue" titre="Liste du catalogue">
        <TableCataloguePrestations lignes={lignes} />
      </Section>
    </main>
  );
}

createRoot(document.getElementById("racine")!).render(<Banc />);
