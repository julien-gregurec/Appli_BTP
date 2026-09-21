"use client";
import { useState } from "react";
import {
  listStudioTemplates,
  type TemplateOptions,
  type StudioMediaAsset,
  type StudioProject,
} from "@elsatia/studio-domain";
export default function TemplateGallery({
  project,
  assets,
  busy,
  active,
  onGenerate,
  initialTemplate,
}: {
  project: StudioProject;
  assets: StudioMediaAsset[];
  busy: boolean;
  active: boolean;
  onGenerate: (options?: TemplateOptions) => void;
  initialTemplate?: string;
}) {
  const [selected, setSelected] = useState(initialTemplate ?? ""),
    [open, setOpen] = useState(!active),
    [groups, setGroups] = useState<Record<string, string>>({});
  const templates = listStudioTemplates(),
    t = templates.find((t) => t.id === selected);
  return (
    <section aria-label="Styles vidéo">
      {active && (
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => setOpen(!open)}
        >
          Changer de style
        </button>
      )}
      {open && (
        <>
          <h3>Choisissez un style</h3>
          <p>
            Chaque génération crée une nouvelle version. Vos médias et vos
            anciens montages sont conservés.
          </p>
          <div
            className="template-gallery"
            role="group"
            aria-label="Galerie templates"
          >
            {templates.map((style) => (
              <article
                className="template-card"
                key={style.id}
                data-selected={style.id === selected}
              >
                <video
                  src={style.preview}
                  poster={style.thumbnail}
                  controls
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-label={`Démo ${style.name}`}
                />
                <h4>{style.name}</h4>
                <p>{style.description}</p>
                <p>
                  {style.supportedProjectTypes.includes(project.project_type)
                    ? "Recommandé pour ce projet"
                    : "Également disponible"}
                </p>
                <button
                  type="button"
                  aria-pressed={selected === style.id}
                  disabled={busy}
                  onClick={() => setSelected(style.id)}
                >
                  Choisir {style.name}
                </button>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            aria-pressed={!selected}
            onClick={() => setSelected("")}
          >
            Montage libre
          </button>
        </>
      )}
      <form
        aria-label="Préparer le style"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            active &&
            t &&
            !window.confirm(
              "Créer une nouvelle version avec ce style ? Le montage précédent sera conservé.",
            )
          )
            return;
          const f = new FormData(e.currentTarget);
          const opts: TemplateOptions | undefined = t
            ? {
                templateId: t.id,
                templateVersion: t.version,
                title: String(f.get("title") ?? project.name),
                subtitle: String(f.get("subtitle") ?? ""),
                outro: String(f.get("outro") ?? t.outroConfig.text),
                company: String(f.get("company") ?? ""),
                website: String(f.get("website") ?? ""),
                phone: String(f.get("phone") ?? ""),
                logoAssetId: String(f.get("logo") ?? "") || null,
                introDuration: Math.round(Number(f.get("intro")) * 1000),
                outroDuration: Math.round(
                  Number(f.get("outroDuration")) * 1000,
                ),
                beforeIds: assets
                  .filter((a) => groups[a.id] === "before")
                  .map((a) => a.id),
                afterIds: assets
                  .filter((a) => groups[a.id] === "after")
                  .map((a) => a.id),
                chapters: assets
                  .map((a) => ({
                    assetId: a.id,
                    title: String(f.get(`chapter-${a.id}`) ?? ""),
                  }))
                  .filter((c) => c.title.trim()),
              }
            : undefined;
          onGenerate(opts);
        }}
      >
        {t && (
          <fieldset disabled={busy} key={t.id}>
            <legend>
              {t.name} · v{t.version}
            </legend>
            <label>
              Titre
              <input name="title" maxLength={500} defaultValue={project.name} />
            </label>
            <label>
              Lieu, date ou sous-titre
              <input
                name="subtitle"
                maxLength={500}
                defaultValue={[project.location_label, project.started_at]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </label>
            <label>
              Texte de fin
              <input
                name="outro"
                maxLength={500}
                defaultValue={t.outroConfig.text}
              />
            </label>
            <div className="row">
              <label>
                Durée intro (s)
                <input
                  name="intro"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.1"
                  required
                  defaultValue={t.timingRules.introDuration / 1000}
                />
              </label>
              <label>
                Durée outro (s)
                <input
                  name="outroDuration"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.1"
                  required
                  defaultValue={t.timingRules.outroDuration / 1000}
                />
              </label>
            </div>
            {t.brandingConfig.logo && (
              <>
                <label>
                  Entreprise (facultatif)
                  <input name="company" maxLength={150} />
                </label>
                <label>
                  Site (facultatif)
                  <input name="website" maxLength={150} />
                </label>
                <label>
                  Téléphone (facultatif)
                  <input name="phone" maxLength={50} />
                </label>
                <label>
                  Logo temporaire
                  <select name="logo">
                    <option value="">Sans logo</option>
                    {assets
                      .filter((a) =>
                        ["image/png", "image/jpeg"].includes(a.mime_type),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.original_filename}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  Pour ajouter un logo, importez un PNG/JPEG dans les médias du
                  projet.
                </p>
              </>
            )}
            {t.overlayConfig.structure === "before-after" && (
              <fieldset>
                <legend>Classer les médias Avant / Après</legend>
                <p>
                  Classez tous les médias. Chaque groupe doit contenir au moins
                  un média.
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() =>
                      setGroups(
                        Object.fromEntries(assets.map((a) => [a.id, "before"])),
                      )
                    }
                  >
                    Tout marquer Avant
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGroups(
                        Object.fromEntries(assets.map((a) => [a.id, "after"])),
                      )
                    }
                  >
                    Tout marquer Après
                  </button>
                </div>
                {assets.map((a) => (
                  <label key={a.id}>
                    {a.original_filename}
                    <select
                      required
                      aria-label={`Groupe ${a.original_filename}`}
                      value={groups[a.id] ?? ""}
                      onChange={(e) =>
                        setGroups({ ...groups, [a.id]: e.target.value })
                      }
                    >
                      <option value="">À classer</option>
                      <option value="before">Avant</option>
                      <option value="after">Après</option>
                    </select>
                  </label>
                ))}
              </fieldset>
            )}
            {t.overlayConfig.chapters && (
              <details>
                <summary>Chapitres manuels (facultatif)</summary>
                {assets.map((a) => (
                  <label key={a.id}>
                    Chapitre pour {a.original_filename}
                    <input name={`chapter-${a.id}`} maxLength={500} />
                  </label>
                ))}
              </details>
            )}
            {t.overlayConfig.structure === "chronological" && (
              <p>
                Les dates de capture disponibles déterminent l’ordre. Les médias
                sans date fiable restent à la fin, dans l’ordre du projet. Aucun
                lieu n’est inventé.
              </p>
            )}
          </fieldset>
        )}
        <button disabled={busy}>
          {active ? "Régénérer le montage" : "Préparer le montage"}
        </button>
      </form>
    </section>
  );
}
