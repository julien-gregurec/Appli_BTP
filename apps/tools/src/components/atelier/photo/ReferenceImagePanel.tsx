"use client";

/**
 * WORKSHOP-UI-CANONICAL-V2 §6/§13 — surface d'interface du parcours « photo → tracé libre ».
 *
 * Le canon image/vectorisation (`lib/tracing/api.ts`) livrait un workflow complet SANS aucune
 * interface : la recette navigateur du lot précédent était donc restée en réserve, faute
 * d'écran pour l'exécuter. Ce panneau est cette surface, et rien de plus.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne décode aucune image lui-même (`decodeReferenceImage`), ne calibre rien
 * (`calibrateReference`), ne détecte aucun contour (`detectContourProposal`), ne simplifie rien
 * (`simplifyContour`), ne juge aucune fiabilité (`reviewTracingReliability`) et n'écrit pas dans
 * le projet (`confirmVectorizationIntoProject`). Chacun de ces gestes est UN appel à l'API
 * canonique, dont le résultat est affiché tel quel — écarts mesurés compris. Aucun moteur de
 * vectorisation n'est dupliqué ici, et aucune valeur n'est recalculée pour l'affichage.
 *
 * ## Deux choix d'interface qui portent une règle
 *
 * - **le contour reste une PROPOSITION jusqu'au versement.** Rien de ce qui se passe dans ce
 *   panneau ne touche `freeGeometry` tant que « Verser dans le tracé libre » n'a pas été
 *   pressé : c'est `confirmVectorizationIntoProject` qui franchit le pas, en une seule
 *   écriture déjà revalidée. Tant qu'il n'est pas pressé, fermer l'écran ne perd que des
 *   propositions — jamais du travail enregistré ;
 * - **les refus sont annoncés AVANT le travail, pas après.** `confirmBlockers` liste ce qui
 *   empêche le versement dès l'ouverture du panneau — projet paramétrique, échelle non
 *   définie, réserve bloquante. Laisser relever un contour entier pour refuser à la fin serait
 *   la pire façon de faire respecter la même règle.
 *
 * L'image de travail est affichée à sa taille de travail, mise à l'échelle par CSS ; les clics
 * sont reconvertis en pixels de travail — la seule unité dans laquelle le canon calibre.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  attachReferenceImage,
  calibrateReference,
  confirmVectorizationIntoProject,
  controlCalibration,
  detectContourProposal,
  importReferenceImage,
  simplifyContour,
} from "@/lib/tracing/api";
import {
  createReferenceObjectUrl,
  decodeReferenceImage,
  grayscaleForAnalysis,
  revokeReferenceObjectUrl,
  scalePointsFromAnalysis,
} from "@/lib/tracing/image-decode";
import { assessPerspective, type PerspectiveAssessment } from "@/lib/tracing/perspective";
import { hasBlockingNotice, reviewTracingReliability } from "@/lib/tracing/reliability";
import { isCalibrated } from "@/lib/tracing/reference-image";
import {
  createAssetRef,
  createReferenceAssetStore,
  assetStorageScope,
  type ReferenceAssetStore,
} from "@/lib/tracing/asset-store";
import { derivedScaleStatus, type TracingProject, type TracingReferenceImage } from "@/lib/tracing/project";
import { touchTracingProject } from "@/lib/tracing/atelier";
import {
  SIMPLIFICATION_LABELS,
  createRawContour,
  type RawContour,
  type SimplificationLevel,
} from "@/lib/tracing/vectorization";
import styles from "../workshop/workshop.module.css";
import {
  addPickedPoint,
  confirmBlockers,
  parseRealDistance,
  photoSteps,
  quadOf,
  type PhotoPicking,
  type PhotoPoint,
} from "./photo-workflow";

export type ReferenceImagePanelProps = {
  project: TracingProject;
  /** Écriture réelle : le projet rendu par l'API canonique, déjà revalidé. */
  onProjectChange: (project: TracingProject) => void;
  /** Périmètre de stockage des blobs — même cloisonnement que les projets. */
  companyId?: string | null;
};

const PICKING_LABELS: Readonly<Record<PhotoPicking, string>> = {
  none: "",
  calibration: "Cliquez les deux extrémités d’une distance que vous connaissez.",
  control: "Cliquez les deux extrémités d’une SECONDE distance connue, pour contrôler l’échelle.",
  quad: "Cliquez les quatre coins d’un rectangle réel : haut-gauche, haut-droit, bas-droit, bas-gauche.",
};

