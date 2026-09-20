"use client";
import { useState } from "react";
import type {
  EditorCommand,
  StudioMediaAsset,
  TimelineMusic,
} from "@elsatia/studio-domain";
const defaults = { volume: 0.5, fade_in_ms: 500, fade_out_ms: 1500 };
export default function MusicPanel({
  music,
  assets,
  canWrite,
  change,
}: {
  music: TimelineMusic | null;
  assets: StudioMediaAsset[];
  canWrite: boolean;
  change: (command: EditorCommand) => void;
}) {
  const tracks = assets.filter(
    (a) =>
      a.media_type === "audio" && a.upload_status === "ready" && !a.deleted_at,
  );
  const current = music ? tracks.find((a) => a.id === music.asset_id) : null;
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  async function listen(id: string) {
    setError("");
    try {
      const r = await fetch(`/api/media/assets/${id}/preview`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setUrl(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Écoute indisponible.");
    }
  }
  return (
    <section className="card" aria-label="Musique">
      <h2>Musique</h2>
      {tracks.length === 0 && !music && (
        <p>
          Importez un fichier MP3, M4A ou WAV dans la médiathèque du projet pour
          l’utiliser comme musique. Vous en êtes responsable (droits d’auteur).
        </p>
      )}
      {music && !current && (
        <p role="alert">
          La musique choisie n’est plus disponible : remplacez-la ou retirez-la
          avant de créer la vidéo.
        </p>
      )}
      <fieldset disabled={!canWrite}>
        <label>
          Musique du montage
          <select
            value={music?.asset_id ?? ""}
            onChange={(e) =>
              change({
                type: "music",
                music: e.target.value
                  ? { ...(music ?? defaults), asset_id: e.target.value }
                  : null,
              })
            }
          >
            <option value="">Aucune musique</option>
            {music && !current && (
              <option value={music.asset_id}>(fichier indisponible)</option>
            )}
            {tracks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.original_filename}
              </option>
            ))}
          </select>
        </label>
        {music && (
          <>
            <label>
              Volume de la musique : {Math.round(music.volume * 100)} %
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(music.volume * 100)}
                onChange={(e) =>
                  change({
                    type: "music",
                    music: { ...music, volume: Number(e.target.value) / 100 },
                  })
                }
              />
            </label>
            <label>
              Fondu d’entrée (secondes)
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={music.fade_in_ms / 1000}
                onChange={(e) =>
                  change({
                    type: "music",
                    music: {
                      ...music,
                      fade_in_ms: Math.round(
                        Math.min(10, Math.max(0, Number(e.target.value))) *
                          1000,
                      ),
                    },
                  })
                }
              />
            </label>
            <label>
              Fondu de sortie (secondes)
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={music.fade_out_ms / 1000}
                onChange={(e) =>
                  change({
                    type: "music",
                    music: {
                      ...music,
                      fade_out_ms: Math.round(
                        Math.min(10, Math.max(0, Number(e.target.value))) *
                          1000,
                      ),
                    },
                  })
                }
              />
            </label>
            <p>
              Une musique plus courte que la vidéo est répétée ; une musique
              plus longue est coupée à la fin de la vidéo. Le son des vidéos
              importées reste audible sous la musique.
            </p>
            {current && (
              <button type="button" onClick={() => void listen(current.id)}>
                Écouter la musique
              </button>
            )}
          </>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {url && (
        <audio
          src={url}
          controls
          preload="metadata"
          aria-label="Écoute de la musique"
          style={{ width: "100%" }}
        />
      )}
    </section>
  );
}
