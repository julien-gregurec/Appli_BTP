"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  enregistrerPublicationAction,
  finaliserMediaAction,
  genererVariantesAction,
  soumettreAction,
  transformerTexteAction,
  type SaisiePublication,
} from "@/app/actions/social";
import { compterHashtags, LIMITES, longueur, validerContenu } from "@/lib/social/contenu";
import { validerTeleversement } from "@/lib/social/medias";
import { APPLICATIONS_ELSATIA, LIBELLE_RESEAU, RESEAUX, type Reseau } from "@/lib/social/types";
import { ApercuReseau, type MediaApercu } from "@/components/social/ApercuReseau";

type MediaEditeur = MediaApercu & { mimeType: string; tailleOctets: number; largeur: number | null; hauteur: number | null; duree: number | null };

export type ValeursEditeur = Omit<SaisiePublication, "mediaIds" | "reseaux"> & { reseaux: Reseau[]; medias: MediaEditeur[] };

const champ = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const CHAMP_RESEAU = { facebook: "contenu_facebook", instagram: "contenu_instagram", linkedin: "contenu_linkedin" } as const;

function versDateLocale(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function metadonneesVideo(fichier: File): Promise<{ largeur: number | null; hauteur: number | null; duree: number | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(fichier);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ largeur: video.videoWidth || null, hauteur: video.videoHeight || null, duree: Number.isFinite(video.duration) ? video.duration : null });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => resolve({ largeur: null, hauteur: null, duree: null });
    video.src = url;
  });
}

