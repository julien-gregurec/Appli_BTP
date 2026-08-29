import {describe,expect,it} from "vitest";
import {cheminPhotoColors,detecterMimePhotoColors,validerPhotoColors,validerSignaturePhotoColors} from "@/lib/media-colors";
describe("photos Colors",()=>{
  it("valide type et taille",()=>expect(validerPhotoColors({mime:"image/jpeg",taille:1000})).toBeNull());
  it("refuse vide, lourd et dangereux",()=>{
    expect(validerPhotoColors({mime:"image/jpeg",taille:0})).toContain("vide");
    expect(validerPhotoColors({mime:"image/jpeg",taille:11*1024*1024})).toContain("10 Mo");
    expect(validerPhotoColors({mime:"text/html",taille:100})).toContain("Format");
  });
  it("détecte les signatures JPEG, PNG, WebP et HEIC",()=>{
    expect(detecterMimePhotoColors(new Uint8Array([0xff,0xd8,0xff,0x00]))).toBe("image/jpeg");
    expect(detecterMimePhotoColors(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe("image/png");
    expect(detecterMimePhotoColors(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(detecterMimePhotoColors(new Uint8Array([0,0,0,0,102,116,121,112,104,101,105,99]))).toBe("image/heic");
  });
  it("refuse un faux MIME image et une signature discordante",()=>{
    expect(validerSignaturePhotoColors(new TextEncoder().encode("<html>dangereux</html>"),"image/jpeg").erreur).toContain("pas une image");
    expect(validerSignaturePhotoColors(new Uint8Array([137,80,78,71,13,10,26,10]),"image/jpeg").erreur).toContain("ne correspond pas");
  });
  it("construit un chemin tenant-aware depuis le type réellement détecté",()=>expect(cheminPhotoColors("org","seau","image/jpeg")).toMatch(/^org\/seau\/.+\.jpg$/));
});
