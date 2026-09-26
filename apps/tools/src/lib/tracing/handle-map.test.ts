import { describe, expect, it } from "vitest";
import { TRACE_MODEL_CATALOG, TRACE_MODEL_SLUGS, traceModelDefaults, type TraceModelSlug } from "../geometry/models/catalog";
import { HANDLE_RULES, buildEditableHandles, nearestEditableHandle } from "./handle-map";
import { measureAt, paramsForHandleTarget, wrapDegrees, type EditableHandle } from "./editable-handle";

function handlesFor(slug: TraceModelSlug, overrides: Record<string, number> = {}) {
  const descriptor = TRACE_MODEL_CATALOG[slug];
  const params = { ...traceModelDefaults(descriptor), ...overrides };
  const model = descriptor.build(params);
  return { descriptor, params, model, handles: buildEditableHandles(descriptor, params, model) };
}

describe("matrice d'éditabilité — couverture", () => {
  it("déclare une règle pour les 13 modèles du registre", () => {
    expect(Object.keys(HANDLE_RULES).sort()).toEqual([...TRACE_MODEL_SLUGS].sort());
  });

  it("produit exactement une poignée par point nommé, sans identifiant dupliqué", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const { model, handles } = handlesFor(slug);
      expect(handles).toHaveLength(model.points.length);
      expect(new Set(handles.map((handle) => handle.id)).size).toBe(handles.length);
      for (const handle of handles) {
        const point = model.points.find((item) => item.id === handle.entityId);
        expect(point).toBeDefined();
        // La position est LUE dans le modèle, jamais recalculée.
        expect(handle.position).toEqual({ x: point!.x, y: point!.y });
      }
    }
  });

  it("donne une raison à toute poignée en lecture seule, et aucune à une poignée éditable", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      for (const handle of handlesFor(slug).handles) {
        if (handle.editable) {
          expect(handle.readonlyReason).toBeUndefined();
          expect(handle.drives.length).toBeGreaterThan(0);
          expect(handle.sourceParam).toBe(handle.drives[0].paramId);
        } else {
          expect(handle.readonlyReason).toBeTruthy();
          expect(handle.drives).toHaveLength(0);
          expect(handle.sourceParams).toHaveLength(0);
        }
      }
    }
  });

  it("chaque modèle a au moins une poignée éditable", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const editable = handlesFor(slug).handles.filter((handle) => handle.editable);
      expect(editable.length, `${slug} n'a aucune poignée éditable`).toBeGreaterThan(0);
    }
  });

  it("ne pilote que des paramètres réellement publiés par le modèle", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const { descriptor, handles } = handlesFor(slug);
      const known = new Set(descriptor.parameters.map((parameter) => parameter.id));
      for (const handle of handles) {
        for (const paramId of handle.sourceParams) expect(known.has(paramId)).toBe(true);
      }
    }
  });

  it("ne rend jamais deux poignées éditables confondues au même endroit", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const editable = handlesFor(slug).handles.filter((handle) => handle.editable);
      for (let i = 0; i < editable.length; i += 1) {
        for (let j = i + 1; j < editable.length; j += 1) {
          const distance = Math.hypot(
            editable[i].position.x - editable[j].position.x,
            editable[i].position.y - editable[j].position.y,
          );
          expect(distance, `${slug}: ${editable[i].id} et ${editable[j].id}`).toBeGreaterThan(0.01);
        }
      }
    }
  });
});

describe("calibration", () => {
  /**
   * Le cœur du contrat : l'inversion est écrite en écart et suppose la relation AFFINE entre
   * la mesure et le paramètre. On le vérifie plutôt que de le supposer — deux écarts de
   * calibration doivent donner la même pente.
   */
  it("la mesure est affine en le paramètre sur les 13 modèles", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const { descriptor, params, handles } = handlesFor(slug);
      for (const handle of handles) {
        if (!handle.editable) continue;
        for (const drive of handle.drives) {
          const parameter = descriptor.parameters.find((item) => item.id === drive.paramId)!;
          const span = (parameter.max ?? parameter.defaultValue * 2) - (parameter.min ?? 0);
          const wide = (parameter.step ?? span * 1e-4) * 3;
          const value = params[drive.paramId] + wide;
          if (parameter.max !== undefined && value > parameter.max) continue;
          let shiftedModel;
          try {
            shiftedModel = descriptor.build({ ...params, [drive.paramId]: value });
          } catch {
            continue;
          }
          const moved = shiftedModel.points.find((point) => point.id === handle.entityId)!;
          const before = measureAt(drive.measure, handle.position, handle.anchor);
          const after = measureAt(drive.measure, { x: moved.x, y: moved.y }, handle.anchor);
          const change = drive.measure === "angle" ? wrapDegrees(after - before) : after - before;
          const wideSlope = change / wide;
          expect(
            Math.abs(wideSlope - drive.slope),
            `${slug}/${handle.id}/${drive.paramId}: pente ${drive.slope} vs ${wideSlope}`,
          ).toBeLessThan(Math.max(1e-6, Math.abs(drive.slope) * 1e-3));
        }
      }
    }
  });
});