export function EditeurPublication({
  initial,
  modifiable,
  peutRediger,
  comptes,
  logo,
}: {
  initial: ValeursEditeur;
  modifiable: boolean;
  peutRediger: boolean;
  comptes: Partial<Record<Reseau, string>>;
  logo: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState<ValeursEditeur>(initial);
  const [apercu, setApercu] = useState<Reseau>(initial.reseaux[0] ?? "facebook");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [altTexte, setAltTexte] = useState("");
  const actif = modifiable && peutRediger;

  const maj = <K extends keyof ValeursEditeur>(cle: K, valeur: ValeursEditeur[K]) => setV((p) => ({ ...p, [cle]: valeur }));
  const texteReseau = (r: Reseau) => (v[CHAMP_RESEAU[r]].trim() ? v[CHAMP_RESEAU[r]] : v.contenu_principal);

  const controles = useMemo(
    () =>
      Object.fromEntries(
        RESEAUX.map((r) => [
          r,
          validerContenu(r, {
            texte: texteReseau(r),
            lienUrl: v.lien_url || null,
            medias: v.medias.map((m) => ({ type: m.type, mimeType: m.mimeType, tailleOctets: m.tailleOctets, largeur: m.largeur, hauteur: m.hauteur, dureeSecondes: m.duree })),
          }),
        ]),
      ) as Record<Reseau, { erreurs: string[]; avertissements: string[] }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v],
  );

  function saisie(): SaisiePublication {
    const { medias, ...reste } = v;
    return { ...reste, programme_at: v.programme_at ? new Date(v.programme_at).toISOString() : null, mediaIds: medias.map((m) => m.id) };
  }

  function enregistrer(puisSoumettre: boolean) {
    setMessage(null);
    demarrer(async () => {
      const r = await enregistrerPublicationAction(saisie());
      if (!r.ok) return setMessage({ ok: false, texte: r.erreur });
      const id = r.donnees!.id;
      if (puisSoumettre) {
        const s = await soumettreAction(id);
        if (!s.ok) {
          setMessage({ ok: false, texte: `Enregistré, mais non soumis : ${s.erreur}` });
          router.replace(`/plateforme/social/publication?id=${id}`);
          return router.refresh();
        }
      }
      setMessage({ ok: true, texte: puisSoumettre ? "Soumis à validation." : r.message ?? "Enregistré." });
      if (!v.id) {
        setV((p) => ({ ...p, id }));
        router.replace(`/plateforme/social/publication?id=${id}`);
      }
      router.refresh();
    });
  }

  function genererVariantes() {
    setMessage(null);
    demarrer(async () => {
      const r = await genererVariantesAction({ texte: v.contenu_principal, application: v.application, lien: v.lien_url, reseaux: v.reseaux });
      if (!r.ok) return setMessage({ ok: false, texte: r.erreur });
      setV((p) => ({ ...p, contenu_facebook: r.donnees!.facebook, contenu_instagram: r.donnees!.instagram, contenu_linkedin: r.donnees!.linkedin }));
      setMessage({ ok: true, texte: `Variantes proposées par l’Assistant Social : relire et ajuster. CTA suggéré : « ${r.donnees!.cta} »` });
    });
  }

  function transformer(r: Reseau, operation: "reformuler" | "raccourcir" | "hashtags" | "cta") {
    setMessage(null);
    demarrer(async () => {
      const res = await transformerTexteAction(texteReseau(r), r, operation);
      if (!res.ok) return setMessage({ ok: false, texte: res.erreur });
      maj(CHAMP_RESEAU[r], res.donnees!.texte);
    });
  }

  async function televerser(fichier: File) {
    const erreur = validerTeleversement(fichier.type, fichier.size);
    if (erreur) return setMessage({ ok: false, texte: erreur });
    setMessage({ ok: true, texte: "Téléversement en cours…" });
    try {
      const prep = await fetch("/api/social/medias/preparer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mime: fichier.type, taille: fichier.size }) });
      const p = (await prep.json()) as { chemin?: string; token?: string; error?: string };
      if (!prep.ok || !p.chemin || !p.token) throw new Error(p.error ?? "Préparation impossible");
      const { error } = await createClient().storage.from("social-medias").uploadToSignedUrl(p.chemin, p.token, fichier, { contentType: fichier.type });
      if (error) throw error;
      const meta = fichier.type.startsWith("video/") ? await metadonneesVideo(fichier) : { largeur: null, hauteur: null, duree: null };
      const r = await finaliserMediaAction({ chemin: p.chemin, mime: fichier.type, nom: fichier.name, taille: fichier.size, ...meta, texteAlternatif: altTexte });
      if (!r.ok) throw new Error(r.erreur);
      const d = r.donnees!;
      setV((prev) => ({
        ...prev,
        medias: [
          ...prev.medias,
          { id: d.id, type: d.type, url: URL.createObjectURL(fichier), texteAlternatif: altTexte, mimeType: d.type === "image" ? "image/jpeg" : fichier.type, tailleOctets: fichier.size, largeur: d.largeur ?? meta.largeur, hauteur: d.hauteur ?? meta.hauteur, duree: meta.duree },
        ],
      }));
      setAltTexte("");
      setMessage({ ok: true, texte: d.type === "image" ? "Image ajoutée (convertie en JPEG). Enregistrer pour l’associer." : "Vidéo ajoutée. Enregistrer pour l’associer." });
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Téléversement impossible" });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <fieldset disabled={!actif || enCours} className="space-y-4">
        {!modifiable && <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">Publication envoyée : contenu verrouillé.</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="block text-sm">
            <span className="font-medium">Titre interne</span>
            <input className={champ} value={v.titre} maxLength={200} onChange={(e) => maj("titre", e.target.value)} required />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Produit ELSATIA</span>
            <select className={champ} value={v.application} onChange={(e) => maj("application", e.target.value)}>
              {APPLICATIONS_ELSATIA.map((a) => (
                <option key={a.cle} value={a.cle}>{a.libelle}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Texte principal</span>
          <textarea className={`${champ} min-h-32`} value={v.contenu_principal} maxLength={10000} onChange={(e) => maj("contenu_principal", e.target.value)} />
          <span className="text-xs text-neutral-500">Sert de base aux trois versions. Une version vide reprend ce texte.</span>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 text-sm">
            <span className="font-medium">Lien (facultatif)</span>
            <input className={champ} type="url" inputMode="url" placeholder="https://…" value={v.lien_url} onChange={(e) => maj("lien_url", e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Date et heure souhaitées</span>
            <input className={champ} type="datetime-local" value={versDateLocale(v.programme_at)} onChange={(e) => maj("programme_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </label>
        </div>

        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 font-medium">Réseaux cibles</legend>
          {RESEAUX.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="checkbox" checked={v.reseaux.includes(r)} onChange={(e) => maj("reseaux", e.target.checked ? [...v.reseaux, r] : v.reseaux.filter((x) => x !== r))} />
              {LIBELLE_RESEAU[r]}
              {!comptes[r] && <span className="text-xs text-amber-700">(non connecté)</span>}
            </label>
          ))}
        </fieldset>

        <section className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Image ou vidéo</h2>
          <p className="text-xs text-neutral-500">JPEG, PNG, WebP (8 Mo, converti en JPEG) ou MP4/MOV (200 Mo). Une seule image ou vidéo en V1. Utiliser les visuels officiels ELSATIA.</p>
          <label className="block text-sm">
            <span>Texte alternatif (accessibilité)</span>
            <input className={champ} value={altTexte} maxLength={1000} onChange={(e) => setAltTexte(e.target.value)} placeholder="Décrire le visuel pour les personnes malvoyantes" />
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            aria-label="Choisir une image ou une vidéo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void televerser(f);
              e.target.value = "";
            }}
            className="text-sm"
          />
          {v.medias.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded bg-neutral-50 px-2 py-1 text-xs dark:bg-neutral-900">
              <span>{m.type === "image" ? "Image" : "Vidéo"} {m.largeur && m.hauteur ? `${m.largeur}×${m.hauteur}` : ""} {m.duree ? `· ${Math.round(m.duree)} s` : ""} {m.texteAlternatif ? `· « ${m.texteAlternatif} »` : "· sans texte alternatif"}</span>
              <button type="button" className="text-red-700" onClick={() => maj("medias", v.medias.filter((x) => x.id !== m.id))}>Retirer</button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Versions par réseau</h2>
            <button type="button" onClick={genererVariantes} className="rounded-md bg-[#c9a24a] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a] disabled:opacity-50" disabled={!v.contenu_principal.trim()}>
              ✦ Adapter par réseau (Assistant Social)
            </button>
          </div>
          {RESEAUX.filter((r) => v.reseaux.includes(r)).map((r) => {
            const texte = texteReseau(r);
            const ctrl = controles[r];
            return (
              <div key={r} className="space-y-1 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label htmlFor={`texte-${r}`} className="font-medium">{LIBELLE_RESEAU[r]}</label>
                  <span className={`text-xs tabular-nums ${longueur(texte) > LIMITES[r].caracteres ? "text-red-700" : "text-neutral-500"}`}>
                    {longueur(texte)} / {LIMITES[r].caracteres}
                    {r === "instagram" && ` · ${compterHashtags(texte)} / 30 hashtags`}
                  </span>
                </div>
                <textarea id={`texte-${r}`} className={`${champ} min-h-28`} value={v[CHAMP_RESEAU[r]]} placeholder="Vide : reprend le texte principal" onChange={(e) => maj(CHAMP_RESEAU[r], e.target.value)} />
                <div className="flex flex-wrap gap-1 text-xs">
                  {(["reformuler", "raccourcir", "hashtags", "cta"] as const).map((op) => (
                    <button key={op} type="button" onClick={() => transformer(r, op)} className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
                      {op === "reformuler" ? "Reformuler" : op === "raccourcir" ? "Raccourcir" : op === "hashtags" ? "Hashtags" : "Appel à l’action"}
                    </button>
                  ))}
                </div>
                {ctrl.erreurs.map((e) => <p key={e} className="text-xs text-red-700 dark:text-red-400">✕ {e}</p>)}
                {ctrl.avertissements.map((e) => <p key={e} className="text-xs text-amber-700 dark:text-amber-400">! {e}</p>)}
              </div>
            );
          })}
          {v.reseaux.length >= 2 && RESEAUX.filter((r) => v.reseaux.includes(r)).every((r, _i, t) => texteReseau(r) === texteReseau(t[0])) && (
            <p className="text-xs text-amber-700">Les textes sont identiques sur tous les réseaux : les adapter (bouton Assistant Social) est recommandé.</p>
          )}
        </section>

        {message && <p role="status" className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"}`}>{message.texte}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => enregistrer(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700">
            {enCours ? "…" : "Enregistrer en brouillon"}
          </button>
          <button type="button" onClick={() => enregistrer(true)} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white dark:bg-[#c9a24a] dark:text-[#0d1b2a]">
            Soumettre à validation
          </button>
        </div>
        <p className="text-xs text-neutral-500">Modifier un contenu soumis ou validé le renvoie en brouillon : il devra être validé de nouveau.</p>
      </fieldset>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div role="tablist" aria-label="Prévisualisation" className="flex gap-1">
          {RESEAUX.map((r) => (
            <button key={r} role="tab" aria-selected={apercu === r} type="button" onClick={() => setApercu(r)} className={`rounded-md px-3 py-1 text-sm ${apercu === r ? "bg-[#0d1b2a] text-white dark:bg-[#c9a24a] dark:text-[#0d1b2a]" : "border border-neutral-300 dark:border-neutral-700"}`}>
              {LIBELLE_RESEAU[r]}
            </button>
          ))}
        </div>
        {!v.reseaux.includes(apercu) && <p className="text-xs text-amber-700">{LIBELLE_RESEAU[apercu]} n’est pas coché : aperçu seulement.</p>}
        <ApercuReseau reseau={apercu} texte={texteReseau(apercu)} lien={v.lien_url} medias={v.medias} nomCompte={comptes[apercu] ?? "ELSATIA"} logo={logo} />
        {!logo && <p className="text-xs text-amber-700">Logo officiel ELSATIA absent du dépôt (public/elsatia/logo-officiel.svg) : pastille provisoire affichée.</p>}
      </aside>
    </div>
  );
}
