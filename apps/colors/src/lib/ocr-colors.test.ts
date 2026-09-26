import { describe,expect,it,vi } from "vitest";
import { analyserEtiquetteColors } from "@/lib/ocr-colors";
describe("OCR assisté Colors",()=>{
  it("impose toujours la confirmation",async()=>{
    const analyser=vi.fn().mockResolvedValue({statut:"confirmee",champs:{marque:{valeur:"Sto",confiance:92}}});
    await expect(analyserEtiquetteColors({analyser},{mime:"image/jpeg",bytes:new Uint8Array([1])})).resolves.toMatchObject({statut:"a_confirmer"});
  });
  it("propage une erreur contrôlable",async()=>{
    const analyser=vi.fn().mockRejectedValue(new Error("OCR indisponible"));
    await expect(analyserEtiquetteColors({analyser},{mime:"image/jpeg",bytes:new Uint8Array([1])})).rejects.toThrow("OCR indisponible");
  });
});
