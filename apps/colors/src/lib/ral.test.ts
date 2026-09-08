import { describe,expect,it } from "vitest";
import { ralLePlusProche } from "@/lib/ral";
describe("proximité RAL",()=>{
  it("annonce toujours une approximation",()=>expect(ralLePlusProche("#FEFEFE",[{code:"RAL 9010",hex:"#FFFFFF"},{code:"RAL 9005",hex:"#0A0A0A"}])).toMatchObject({code:"RAL 9010",approximative:true}));
  it("ne fabrique aucun RAL sans palette autorisée",()=>expect(ralLePlusProche("#FFFFFF",[])).toBeNull());
  it("refuse un HEX invalide",()=>expect(()=>ralLePlusProche("white",[{code:"RAL 9010",hex:"#FFFFFF"}])).toThrow("HEX invalide"));
});
