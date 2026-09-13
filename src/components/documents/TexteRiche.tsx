import { analyserTexteRiche, styleSegment } from "@/lib/texte-riche";

/**
 * Rend un texte riche (format interne `[b] [i] [u] [h] [c=…]`) en nœuds React : uniquement des `<span>`
 * portant des styles calculés par `styleSegment`. Aucun HTML n'est interprété — même rendu dans la vue
 * lecture, l'aperçu A4, la page d'impression, le PDF (Chromium) et la pièce jointe e-mail.
 */
export function TexteRiche({ texte }: { texte: string | null | undefined }) {
  const segments = analyserTexteRiche(texte);
  if (!segments.length) return null;
  return (
    <>
      {segments.map((s, i) => {
        const style = styleSegment(s);
        return Object.keys(style).length ? <span key={i} style={style}>{s.texte}</span> : <span key={i}>{s.texte}</span>;
      })}
    </>
  );
}
