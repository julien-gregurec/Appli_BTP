type DocumentTemplateId =
  | "classique"
  | "moderne"
  | "elegante"
  | "technique"
  | "compacte"
  | "epuree";

type Props = {
  modele: DocumentTemplateId;
  couleurPrincipale?: string | null;
  couleurAccent?: string | null;
};

const lignes = ["Cloison amovible", "Panneau décoratif", "Pose et finitions"];

function LogoMiniature({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      className={`grid h-7 w-8 place-items-center rounded text-[8px] font-black tracking-tight ${inverse ? "bg-white text-[#0d1b2a]" : "bg-[#0d1b2a] text-white"}`}
    >
      LG
    </span>
  );
}

function TableauMiniature({
  dense = false,
  alterne = false,
  enteteSombre = false,
  principale,
}: {
  dense?: boolean;
  alterne?: boolean;
  enteteSombre?: boolean;
  principale: string;
}) {
  return (
    <div className="overflow-hidden rounded-[3px] border border-slate-200">
      <div
        className={`grid grid-cols-[1fr_26px_34px] gap-1 px-1.5 py-1 text-[5px] font-bold uppercase tracking-wide ${enteteSombre ? "text-white" : "text-slate-600"}`}
        style={{ backgroundColor: enteteSombre ? principale : "#e2e8f0" }}
      >
        <span>Désignation</span><span>Qté</span><span>HT</span>
      </div>
      {lignes.slice(0, dense ? 3 : 2).map((ligne, index) => (
        <div
          key={ligne}
          className={`grid grid-cols-[1fr_26px_34px] gap-1 border-t border-slate-100 px-1.5 text-[5px] text-slate-600 ${dense ? "py-[2px]" : "py-1"} ${alterne && index % 2 ? "bg-slate-100" : "bg-white"}`}
        >
          <span className="truncate">{ligne}</span><span>1</span><span>{index ? "420 €" : "850 €"}</span>
        </div>
      ))}
    </div>
  );
}

