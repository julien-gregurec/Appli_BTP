import {describe,expect,it} from "vitest";
import {cheminPhotoColors,validerPhotoColors} from "@/lib/media-colors";
describe("photos Colors",()=>{
  it("valide type et taille",()=>expect(validerPhotoColors({mime:"image/jpeg",taille:1000})).toBeNull());
  it("refuse vide, lourd et dangereux",()=>{
    expect(validerPhotoColors({mime:"image/jpeg",taille:0})).toContain("vide");
    expect(validerPhotoColors({mime:"image/jpeg",taille:11*1024*1024})).toContain("10 Mo");
    expect(validerPhotoColors({mime:"text/html",taille:100})).toContain("Format");
  });
  it("construit un chemin tenant-aware",()=>expect(cheminPhotoColors("org","seau","photo.jpeg")).toMatch(/^org\/seau\/.+\.jpg$/));
});
