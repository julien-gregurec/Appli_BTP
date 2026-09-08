"use client";

import { useState } from "react";
import {
  DIMENSIONS_RECOMMANDEES,
  TYPES_BLOQUANTS_AUTORISES,
  modeAffichageAutorise,
  type ModeAffichage,
  type TypeCommunication,
} from "@elsatia/platform-support-comms";

/**
 * Rédaction, ciblage et aperçu d'une communication.
 *
 * L'aperçu n'est pas un ornement : il montre au rédacteur ce que verra réellement le
 * lecteur sur téléphone, où un « texte court » de 280 caractères occupe tout l'écran.
 * Le rendu utilise du texte pur (aucun `dangerouslySetInnerHTML`) — la même règle que
 * l'affichage réel, sinon l'aperçu mentirait sur le rendu.
 */

type TypeOption = { cle: TypeCommunication; libelle: string; service: boolean };
type Application = { code: string; nom: string };
type Entreprise = { id: string; nom: string };
type RoleOption = { cle: string; libelle: string; ecart: string | null };

const champ =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

const LARGEURS: Record<string, number> = { ordinateur: 720, tablette: 480, telephone: 320 };

export function CommunicationRedaction({
  action,
  types,
  applications,
  entreprises,
  roles,
}: {
  action: (formData: FormData) => void | Promise<void>;
  types: TypeOption[];
  applications: Application[];
  entreprises: Entreprise[];
  roles: RoleOption[];
}) {
  const [type, setType] = useState<TypeCommunication>(types[0]?.cle ?? "information");
  const [mode, setMode] = useState<ModeAffichage>("banniere");
  const [titre, setTitre] = useState("");
  const [texteCourt, setTexteCourt] = useState("");
  const [libelleBouton, setLibelleBouton] = useState("");
  const [apercu, setApercu] = useState<keyof typeof LARGEURS>("ordinateur");
  const [dimensions, setDimensions] = useState<{ largeur: number; hauteur: number } | null>(null);
  const [avecImage, setAvecImage] = useState(false);

  const bloquantPossible = modeAffichageAutorise(type, "bloquant");

  function mesurerImage(fichier: File | undefined) {
    if (!fichier) {
      setAvecImage(false);
      setDimensions(null);
      return;
    }
    setAvecImage(true);
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      setDimensions({ largeur: img.naturalWidth, hauteur: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Titre</span>
          <input
            name="titre"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className={`${champ} w-full`}
            maxLength={120}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Type</span>
          <select
            name="type"
            value={type}
            onChange={(e) => {
              const nouveau = e.target.value as TypeCommunication;
              setType(nouveau);
              if (!modeAffichageAutorise(nouveau, mode)) setMode("banniere");
            }}
            className={`${champ} w-full`}
          >
            {types.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Texte court</span>
        <textarea
          name="texteCourt"
          value={texteCourt}
          onChange={(e) => setTexteCourt(e.target.value)}
          className={`${champ} w-full`}
          rows={2}
          maxLength={280}
          required
        />
        <span className="block text-xs text-neutral-500">{texteCourt.length}/280 · texte simple, aucune balise HTML</span>
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Contenu détaillé (facultatif)</span>
        <textarea name="contenu" className={`${champ} w-full`} rows={4} maxLength={5000} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Affichage</span>
          <select
            name="modeAffichage"
            value={mode}
            onChange={(e) => setMode(e.target.value as ModeAffichage)}
            className={`${champ} w-full`}
          >
            <option value="banniere">Bannière discrète</option>
            <option value="carte_tableau_de_bord">Carte tableau de bord</option>
            <option value="modale">Boîte modale</option>
            <option value="centre_notifications">Centre de notifications</option>
            <option value="bloquant" disabled={!bloquantPossible}>
              Bloquant (confirmation obligatoire)
            </option>
          </select>
          {!bloquantPossible && (
            <span className="block text-xs text-neutral-500">
              Le mode bloquant est réservé à : {TYPES_BLOQUANTS_AUTORISES.join(", ")}.
            </span>
          )}
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Fréquence</span>
          <select name="frequence" className={`${champ} w-full`} defaultValue="une_seule_fois">
            <option value="une_seule_fois">Une seule fois</option>
            <option value="rappel_periodique">Rappel périodique (24 h)</option>
            <option value="jusqu_a_acquittement">Jusqu’à acquittement</option>
            <option value="permanent">Permanent</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Priorité</span>
          <select name="priorite" className={`${champ} w-full`} defaultValue="normale">
            <option value="basse">Basse</option>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="critique">Critique</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Début de diffusion</span>
          <input type="datetime-local" name="debutAt" className={`${champ} w-full`} required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Fin (facultatif)</span>
          <input type="datetime-local" name="finAt" className={`${champ} w-full`} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Lien (facultatif)</span>
          <input
            name="lien"
            className={`${champ} w-full`}
            placeholder="https://app.elsatia.fr/… ou /abonnement"
          />
          <span className="block text-xs text-neutral-500">
            Domaines ELSATIA uniquement, en https, sans redirection sortante.
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Libellé du bouton</span>
          <input
            name="libelleBouton"
            value={libelleBouton}
            onChange={(e) => setLibelleBouton(e.target.value)}
            className={`${champ} w-full`}
            maxLength={40}
          />
        </label>
      </div>

      <fieldset className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Image (facultative)</legend>
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          className="text-sm"
          onChange={(e) => mesurerImage(e.target.files?.[0])}
        />
        <input type="hidden" name="imageLargeur" value={dimensions?.largeur ?? ""} />
        <input type="hidden" name="imageHauteur" value={dimensions?.hauteur ?? ""} />
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Texte alternatif {avecImage ? "(obligatoire)" : ""}</span>
          <input name="imageAlt" className={`${champ} w-full`} maxLength={160} required={avecImage} />
        </label>
        <p className="text-xs text-neutral-500">
          PNG, JPEG ou WebP, 2 Mo maximum. Dimensions recommandées{" "}
          {DIMENSIONS_RECOMMANDEES.largeur} × {DIMENSIONS_RECOMMANDEES.hauteur} px.
          {dimensions ? ` Image fournie : ${dimensions.largeur} × ${dimensions.hauteur} px.` : ""}{" "}
          Le SVG n’est pas accepté ; le type réel du fichier est vérifié sur ses octets.
        </p>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Ciblage</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Applications (aucune sélection = toutes)</span>
            <select name="applications" multiple className={`${champ} h-28 w-full`}>
              {applications.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Entreprises (aucune sélection = toutes)</span>
            <select name="entreprises" multiple className={`${champ} h-28 w-full`}>
              {entreprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Segments d’abonnement</span>
            <select name="segments" multiple className={`${champ} h-24 w-full`}>
              <option value="pilote">Pilote</option>
              <option value="essai">Essai</option>
              <option value="actif">Client actif</option>
              <option value="expire">Abonnement expiré</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Postes et rôles (aucune sélection = tous)</span>
            <select name="roles" multiple className={`${champ} h-24 w-full`}>
              {roles.map((r) => (
                <option key={r.cle} value={r.cle}>
                  {r.libelle}
                  {r.ecart ? " (par permission)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Les postes Gestion Pro sont libres : le ciblage passe par le modèle de poste
          d’origine, par une permission, ou par un rôle applicatif Colors / Réserves.
          « Gestionnaire de stock » et « Responsable matériel » n’ont pas de modèle Gestion
          Pro et sont ciblés par permission.
        </p>
      </fieldset>

      <fieldset className="space-y-1 text-sm">
        <legend className="font-medium">Canaux</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="canaux" value="in_app" defaultChecked /> Dans l’application
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="canaux" value="email" /> E-mail
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="canaux" value="push" /> Notification push
          </label>
        </div>
      </fieldset>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Aperçu</span>
          {(Object.keys(LARGEURS) as (keyof typeof LARGEURS)[]).map((cle) => (
            <button
              key={cle}
              type="button"
              onClick={() => setApercu(cle)}
              className={`rounded-md border px-2 py-1 text-xs ${apercu === cle ? "border-[#0d1b2a] font-semibold" : ""}`}
            >
              {cle}
            </button>
          ))}
        </div>
        <div
          className="rounded-md border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          style={{ maxWidth: LARGEURS[apercu] }}
        >
          <p className="font-semibold">{titre || "Titre du message"}</p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            {texteCourt || "Texte court affiché au lecteur."}
          </p>
          {libelleBouton && (
            <span className="mt-2 inline-block rounded-md bg-[#0d1b2a] px-3 py-1.5 text-xs font-semibold text-white">
              {libelleBouton}
            </span>
          )}
          {mode === "bloquant" && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
              Ce message bloquera l’accès tant qu’il n’est pas confirmé.
            </p>
          )}
        </div>
      </section>

      <button type="submit" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">
        Enregistrer en brouillon
      </button>
    </form>
  );
}
