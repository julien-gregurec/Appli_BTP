import {describe,expect,it} from "vitest";
import {celluleCsvColors} from "@/lib/csv-colors";

describe("export CSV Colors",()=>{
  it.each(["=1+1","+cmd","-2+3","@SUM(A1)","  =HYPERLINK(\"x\")"])("neutralise une formule %s",(valeur)=>{
    expect(celluleCsvColors(valeur)).toMatch(/^"'/);
  });
  it("conserve un nombre négatif typé",()=>expect(celluleCsvColors(-12.5)).toBe('"-12.5"'));
  it("échappe guillemets et retours ligne",()=>expect(celluleCsvColors('a"b\nc')).toBe('"a""b\nc"'));
});
