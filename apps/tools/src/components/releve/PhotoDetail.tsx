"use client";

import { useMemo, useState } from "react";
import {
  addRepere, annotationDraftOf, describeAnchor, MediaRemoteError, moveRepere, newUuid, removeRepere, ReleveConflictError, sortReperes,
  translateAnnotationDraft, VERSION_TYPES,
  type PhotoAnnotationCouleur, type PhotoAnnotationDraft, type PhotoEntry, type PhotoLibrary, type PhotoMedia, type PhotoTarget, type ReleveElement,
  type ReleveMediaService, type VersionType,
} from "@elsatia/releve-domain";
import { AutoSelect, AutoText, SaveStatus, useAutosave } from "./autosave-ui";
import { PhotoTargetPicker, targetOptions } from "./PhotoTargetPicker";
import styles from "./photos.module.css";

type Tool = "aucun" | "repere" | "texte" | "fleche" | "cercle" | "deplacer";
const ETAT_LABELS: Record<VersionType, string> = { initial: "Existant", corrige: "Corrigé", projete: "Projeté", as_built: "Tel que construit" };
const FORME_LABELS = { texte: "Texte", fleche: "Flèche", cercle: "Cercle" } as const;
const TOOLS: Array<{ tool: Tool; label: string }> = [
  { tool: "aucun", label: "Voir" }, { tool: "repere", label: "Repère" }, { tool: "texte", label: "Texte" }, { tool: "fleche", label: "Flèche" }, { tool: "cercle", label: "Cercle" },
];
const COLORS: Record<PhotoAnnotationCouleur, string> = { rouge: "#e0322b", jaune: "#f5aa22", bleu: "#1f6feb", blanc: "#ffffff" };
const HINTS: Record<Tool, string> = {
  aucun: "",
  repere: "Touchez l'image à l'endroit du repère.",
  texte: "Touchez l'image où placer le texte.",
  fleche: "Touchez l'origine puis la pointe de la flèche.",
  cercle: "Touchez le centre puis le bord du cercle.",
  deplacer: "Touchez la nouvelle position de l'annotation.",
};
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const kb = (bytes: number | null | undefined) => (bytes ? `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 2)} Mo` : "—");

type Point = { x: number; y: number };

