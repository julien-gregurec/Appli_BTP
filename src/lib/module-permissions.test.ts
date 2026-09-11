import { describe, expect, it } from "vitest";
import {
  MODULE_PERMISSION_PAR_CHEMIN,
  PERMISSIONS_ACCES_ALTERNATIVES,
  droitsGestionPour,
} from "@/lib/module-permissions";

/** Droits qui ouvrent un chemin, tels que le proxy les calcule. */
function droitsAcces(pathname: string): string[] {
  const correspond = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const droitRequis = MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => correspond(c))?.[1];
  if (!droitRequis) return [];
  const alternative = Object.keys(PERMISSIONS_ACCES_ALTERNATIVES).find(correspond);
  return alternative ? PERMISSIONS_ACCES_ALTERNATIVES[alternative] : [droitRequis];
}

const CIRCUIT_COMPTABLE = ["verifier_notes_frais", "comptabiliser_notes_frais", "exporter_notes_frais", "consulter_audit_notes_frais"];

describe("notes de frais — accès de l'expert-comptable", () => {
  it.each(["/notes-frais", "/notes-frais/abc", "/notes-frais/exports", "/api/notes-frais/documents/abc", "/api/notes-frais/exports", "/api/notes-frais/abc/justificatif"])(
    "%s s'ouvre à chaque droit du circuit comptable",
    (chemin) => {
      for (const droit of CIRCUIT_COMPTABLE) expect(droitsAcces(chemin), droit).toContain(droit);
    },
  );

  it("le salarié garde l'accès à ses propres notes", () => {
    expect(droitsAcces("/notes-frais")).toContain("saisir_ses_notes_frais");
    expect(droitsAcces("/api/notes-frais/upload")).toContain("saisir_ses_notes_frais");
  });

  it("aucun droit sans rapport n'ouvre les notes de frais", () => {
    for (const intrus of ["acces_factures", "acces_exports", "acces_achats", "gerer_utilisateurs", "acces_parametres"]) {
      expect(droitsAcces("/notes-frais"), intrus).not.toContain(intrus);
    }
  });
});

describe("notes de frais — écritures laissées au proxy", () => {
  it("le contrôle et la comptabilisation (actions postées depuis /notes-frais/[id]) passent le proxy", () => {
    expect(droitsGestionPour("/notes-frais/abc")).toEqual(expect.arrayContaining(["verifier_notes_frais", "comptabiliser_notes_frais"]));
  });

  it("l'export et le journal ne donnent AUCUNE écriture", () => {
    // Exporter et consulter le journal sont des lectures : rien de plus ne doit passer.
    expect(droitsGestionPour("/notes-frais/abc")).not.toContain("exporter_notes_frais");
    expect(droitsGestionPour("/notes-frais/abc")).not.toContain("consulter_audit_notes_frais");
  });

  it("l'ouverture reste limitée aux notes de frais : ni paramètres, ni accès, ni factures", () => {
    for (const chemin of ["/parametres", "/parametres/acces", "/factures/abc"]) {
      for (const droit of CIRCUIT_COMPTABLE) expect(droitsGestionPour(chemin), `${chemin} ${droit}`).not.toContain(droit);
      for (const droit of CIRCUIT_COMPTABLE) expect(droitsAcces(chemin), `${chemin} ${droit}`).not.toContain(droit);
    }
  });
});
