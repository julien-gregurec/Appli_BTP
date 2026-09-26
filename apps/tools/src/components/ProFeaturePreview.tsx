import type { Capability } from "@/lib/access";

export type ProFeaturePreviewProps = {
  name: string;
  description: string;
  capability: Capability;
  preview?: string;
};

export function ProFeaturePreview({ name, description, preview }: ProFeaturePreviewProps) {
  return <article className="pro-preview-card" aria-label={`${name}, aperçu Tools Pro`}>
    <div className="pro-preview-top"><span>PRO</span><i aria-hidden="true">◇</i></div>
    <strong>{name}</strong>
    <p>{description}</p>
    {preview && <small>{preview}</small>}
    <button type="button" disabled>En savoir plus <span>→</span></button>
  </article>;
}