export function DocumentTemplatePreview({ modele, couleurPrincipale, couleurAccent }: Props) {
  const principale = couleurPrincipale || "#0d1b2a";
  const accent = couleurAccent || "#c9a24a";
  const commun = "h-32 overflow-hidden rounded-md border border-slate-300 bg-white text-slate-800 shadow-sm";

  if (modele === "moderne") {
    return (
      <div className={commun} aria-hidden="true">
        <div className="flex h-10 items-center justify-between px-3" style={{ backgroundColor: principale }}>
          <div className="flex items-center gap-2"><LogoMiniature inverse /><span className="text-[6px] font-semibold text-white">VOTRE ENTREPRISE</span></div>
          <div className="text-right text-white"><p className="text-[8px] font-black">DEVIS</p><p className="text-[5px] opacity-75">N° 2026-0042</p></div>
        </div>
        <div className="h-1" style={{ backgroundColor: accent }} />
        <div className="space-y-2 p-2.5">
          <div className="flex justify-between text-[5px]"><span className="font-bold" style={{ color: principale }}>PROJET D’AMÉNAGEMENT</span><span className="text-slate-500">Client Exemple</span></div>
          <TableauMiniature enteteSombre principale={principale} />
          <div className="ml-auto h-2 w-14 rounded-sm" style={{ backgroundColor: accent }} />
        </div>
      </div>
    );
  }

  if (modele === "elegante") {
    return (
      <div className={`${commun} p-2.5`} aria-hidden="true">
        <div className="flex items-center gap-2"><span className="h-px flex-1" style={{ backgroundColor: accent }} /><LogoMiniature /><span className="h-px flex-1" style={{ backgroundColor: accent }} /></div>
        <div className="mt-1 text-center"><p className="text-[7px] font-semibold tracking-[0.2em]">DEVIS</p><p className="text-[5px] text-slate-400">AMÉNAGEMENT INTÉRIEUR</p></div>
        <div className="my-2 flex justify-between border-y border-slate-200 py-1 text-[5px] text-slate-500"><span>Votre entreprise</span><span>Client Exemple</span></div>
        <TableauMiniature principale={principale} />
        <p className="mt-1 text-right text-[6px] font-bold" style={{ color: accent }}>TOTAL 1 524,00 €</p>
      </div>
    );
  }

  if (modele === "technique") {
    return (
      <div className={`${commun} p-2.5`} aria-hidden="true">
        <div className="flex items-start justify-between border-b-2 pb-1.5" style={{ borderColor: principale }}>
          <div className="flex items-center gap-1.5"><LogoMiniature /><div><p className="text-[6px] font-bold">VOTRE ENTREPRISE</p><p className="text-[4px] text-slate-400">SIRET · ASSURANCE</p></div></div>
          <div className="rounded-sm bg-slate-100 px-2 py-1 text-right"><p className="text-[7px] font-black">DEVIS</p><p className="text-[4px]">N° 2026-0042</p></div>
        </div>
        <div className="my-1.5 grid grid-cols-2 gap-1 text-[5px]"><div className="rounded bg-slate-100 p-1">CHANTIER<br/><b>Projet Exemple</b></div><div className="rounded bg-slate-100 p-1">CLIENT<br/><b>Client Exemple</b></div></div>
        <TableauMiniature dense alterne enteteSombre principale={principale} />
        <div className="mt-1 flex justify-end gap-1"><span className="h-2 w-8 bg-slate-200"/><span className="h-2 w-10" style={{ backgroundColor: accent }}/></div>
      </div>
    );
  }

  if (modele === "compacte") {
    return (
      <div className={`${commun} p-2`} aria-hidden="true">
        <div className="flex items-center justify-between border-b pb-1"><div className="flex items-center gap-1"><LogoMiniature /><span className="text-[5px] font-bold">VOTRE ENTREPRISE</span></div><div className="text-right"><b className="text-[7px]">DEVIS</b><p className="text-[4px] text-slate-400">16/07/2026</p></div></div>
        <div className="my-1 grid grid-cols-2 gap-1 text-[4px] text-slate-500"><span>Client : <b className="text-slate-700">Client Exemple</b></span><span>Chantier : <b className="text-slate-700">Projet 13</b></span></div>
        <TableauMiniature dense enteteSombre principale={principale} />
        <div className="mt-1 grid grid-cols-[1fr_56px] gap-1"><div className="text-[4px] text-slate-400">Conditions et mentions légales</div><div className="rounded-sm p-1 text-[5px] font-bold text-white" style={{ backgroundColor: principale }}>TOTAL 1 524 €</div></div>
      </div>
    );
  }

  if (modele === "epuree") {
    return (
      <div className={`${commun} p-3`} aria-hidden="true">
        <div className="flex items-start justify-between"><LogoMiniature /><div className="text-right"><p className="text-[9px] font-light tracking-[0.18em]">DEVIS</p><p className="text-[5px] text-slate-400">N° 2026-0042</p></div></div>
        <div className="my-3 flex gap-2"><span className="w-0.5" style={{ backgroundColor: accent }} /><div className="text-[5px] text-slate-400"><b className="text-slate-700">Client Exemple</b><br/>Projet d’aménagement intérieur</div></div>
        <div className="space-y-1.5">{lignes.slice(0,2).map((ligne,index)=><div key={ligne} className="flex justify-between border-b border-slate-100 pb-1 text-[5px]"><span>{ligne}</span><span>{index ? "420 €" : "850 €"}</span></div>)}</div>
        <div className="mt-2 flex justify-end"><span className="border-t pt-1 text-[6px] font-semibold" style={{ borderColor: accent }}>TOTAL TTC · 1 524,00 €</span></div>
      </div>
    );
  }

  return (
    <div className={`${commun} p-2.5`} aria-hidden="true">
      <div className="flex items-start justify-between"><div className="flex items-center gap-2"><LogoMiniature /><div><p className="text-[6px] font-bold">VOTRE ENTREPRISE</p><p className="text-[4px] text-slate-400">Coordonnées · SIRET</p></div></div><div className="text-right"><p className="text-[8px] font-black">DEVIS</p><p className="text-[5px] text-slate-400">N° 2026-0042</p></div></div>
      <div className="my-2 rounded-sm border-l-2 bg-slate-50 p-1 text-[5px]" style={{ borderColor: accent }}><b>Client Exemple</b><br/><span className="text-slate-400">Projet d’aménagement intérieur</span></div>
      <TableauMiniature principale={principale} />
      <div className="mt-1 flex justify-between text-[4px] text-slate-400"><span>Validité : 30 jours</span><b className="text-[6px] text-slate-800">TOTAL 1 524,00 €</b></div>
    </div>
  );
}