export function PhotoDetail({ entry, url, library, service, canEdit, canRemoveFile, busy, run, onReplace, onClose, onChanged, versionLabel, sourceLabel }: {
  entry: PhotoEntry; url: string | null; library: PhotoLibrary; service: ReleveMediaService; canEdit: boolean; canRemoveFile: boolean; busy: boolean;
  run(action: () => Promise<unknown>, message: string): Promise<void>; onReplace(): void; onClose(): void; onChanged(): Promise<void>;
  versionLabel: string; sourceLabel: string;
}) {
  const { media } = entry;
  const releve = library.structure.releve;
  const anchor = entry.anchors[0] ?? null;
  const [tool, setTool] = useState<Tool>("aucun");
  const [color, setColor] = useState<PhotoAnnotationCouleur>("rouge");
  const [start, setStart] = useState<Point | null>(null);
  const [pending, setPending] = useState<Point | null>(null);
  const [label, setLabel] = useState("");
  const [cible, setCible] = useState("");
  const [size, setSize] = useState<{ w: number; h: number }>({ w: Number(media.metadata.largeurPx) || 4, h: Number(media.metadata.hauteurPx) || 3 });
  const [attachTarget, setAttachTarget] = useState<PhotoTarget | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editColor, setEditColor] = useState<PhotoAnnotationCouleur>("rouge");
  const edited = entry.annotations.find((item) => item.id === editing) ?? null;
  const viewH = (1000 * size.h) / size.w;
  const reperes = useMemo(() => sortReperes(anchor?.donnees.reperes ?? []), [anchor]);
  const cibles = useMemo(() => (["piece", "mur", "equipement", "zone", "etage"] as const).flatMap((kind) => targetOptions(kind, library.structure, library.targets).map((option) => ({ ...option, kind: kind === "mur" || kind === "equipement" ? "element" as const : kind }))), [library]);

  function point(event: React.MouseEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  }

  function annotate(draft: PhotoAnnotationDraft, message: string) {
    if (!anchor) return;
    void run(() => service.annotate(releve, anchor, draft), message);
    setStart(null); setPending(null); setLabel("");
  }

  function startEdit(annotation: ReleveElement<"annotation">) {
    const current = annotationDraftOf(annotation);
    setEditing(annotation.id); setEditText(annotation.donnees.texte); setEditColor(current?.couleur ?? "rouge");
  }

  function saveEdit(patch: Partial<PhotoAnnotationDraft>, message: string) {
    if (!anchor || !edited) return;
    void run(() => service.updateAnnotation(releve, anchor, edited, patch), message);
  }

  function onCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!canEdit || tool === "aucun" || !anchor) return;
    const p = point(event);
    if (tool === "deplacer") {
      const current = edited ? annotationDraftOf(edited) : null;
      if (!current) return;
      const origin = current.forme === "texte" ? { x: current.x, y: current.y } : current.forme === "fleche" ? { x: current.x1, y: current.y1 } : { x: current.cx, y: current.cy };
      saveEdit(translateAnnotationDraft(current, p.x - origin.x, p.y - origin.y), "Annotation déplacée.");
      setTool("aucun");
      return;
    }
    if (tool === "repere" || tool === "texte") { setPending(p); return; }
    if (!start) { setStart(p); return; }
    if (tool === "fleche") annotate({ forme: "fleche", x1: start.x, y1: start.y, x2: p.x, y2: p.y, couleur: color, texte: "" }, "Flèche ajoutée.");
    else {
      const r = Math.hypot((p.x - start.x) * size.w, (p.y - start.y) * size.h) / Math.min(size.w, size.h);
      annotate({ forme: "cercle", cx: start.x, cy: start.y, r, couleur: color, texte: "" }, "Cercle ajouté.");
    }
  }

  function submitPending(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !anchor || !label.trim()) return;
    if (tool === "texte") return annotate({ forme: "texte", x: pending.x, y: pending.y, texte: label, couleur: color }, "Texte ajouté.");
    const target = cibles.find((option) => option.id === cible);
    const next = addRepere(reperes, { ...pending, label, cible: target ? { kind: target.kind, id: target.id } : null }, newUuid());
    void run(() => service.saveReperes(releve, anchor, next), "Repère ajouté.");
    setPending(null); setLabel(""); setCible("");
  }

  const stroke = 6;
  const minSide = Math.min(1000, viewH);
  return <section className={styles.detail} aria-label="Photo sélectionnée">
    <div className={styles.detailHead}>
      <h2>{media.commentaire || anchor?.donnees.legende || media.nomFichier || "Photo"}</h2>
      <button type="button" className={styles.ghost} onClick={onClose}>Fermer</button>
    </div>
    {canEdit && anchor && <div className={styles.tools} role="toolbar" aria-label="Outils d'annotation">
      {TOOLS.map(({ tool: value, label: text }) => <button key={value} type="button" aria-pressed={tool === value} className={styles.tool} onClick={() => { setTool(value); setStart(null); setPending(null); }}>{text}</button>)}
      <label className={styles.colorField}><span className="sr-only">Couleur</span>
        <select aria-label="Couleur" value={color} onChange={(event) => setColor(event.target.value as PhotoAnnotationCouleur)}>
          {Object.keys(COLORS).map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
    </div>}
    {tool !== "aucun" && <p className={styles.hint} role="status">{start ? "Touchez le second point." : HINTS[tool]}</p>}

    <div className={styles.stage}>
      {url ? <>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL signée courte d'un bucket privé : pas d'optimiseur d'images. */}
        <img src={url} alt={media.commentaire || anchor?.donnees.legende || "Photo de terrain"} className={styles.stageImage} onLoad={(event) => setSize({ w: event.currentTarget.naturalWidth || size.w, h: event.currentTarget.naturalHeight || size.h })} />
        <svg className={styles.overlay} viewBox={`0 0 1000 ${viewH}`} preserveAspectRatio="none" onClick={onCanvasClick} data-testid="photo-overlay" data-tool={tool}>
          <defs><marker id="fleche" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker></defs>
          {entry.annotations.map((annotation) => <AnnotationShape key={annotation.id} annotation={annotation} viewH={viewH} minSide={minSide} stroke={stroke} selected={annotation.id === editing} />)}
          {reperes.map((repere) => <g key={repere.id} data-testid="repere">
            <circle cx={repere.x * 1000} cy={repere.y * viewH} r={18} fill="#0f2430" stroke="#f5aa22" strokeWidth={4} />
            <text x={repere.x * 1000} y={repere.y * viewH + 7} textAnchor="middle" fontSize={22} fontWeight={800} fill="#fff">{repere.ordre + 1}</text>
          </g>)}
          {start && <circle cx={start.x * 1000} cy={start.y * viewH} r={8} fill={COLORS[color]} />}
          {pending && <circle cx={pending.x * 1000} cy={pending.y * viewH} r={10} fill="none" stroke={COLORS[color]} strokeWidth={4} />}
        </svg>
      </> : <p className={styles.placeholder}>Chargement de l’image…</p>}
    </div>

    {pending && (tool === "repere" || tool === "texte") && <form className={styles.inlineForm} onSubmit={submitPending}>
      <label className={styles.field}><span>{tool === "repere" ? "Libellé du repère" : "Texte"}</span>
        <input value={label} maxLength={tool === "repere" ? 120 : 2000} onChange={(event) => setLabel(event.target.value)} autoFocus /></label>
      {tool === "repere" && <label className={styles.field}><span>Objet désigné (facultatif)</span>
        <select value={cible} onChange={(event) => setCible(event.target.value)}><option value="">Aucun</option>
          {cibles.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
      <button className={styles.primary} type="submit" disabled={!label.trim() || busy}>Ajouter</button>
      <button className={styles.ghost} type="button" onClick={() => setPending(null)}>Annuler</button>
    </form>}

    <div className={styles.detailGrid}>
      <section aria-label="Repères">
        <h3>Repères ({reperes.length})</h3>
        {reperes.length === 0 && <p className={styles.muted}>Aucun repère. Les repères préparent le recalage sur le plan.</p>}
        <ol className={styles.list}>{reperes.map((repere, index) => <li key={repere.id}>
          <span><strong>{repere.ordre + 1}. {repere.label}</strong> <small>{Math.round(repere.x * 100)} %, {Math.round(repere.y * 100)} %{repere.cible ? ` · ${cibles.find((option) => option.id === repere.cible?.id)?.label ?? "objet retiré"}` : ""}</small></span>
          {canEdit && anchor && <span className={styles.rowActions}>
            <button type="button" className={styles.icon} aria-label={`Monter ${repere.label}`} disabled={index === 0 || busy} onClick={() => void run(() => service.saveReperes(releve, anchor, moveRepere(reperes, repere.id, -1)), "Ordre modifié.")}>↑</button>
            <button type="button" className={styles.icon} aria-label={`Descendre ${repere.label}`} disabled={index === reperes.length - 1 || busy} onClick={() => void run(() => service.saveReperes(releve, anchor, moveRepere(reperes, repere.id, 1)), "Ordre modifié.")}>↓</button>
            <button type="button" className={styles.icon} aria-label={`Retirer le repère ${repere.label}`} disabled={busy} onClick={() => void run(() => service.saveReperes(releve, anchor, removeRepere(reperes, repere.id)), "Repère retiré.")}>×</button>
          </span>}
        </li>)}</ol>
        <h3>Annotations ({entry.annotations.length})</h3>
        <p className={styles.muted}>Dessinées par-dessus la photo : l’image d’origine n’est jamais modifiée.</p>
        <ul className={styles.list}>{entry.annotations.map((annotation) => <li key={annotation.id} data-testid="annotation-item">
          <span>{FORME_LABELS[(annotation.donnees.forme ?? "texte") as keyof typeof FORME_LABELS] ?? "Annotation"}{annotation.donnees.texte ? ` « ${annotation.donnees.texte} »` : ""}</span>
          {canEdit && <span className={styles.rowActions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => (editing === annotation.id ? setEditing(null) : startEdit(annotation))}>{editing === annotation.id ? "Fermer" : "Modifier"}</button>
            <button type="button" className={styles.icon} aria-label="Retirer l'annotation" disabled={busy} onClick={() => {
              if (window.confirm("Retirer cette annotation ?")) void run(() => service.removeAnnotation(releve, annotation), "Annotation retirée.");
            }}>×</button>
          </span>}
        </li>)}</ul>
        {canEdit && edited && <form className={styles.inlineForm} aria-label="Modifier l'annotation" onSubmit={(event) => {
          event.preventDefault();
          saveEdit({ texte: editText, couleur: editColor }, "Annotation modifiée.");
        }}>
          <label className={styles.field}><span>Texte{edited.donnees.forme === "texte" ? "" : " (facultatif)"}</span>
            <input value={editText} maxLength={2000} onChange={(event) => setEditText(event.target.value)} /></label>
          <label className={styles.field}><span>Couleur</span>
            <select value={editColor} onChange={(event) => setEditColor(event.target.value as PhotoAnnotationCouleur)}>
              {Object.keys(COLORS).map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
          <button className={styles.primary} type="submit" disabled={busy || (edited.donnees.forme === "texte" && !editText.trim())}>Enregistrer</button>
          <button className={styles.secondary} type="button" onClick={() => { setTool("deplacer"); setStart(null); setPending(null); }}>Déplacer</button>
        </form>}
      </section>

      <section aria-label="Métadonnées et rattachements">
        {canEdit ? <MediaFields key={`${media.id}:${media.revision}`} media={media} releve={releve} service={service} onChanged={onChanged} />
          : <dl className={styles.facts}>
            <div><dt>Commentaire</dt><dd>{media.commentaire ?? "—"}</dd></div>
            <div><dt>État documenté</dt><dd>{ETAT_LABELS[media.etatDocumente]}</dd></div>
          </dl>}
        <h3>Preuve</h3>
        <dl className={styles.facts}>
          <div><dt>Prise de vue</dt><dd>{media.metadata.priseLe ? dateFormat.format(new Date(media.metadata.priseLe)) : "Inconnue"}{media.metadata.priseLeSource ? ` (${media.metadata.priseLeSource === "exif" ? "EXIF" : media.metadata.priseLeSource === "capture" ? "horloge de capture" : "date du fichier"})` : ""}</dd></div>
          <div><dt>Déposée le</dt><dd>{dateFormat.format(new Date(media.createdAt))}</dd></div>
          <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
          <div><dt>Version de référence</dt><dd>{versionLabel}</dd></div>
          <div><dt>Dimensions</dt><dd>{media.metadata.largeurPx ?? "?"} × {media.metadata.hauteurPx ?? "?"} px · {media.metadata.orientation ?? ""}</dd></div>
          <div><dt>Poids</dt><dd>{kb(media.tailleOctets)} (origine {kb(media.metadata.tailleOrigineOctets)})</dd></div>
          <div><dt>Localisation</dt><dd>{media.metadata.gpsRetire ? "GPS d’origine retiré" : "Aucune"}</dd></div>
          <div><dt>Empreinte</dt><dd className={styles.mono}>{media.metadata.empreinteSha256 ? `${media.metadata.empreinteSha256.slice(0, 16)}…` : "—"}</dd></div>
        </dl>
        <h3>Rattachements</h3>
        <ul className={styles.list}>{entry.anchors.map((item) => <li key={item.id}>
          <span>{describeAnchor(item.donnees.ancre, library.structure, library.elements)}</span>
          {canEdit && entry.anchors.length > 1 && <button type="button" className={styles.icon} aria-label="Retirer ce rattachement" disabled={busy} onClick={() => void run(() => service.detach(releve, item, library.elements), "Rattachement retiré.")}>×</button>}
        </li>)}</ul>
        {canEdit && (attachTarget
          ? <div className={styles.inlineForm}>
              <PhotoTargetPicker idPrefix="attach" structure={library.structure} targets={library.targets} value={attachTarget} onChange={setAttachTarget} />
              <button type="button" className={styles.primary} disabled={busy} onClick={() => { void run(() => service.attach(library.structure, library.elements, media, attachTarget), "Rattachement ajouté."); setAttachTarget(null); }}>Rattacher</button>
              <button type="button" className={styles.ghost} onClick={() => setAttachTarget(null)}>Annuler</button>
            </div>
          : <button type="button" className={styles.secondary} onClick={() => setAttachTarget({ kind: "releve" })}>Ajouter un rattachement</button>)}
        {canEdit && <div className={styles.dangerZone}>
          <button type="button" className={styles.secondary} disabled={busy} onClick={onReplace}>Remplacer la photo</button>
          <button type="button" className={styles.danger} disabled={busy} onClick={() => {
            if (!window.confirm(canRemoveFile ? "Supprimer cette photo, ses repères et annotations ? Le fichier sera supprimé (sauf s'il appartient à une version figée)." : "Retirer cette photo ? Le fichier restera conservé jusqu'à sa purge par un responsable du relevé.")) return;
            void run(async () => {
              const result = await service.deletePhoto(releve, media);
              onClose();
              if (result.kept === "version") return { feedback: "Photo retirée. Son fichier est conservé : il appartient à une version figée du relevé." };
              if (result.kept === "droits") return { feedback: "Photo retirée. Son fichier reste conservé jusqu'à sa purge par un responsable du relevé." };
              return undefined;
            }, "Photo supprimée.");
          }}>Supprimer la photo</button>
        </div>}
      </section>
    </div>
  </section>;
}

/** Commentaire et état documenté de la photo : sauvegarde automatique avec contrôle de révision. */
function MediaFields({ media, releve, service, onChanged }: { media: PhotoMedia; releve: PhotoLibrary["structure"]["releve"]; service: ReleveMediaService; onChanged(): Promise<void> }) {
  const api = useAutosave({
    revision: media.revision,
    save: async (patch, revision) => {
      try {
        // L'autosave peut regrouper les deux champs : écritures successives, révision chaînée.
        let current: PhotoMedia = { ...media, revision };
        if ("commentaire" in patch) current = await service.saveCommentaire(releve, current, (patch.commentaire as string | null) ?? null);
        if ("etatDocumente" in patch && patch.etatDocumente) current = await service.saveEtat(releve, current, patch.etatDocumente as VersionType);
        return { revision: current.revision };
      } catch (error) {
        // Même contrat que le Lot 3 : un conflit de révision n'écrase rien, l'utilisateur choisit.
        if (error instanceof MediaRemoteError && error.code === "conflict") throw new ReleveConflictError(revision);
        throw error;
      }
    },
    fetchRevision: async () => (await service.library(releve.id)).photos.find((photo) => photo.media.id === media.id)?.media.revision ?? media.revision,
    onReloaded: () => void onChanged(),
  });
  return <div className={styles.mediaFields}>
    <SaveStatus api={api} label="photo" />
    <AutoText api={api} name="commentaire" label="Commentaire de la photo" value={media.commentaire} multiline maxLength={2000} placeholder="Constat, contexte, point à vérifier…" />
    <AutoSelect<VersionType> api={api} name="etatDocumente" label="État documenté" value={media.etatDocumente} options={VERSION_TYPES.map((value) => ({ value, label: ETAT_LABELS[value] }))} />
  </div>;
}

function AnnotationShape({ annotation, viewH, minSide, stroke, selected }: { annotation: ReleveElement<"annotation">; viewH: number; minSide: number; stroke: number; selected: boolean }) {
  const g = (annotation.donnees.geometrie ?? {}) as Record<string, number | string>;
  const color = COLORS[(g.couleur as PhotoAnnotationCouleur) ?? "rouge"] ?? COLORS.rouge;
  stroke = selected ? stroke * 1.8 : stroke;
  const X = (value: unknown) => Number(value) * 1000; const Y = (value: unknown) => Number(value) * viewH;
  if (annotation.donnees.forme === "fleche") return <line data-testid="annotation-fleche" x1={X(g.x1)} y1={Y(g.y1)} x2={X(g.x2)} y2={Y(g.y2)} stroke={color} strokeWidth={stroke} markerEnd="url(#fleche)" strokeLinecap="round" />;
  if (annotation.donnees.forme === "cercle") return <circle data-testid="annotation-cercle" cx={X(g.cx)} cy={Y(g.cy)} r={Number(g.r) * minSide} fill="none" stroke={color} strokeWidth={stroke} />;
  return <text data-testid="annotation-texte" x={X(g.x)} y={Y(g.y)} fill={color} fontSize={36} fontWeight={800} stroke="#000" strokeWidth={1.5} paintOrder="stroke">{annotation.donnees.texte}</text>;
}