describe("aller-retour : viser une position, obtenir le paramètre qui l'atteint", () => {
  /**
   * Le test qui compte vraiment : on vise une position, on en déduit les paramètres, on
   * RECONSTRUIT le modèle par Engine B, et on vérifie que la poignée est bien arrivée où on
   * la voulait. Rien n'est comparé au calcul de l'inversion elle-même.
   */
  it("la poignée atteint la mesure visée sur les 13 modèles", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const { descriptor, handles } = handlesFor(slug);
      for (const handle of handles) {
        if (!handle.editable) continue;
        for (const drive of handle.drives) {
          // Viser un écart franc, dans le sens qui reste dans les bornes.
          const stepSize = drive.step ?? Math.abs(handle.baseParams[drive.paramId] || 1) * 0.05;
          const room =
            drive.max !== undefined && handle.baseParams[drive.paramId] + stepSize * 4 > drive.max ? -4 : 4;
          const aimedParam = handle.baseParams[drive.paramId] + stepSize * room;
          if (drive.min !== undefined && aimedParam < drive.min) continue;
          if (drive.max !== undefined && aimedParam > drive.max) continue;

          const current = measureAt(drive.measure, handle.position, handle.anchor);
          const aimedMeasure = current + (aimedParam - handle.baseParams[drive.paramId]) * drive.slope;
          const target = targetFor(handle, drive.measure, aimedMeasure);

          const next = paramsForHandleTarget(handle, target);
          expect(next, `${slug}/${handle.id}/${drive.paramId}`).not.toBeNull();
          expect(next![drive.paramId]).toBeCloseTo(aimedParam, 6);

          // Reconstruction réelle : le point doit être arrivé.
          const rebuilt = descriptor.build(next!);
          const moved = rebuilt.points.find((point) => point.id === handle.entityId)!;
          const reached = measureAt(drive.measure, { x: moved.x, y: moved.y }, handle.anchor);
          const error = drive.measure === "angle" ? Math.abs(wrapDegrees(reached - aimedMeasure)) : Math.abs(reached - aimedMeasure);
          expect(error, `${slug}/${handle.id}/${drive.measure}`).toBeLessThan(
            Math.max(0.01, Math.abs(aimedMeasure) * 1e-6),
          );
        }
      }
    }
  });
});

/** Position atteignant une mesure visée, les autres composantes inchangées. */
function targetFor(handle: EditableHandle, measure: string, aimed: number) {
  const { position, anchor } = handle;
  switch (measure) {
    case "axisX":
      return { x: anchor.x + aimed, y: position.y };
    case "axisY":
      return { x: position.x, y: anchor.y + aimed };
    case "radius": {
      const angle = Math.atan2(position.y - anchor.y, position.x - anchor.x);
      return { x: anchor.x + aimed * Math.cos(angle), y: anchor.y + aimed * Math.sin(angle) };
    }
    default: {
      const radius = Math.hypot(position.x - anchor.x, position.y - anchor.y);
      const radians = (aimed * Math.PI) / 180;
      return { x: anchor.x + radius * Math.cos(radians), y: anchor.y + radius * Math.sin(radians) };
    }
  }
}

describe("désignation d'une poignée", () => {
  it("ignore les poignées en lecture seule", () => {
    const { handles } = handlesFor("arch-full-round");
    const springing = handles.find((handle) => handle.entityId === "A")!;
    expect(springing.editable).toBe(false);
    expect(nearestEditableHandle(handles, springing.position, 50)).toBeNull();
  });

  it("retient la poignée éditable la plus proche dans la tolérance", () => {
    const { handles } = handlesFor("arch-full-round");
    const crown = handles.find((handle) => handle.entityId === "S")!;
    expect(nearestEditableHandle(handles, { x: crown.position.x + 3, y: crown.position.y - 2 }, 20)?.entityId).toBe("S");
    expect(nearestEditableHandle(handles, { x: crown.position.x + 300, y: crown.position.y }, 20)).toBeNull();
  });
});
