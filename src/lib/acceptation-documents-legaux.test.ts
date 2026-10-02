import { describe, expect, it, vi } from "vitest";
import { exigerAcceptationConditions, MESSAGE_ACCEPTATION_INDISPONIBLE } from "./acceptation-documents-legaux";
import {
  CHAMP_ACCEPTATION,
  CHAMP_ACCEPTATION_VERSIONS,
  MESSAGE_ACCEPTATION_MANQUANTE,
  versionsAfficheesSerialisees,
} from "./documents-legaux-versions";

type Reponse = { data?: unknown; error?: unknown };

function clientSimule(reponses: Record<string, Reponse>) {
  const rpc = vi.fn(async (nom: string) => ({ data: null, error: null, ...reponses[nom] }));
  return { rpc } as unknown as Parameters<typeof exigerAcceptationConditions>[0] & { rpc: typeof rpc };
}

function formulaire(coche: boolean) {
  const fd = new FormData();
  fd.set(CHAMP_ACCEPTATION_VERSIONS, versionsAfficheesSerialisees());
  if (coche) fd.set(CHAMP_ACCEPTATION, "on");
  return fd;
}

describe("exigerAcceptationConditions", () => {
  it("case non cochée : refus sans aucun appel à la base", async () => {
    const client = clientSimule({});
    expect(await exigerAcceptationConditions(client, formulaire(false), "e1", "souscription_abonnement")).toEqual({ ok: false, message: MESSAGE_ACCEPTATION_MANQUANTE });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("acceptation enregistrée puis plus rien à accepter : autorisé", async () => {
    const client = clientSimule({ accepter_documents_legaux: { data: 3 }, documents_legaux_a_accepter: { data: [] } });
    expect(await exigerAcceptationConditions(client, formulaire(true), "e1", "souscription_abonnement")).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenNthCalledWith(1, "accepter_documents_legaux", expect.objectContaining({ p_entreprise_id: "e1", p_contexte: "souscription_abonnement" }));
    expect(client.rpc).toHaveBeenNthCalledWith(2, "documents_legaux_a_accepter", { p_entreprise_id: "e1" });
  });

  it("refus de la base (version périmée, poste, autre entreprise) : bloqué", async () => {
    const client = clientSimule({ accepter_documents_legaux: { error: { code: "42501" } } });
    expect(await exigerAcceptationConditions(client, formulaire(true), "e1", "souscription_abonnement")).toEqual({ ok: false, message: MESSAGE_ACCEPTATION_INDISPONIBLE });
  });

  it("document restant à accepter : bloqué", async () => {
    const client = clientSimule({ accepter_documents_legaux: { data: 1 }, documents_legaux_a_accepter: { data: [{ code: "cgv" }] } });
    expect((await exigerAcceptationConditions(client, formulaire(true), "e1", "souscription_abonnement")).ok).toBe(false);
  });

  it("lecture impossible : fail-closed", async () => {
    const client = clientSimule({ accepter_documents_legaux: { data: 0 }, documents_legaux_a_accepter: { error: { message: "réseau" } } });
    expect((await exigerAcceptationConditions(client, formulaire(true), "e1", "souscription_abonnement")).ok).toBe(false);
  });
});