const SIMPLIFICATION_ORDER: readonly SimplificationLevel[] = ["precis", "standard", "simple"];

export function ReferenceImagePanel({ project, onProjectChange, companyId = null }: ReferenceImagePanelProps) {
  /**
   * L'image RÉGLÉE, une seule à la fois — par défaut la dernière attachée.
   *
   * `attachReferenceImage` empile : un projet peut donc en porter plusieurs, et c'est voulu
   * côté canon (une pièce, plusieurs prises de vue). Ce panneau, lui, n'en règle qu'une —
   * calibrer deux photos à la fois n'aurait aucun sens — mais il doit permettre d'atteindre
   * TOUTES celles du projet, et pas seulement la dernière.
   *
   * Ce n'est pas du confort : `atelier-export-adapter` exige que CHAQUE image de référence
   * soit calibrée avant l'export. Une photo importée puis laissée de côté bloquerait donc le
   * dossier chantier, sans que rien à l'écran ne permette de la calibrer ni de la retirer.
   */
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const image: TracingReferenceImage | null =
    project.referenceImages.find((item) => item.id === selectedImageId) ?? project.referenceImages.at(-1) ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImageData | null>(null);
  const [picking, setPicking] = useState<PhotoPicking>("none");
  const [points, setPoints] = useState<readonly PhotoPoint[]>([]);
  const [distance, setDistance] = useState("");
  const [contour, setContour] = useState<RawContour | null>(null);
  const [simplifyNotice, setSimplifyNotice] = useState("");
  const [simplifyDeviationMm, setSimplifyDeviationMm] = useState<number | undefined>(undefined);
  const [perspective, setPerspective] = useState<PerspectiveAssessment | null>(null);

  const storeRef = useRef<ReferenceAssetStore | null>(null);
  const getStore = useCallback(() => {
    if (!storeRef.current) storeRef.current = createReferenceAssetStore(assetStorageScope(companyId));
    return storeRef.current;
  }, [companyId]);

  // Une photo de téléphone maintenue en mémoire pèse lourd sur mobile (§41 du canon) :
  // l'URL d'aperçu est révoquée dès qu'elle est remplacée ou que le panneau disparaît.
  useEffect(() => {
    return () => {
      if (preview) revokeReferenceObjectUrl(preview);
    };
  }, [preview]);

  /**
   * Reprise d'un projet déjà enregistré : le blob vit dans `asset-store`, jamais dans le
   * projet. On le relit pour reconstruire l'aperçu ET les pixels d'analyse — sans eux, une
   * réouverture montrerait une calibration sans l'image sur laquelle elle a été faite, et la
   * détection de contour resterait inerte alors que la photo est bien là.
   *
   * Le décodage est refait plutôt que conservé : les pixels d'une photo de téléphone ne se
   * sérialisent pas. C'est le même `decodeReferenceImage` qu'à l'import, donc la même taille
   * de travail et la même orientation EXIF — la calibration enregistrée reste valable.
   *
   * La reprise est gardée par une RÉFÉRENCE, pas par l'état d'aperçu. Publier l'aperçu avant
   * la fin du décodage relancerait l'effet, dont le nettoyage annulerait le décodage encore
   * en vol : la photo s'afficherait, mais la détection resterait éteinte sans rien dire.
   */
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    const ref = image?.assetRef;
    if (!ref || loadedRef.current === ref) return;
    // Marqué AVANT le travail : deux rendus rapprochés ne doivent pas lancer deux lectures.
    loadedRef.current = ref;
    const name = image?.name;
    let cancelled = false;
    let settled = false;
    void (async () => {
      try {
        const stored = await getStore().get(ref);
        if (cancelled || !stored) return;
        const url = createReferenceObjectUrl(stored.blob);
        const decoded = await decodeReferenceImage(stored.blob, { fileName: name });
        if (cancelled) {
          revokeReferenceObjectUrl(url);
          return;
        }
        settled = true;
        setPreview(url);
        setAnalysis(decoded.pixels);
      } catch {
        // L'absence d'aperçu ou de pixels n'invalide ni la calibration ni le relevé déjà versé :
        // on ne rouvre pas une alerte sur un travail terminé. La détection reste simplement
        // indisponible, et son bouton le dit.
        loadedRef.current = null;
      }
    })();
    // Une reprise interrompue AVANT d'avoir abouti doit pouvoir être rejouée : sans cette
    // remise à zéro, le double montage des effets en développement condamnerait la photo —
    // la première passe poserait le drapeau puis serait annulée, la seconde le verrait posé
    // et ne ferait rien. L'aperçu et les pixels manqueraient alors sans qu'aucune erreur ne
    // le dise.
    return () => {
      cancelled = true;
      if (!settled) loadedRef.current = null;
    };
  }, [image?.assetRef, image?.name, getStore]);

  const notices = useMemo(
    () =>
      reviewTracingReliability({
        calibration: image?.calibration ?? { status: "undefined" },
        perspective: perspective ?? undefined,
        contours: contour ? [contour] : undefined,
        simplificationMaxDeviationMm: simplifyDeviationMm,
      }),
    [image?.calibration, perspective, contour, simplifyDeviationMm],
  );

  const steps = useMemo(
    () => photoSteps({ image, contour, confirmed: contour?.status === "confirmed" }),
    [image, contour],
  );
  const blockers = useMemo(
    () => confirmBlockers(project, image, contour, notices),
    [project, image, contour, notices],
  );

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const decoded = await decodeReferenceImage(file, { fileName: file.name });
        const assetRef = createAssetRef();
        await getStore().put({
          ref: assetRef,
          blob: file,
          format: decoded.format,
          widthPx: decoded.widthPx,
          heightPx: decoded.heightPx,
        });
        const { image: imported, downscaled } = importReferenceImage({
          id: assetRef,
          name: file.name,
          mimeOrName: file.type || file.name,
          source: "gallery",
          sourceWidthPx: decoded.sourceWidthPx,
          sourceHeightPx: decoded.sourceHeightPx,
          sizeBytes: file.size,
          assetRef,
        });
        if (preview) revokeReferenceObjectUrl(preview);
        loadedRef.current = assetRef;
        setPreview(createReferenceObjectUrl(file));
        setAnalysis(decoded.pixels);
        setPoints([]);
        setPicking("calibration");
        setContour(null);
        setPerspective(null);
        setSimplifyNotice("");
        setSimplifyDeviationMm(undefined);
        setNotice(
          downscaled
            ? `Image ramenée à ${decoded.widthPx} × ${decoded.heightPx} px de travail. Tout reste sur cet appareil.`
            : "Image importée. Tout reste sur cet appareil.",
        );
        onProjectChange(attachReferenceImage(project, imported));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Import de l’image impossible.");
      } finally {
        setBusy(false);
      }
    },
    [getStore, onProjectChange, preview, project],
  );

  /** Un clic écran → pixels de l'image de TRAVAIL, la seule unité dans laquelle on calibre. */
  const onImageClick = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      if (!image || picking === "none") return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const point = {
        x: ((event.clientX - rect.left) / rect.width) * image.widthPx,
        y: ((event.clientY - rect.top) / rect.height) * image.heightPx,
      };
      setPoints((current) => addPickedPoint(current, point, picking));
    },
    [image, picking],
  );

  const applyCalibration = useCallback(() => {
    if (!image || points.length < 2) return;
    const real = parseRealDistance(distance);
    if (real === null) {
      setError("Saisissez une distance réelle strictement positive.");
      return;
    }
    setError("");
    try {
      const calibrated = calibrateReference(image, {
        pointA: points[0],
        pointB: points[1],
        realDistance: real,
        realUnit: "mm",
      });
      onProjectChange(attachReferenceImage(project, calibrated));
      setPoints([]);
      setPicking("none");
      setNotice("Échelle calibrée.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calibration impossible.");
    }
  }, [distance, image, onProjectChange, points, project]);

  const applyControl = useCallback(() => {
    if (!image || points.length < 2) return;
    const real = parseRealDistance(distance);
    if (real === null) {
      setError("Saisissez la valeur attendue de la cote de contrôle.");
      return;
    }
    setError("");
    try {
      const { image: checked, check } = controlCalibration(image, {
        pointA: points[0],
        pointB: points[1],
        expectedDistance: real,
        expectedUnit: "mm",
      });
      onProjectChange(attachReferenceImage(project, checked));
      setPoints([]);
      setPicking("none");
      setNotice(`Contrôle ${check.quality} — écart ${Math.round(Math.abs(check.deviationMm) * 10) / 10} mm.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Contrôle impossible.");
    }
  }, [distance, image, onProjectChange, points, project]);

  const applyPerspective = useCallback(() => {
    const quad = quadOf(points);
    if (!quad) return;
    const assessment = assessPerspective(quad);
    setPerspective(assessment);
    setPoints([]);
    setPicking("none");
    setNotice(assessment.warning || "Aucune inclinaison notable mesurée sur ce rectangle.");
  }, [points]);

  const detect = useCallback(() => {
    if (!image || !analysis) {
      setError("Réimportez l’image : ses pixels ne sont plus en mémoire pour l’analyse.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { image: gray, scale } = grayscaleForAnalysis(analysis);
      const detection = detectContourProposal(`contour-${image.id}`, gray);
      // Le contour est détecté dans l'espace d'ANALYSE, réduit : il est reprojeté dans
      // l'espace de travail, celui où la calibration est exprimée.
      const reprojected = createRawContour({
        id: detection.contour.id,
        points: scalePointsFromAnalysis(detection.contour.points, scale),
        space: "image-pixels",
        closed: detection.contour.closed,
        source: "detected",
      });
      setContour(reprojected);
      setSimplifyNotice("");
      setSimplifyDeviationMm(undefined);
      setNotice(detection.notice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Détection impossible sur cette image.");
    } finally {
      setBusy(false);
    }
  }, [analysis, image]);

  const applySimplification = useCallback(
    (level: SimplificationLevel) => {
      if (!contour || !image) return;
      setError("");
      try {
        const mmPerPixel = isCalibrated(image.calibration) ? image.calibration.mmPerPixel : undefined;
        const report = simplifyContour(contour, level, mmPerPixel);
        setContour(report.contour);
        setSimplifyNotice(report.notice);
        setSimplifyDeviationMm(report.maxDeviationMm ?? undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Simplification impossible.");
      }
    },
    [contour, image],
  );

  /**
   * Détache une image du projet et libère ses octets.
   *
   * Le patch passe par `touchTracingProject`, donc par la revalidation stricte, et
   * `scaleStatus` est REDÉDUIT (`derivedScaleStatus`) : retirer la seule image calibrée doit
   * ramener le projet à « échelle non définie », sinon il porterait une échelle que plus
   * aucune image ne justifie.
   *
   * Le blob est supprimé après l'écriture du projet, jamais avant : si l'écriture échoue, on
   * préfère un octet orphelin — que `pruneOrphanAssets` sait ramasser — à une image
   * référencée dont les octets ont disparu.
   */
  const removeImage = useCallback(
    async (target: TracingReferenceImage) => {
      setBusy(true);
      setError("");
      try {
        const referenceImages = project.referenceImages.filter((item) => item.id !== target.id);
        const patched = { ...project, referenceImages };
        onProjectChange(
          touchTracingProject(patched, { referenceImages, scaleStatus: derivedScaleStatus(patched) }),
        );
        setSelectedImageId(null);
        if (loadedRef.current === target.assetRef) {
          loadedRef.current = null;
          if (preview) revokeReferenceObjectUrl(preview);
          setPreview(null);
          setAnalysis(null);
        }
        setContour(null);
        setPerspective(null);
        setSimplifyNotice("");
        setSimplifyDeviationMm(undefined);
        setPoints([]);
        setPicking("none");
        setNotice("Image retirée du tracé.");
        if (target.assetRef) await getStore().delete(target.assetRef);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Retrait de l’image impossible.");
      } finally {
        setBusy(false);
      }
    },
    [getStore, onProjectChange, preview, project],
  );

  const confirm = useCallback(() => {
    if (!contour || !image) return;
    setError("");
    try {
      const result = confirmVectorizationIntoProject({
        project,
        contour,
        image,
        simplifyIfNeeded: true,
      });
      onProjectChange(result.project);
      setContour(result.project.contours.find((item) => item.id === contour.id) ?? null);
      setNotice(result.notice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versement impossible.");
    }
  }, [contour, image, onProjectChange, project]);

  const blocking = hasBlockingNotice(notices);

  return (
    <>
      <p className={styles.hint}>
        La photo, sa calibration et le relevé restent sur cet appareil : aucun octet n’est envoyé. Le contour
        détecté est une <strong>proposition</strong> — il ne rejoint votre tracé que lorsque vous le versez.
      </p>

      {project.referenceImages.length > 1 && (
        <>
          <p className={styles.hint}>
            Ce tracé porte {project.referenceImages.length} images de référence. Choisissez celle à régler —
            l’export exige que <strong>toutes</strong> soient calibrées.
          </p>
          <div className={styles.toggles} role="group" aria-label="Image de référence à régler">
            {project.referenceImages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.toggle}
                aria-pressed={item.id === image?.id}
                onClick={() => setSelectedImageId(item.id)}
              >
                <span className={styles.dot} aria-hidden="true" />
                {item.name}
                <span className={styles.count}>{isCalibrated(item.calibration) ? "calibrée" : "à calibrer"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.stepNav}>
        <label className={styles.toggle}>
          Choisir une photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {image && (
          <button type="button" onClick={() => void removeImage(image)} disabled={busy}>
            Retirer cette image
          </button>
        )}
      </div>

      <ol className={styles.photoSteps}>
        {steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <b>{step.label}</b>
            <span>{step.detail}</span>
          </li>
        ))}
      </ol>

      {preview && image && (
        <>
          {picking !== "none" && (
            <p className={styles.hint} aria-live="polite">
              {PICKING_LABELS[picking]} {points.length} / {picking === "quad" ? 4 : 2} point(s) posé(s).
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- blob local, jamais une URL distante */}
          <img
            className={styles.photo}
            src={preview}
            alt={`Image de référence — ${image.name}`}
            data-picking={picking !== "none" ? "on" : "off"}
            onClick={onImageClick}
          />
        </>
      )}

      {image && (
        <div className={styles.toggles} role="group" aria-label="Points à désigner sur l’image">
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={picking === "calibration"}
            onClick={() => {
              setPoints([]);
              setPicking(picking === "calibration" ? "none" : "calibration");
            }}
          >
            <span className={styles.dot} aria-hidden="true" />
            Calibrer
          </button>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={picking === "control"}
            disabled={!isCalibrated(image.calibration)}
            onClick={() => {
              setPoints([]);
              setPicking(picking === "control" ? "none" : "control");
            }}
          >
            <span className={styles.dot} aria-hidden="true" />
            Cote de contrôle
          </button>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={picking === "quad"}
            disabled={!isCalibrated(image.calibration)}
            onClick={() => {
              setPoints([]);
              setPicking(picking === "quad" ? "none" : "quad");
            }}
          >
            <span className={styles.dot} aria-hidden="true" />
            Mesurer la perspective
          </button>
        </div>
      )}

      {image && (picking === "calibration" || picking === "control") && (
        <div className={styles.gridCustom}>
          <label htmlFor="photo-real-distance">
            {picking === "calibration" ? "Distance réelle entre les deux points (mm)" : "Valeur attendue de la cote (mm)"}
          </label>
          <input
            id="photo-real-distance"
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={distance}
            placeholder="ex. 1000"
            onChange={(event) => setDistance(event.target.value)}
          />
          <button
            type="button"
            className={styles.toggle}
            disabled={points.length < 2 || distance.trim() === ""}
            onClick={picking === "calibration" ? applyCalibration : applyControl}
          >
            {picking === "calibration" ? "Calibrer" : "Contrôler"}
          </button>
        </div>
      )}

      {image && picking === "quad" && (
        <div className={styles.stepNav}>
          <button type="button" disabled={points.length < 4} onClick={applyPerspective}>
            Mesurer l’inclinaison
          </button>
        </div>
      )}

      {image && isCalibrated(image.calibration) && (
        <div className={styles.stepNav}>
          <button type="button" disabled={busy || !analysis} onClick={detect}>
            Détecter le contour
          </button>
          {!analysis && (
            <p className={styles.hint}>
              Les pixels de la photo ne sont pas disponibles pour l’analyse sur cet appareil : le contour peut
              encore être relevé à la main, mais pas détecté automatiquement.
            </p>
          )}
        </div>
      )}

      {contour && (
        <>
          <div className={styles.toggles} role="group" aria-label="Simplification du contour">
            {SIMPLIFICATION_ORDER.map((level) => (
              <button key={level} type="button" className={styles.toggle} onClick={() => applySimplification(level)}>
                <span className={styles.dot} aria-hidden="true" />
                {SIMPLIFICATION_LABELS[level]}
              </button>
            ))}
          </div>
          {simplifyNotice && <p className={styles.hint}>{simplifyNotice}</p>}
        </>
      )}

      {notices.length > 0 && (
        <ul className={styles.notices}>
          {notices.map((item) => (
            <li key={item.code} data-level={item.level}>
              <b>{item.title}</b>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {contour && (
        <div className={styles.stepNav}>
          <button
            type="button"
            className={styles.primary}
            disabled={blockers.length > 0 || blocking}
            onClick={confirm}
          >
            Verser dans le tracé libre
          </button>
        </div>
      )}

      {blockers.length > 0 && (
        <ul className={styles.notices}>
          {blockers.map((blocker) => (
            <li key={blocker} data-level="erreur">
              <span>{blocker}</span>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.hint} role={error ? "alert" : undefined} aria-live="polite">
        {error || notice}
      </p>
    </>
  );
}
