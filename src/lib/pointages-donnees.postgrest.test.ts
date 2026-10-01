// Pointage d'équipe et planning contre un PostgREST réel plafonné à 1 000
// lignes, comparés à la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { chargerPlanningSemaine, chargerPointagesGestion, heuresParEmploye } from "@/lib/pointages-donnees";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const MARS = { debut: "2026-03-01", fin: "2026-03-31", debutIso: "2026-03-01T00:00:00+02:00", finIso: "2026-03-31T23:59:59+02:00" };
const SEMAINE = { debut: "2026-03-02", fin: "2026-03-08" };

describe.skipIf(!bancActif)("pointage et planning — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  describe.each(VOLUMES_BANC)("$volume lignes", ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    it("/pointage/gestion : pointages, sessions, contrôles GPS et heures par salarié exacts", async () => {
      const verite = veritePg<{ pointages: number; sessions: number; controles: number; heures: Record<string, number> }>(`select json_build_object(
        'pointages', (select count(*) from pointages where entreprise_id = '${e}' and date between '${MARS.debut}' and '${MARS.fin}'),
        'sessions', (select count(*) from sessions_pointage where entreprise_id = '${e}' and arrivee_at between '${MARS.debutIso}' and '${MARS.finIso}'),
        'controles', (select count(*) from verifications_zone_pointage where entreprise_id = '${e}' and created_at between '${MARS.debutIso}' and '${MARS.finIso}'),
        'heures', (select json_object_agg(employe_id, round(h * 100)) from (select employe_id, sum(heures_normales + heures_supplementaires) h from pointages where entreprise_id = '${e}' and date between '${MARS.debut}' and '${MARS.fin}' group by employe_id) t))`);
      const { pointages, sessions, verifications } = await chargerPointagesGestion(clientBanc(prefixe), e, MARS);
      expect([pointages.length, sessions.length, verifications.length]).toEqual([verite.pointages, verite.sessions, verite.controles]);
      const heures = Object.fromEntries([...heuresParEmploye(pointages)].map(([id, l]) => [id, Math.round(l.heures * 100)]));
      expect(heures).toEqual(verite.heures);
    });
    it("/planning : affectations et heures réalisées de la semaine exactes", async () => {
      const verite = veritePg<{ affectations: number; heures: number; pointages: number; realisees: number }>(`select json_build_object(
        'affectations', (select count(*) from affectations where entreprise_id = '${e}' and date between '${SEMAINE.debut}' and '${SEMAINE.fin}'),
        'heures', (select coalesce(sum(heures), 0) from affectations where entreprise_id = '${e}' and date between '${SEMAINE.debut}' and '${SEMAINE.fin}'),
        'pointages', (select count(*) from pointages where entreprise_id = '${e}' and date between '${SEMAINE.debut}' and '${SEMAINE.fin}' and verification_statut = 'valide'),
        'realisees', (select coalesce(sum(heures_normales + heures_supplementaires), 0) from pointages where entreprise_id = '${e}' and date between '${SEMAINE.debut}' and '${SEMAINE.fin}' and verification_statut = 'valide'))`);
      const { affectations, pointages } = await chargerPlanningSemaine(clientBanc(prefixe), e, SEMAINE.debut, SEMAINE.fin, null);
      expect([affectations.length, pointages.length]).toEqual([verite.affectations, verite.pointages]);
      expect(Math.round(affectations.reduce((s, a) => s + Number(a.heures), 0) * 100)).toBe(Math.round(verite.heures * 100));
      expect(Math.round(pointages.reduce((s, p) => s + Number(p.heures_normales) + Number(p.heures_supplementaires), 0) * 100)).toBe(Math.round(verite.realisees * 100));
    });
  });
  it("rien d'une autre entreprise", async () => {
    const autre = await chargerPointagesGestion(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), MARS);
    expect([autre.pointages.length, autre.sessions.length, autre.verifications.length]).toEqual([0, 0, 0]);
    const planning = await chargerPlanningSemaine(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), SEMAINE.debut, SEMAINE.fin, null);
    expect([planning.affectations.length, planning.pointages.length]).toEqual([0, 0]);
  });
});
