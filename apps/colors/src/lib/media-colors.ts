const MIME_IMAGES = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
export type MimePhotoColors = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";

export function validerPhotoColors(photo:{mime:string;taille:number}){
  if(photo.taille<=0)return "Le fichier est vide";
  if(photo.taille>10*1024*1024)return "La photo dépasse 10 Mo";
  if(!MIME_IMAGES.includes(photo.mime))return "Format d’image non pris en charge";
  return null;
}

function ascii(contenu: Uint8Array, debut: number, longueur: number) {
  return String.fromCharCode(...contenu.slice(debut, debut + longueur));
}

export function detecterMimePhotoColors(contenu: Uint8Array): MimePhotoColors | null {
  if (contenu.length >= 3 && contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) return "image/jpeg";
  if (contenu.length >= 8 && [137,80,78,71,13,10,26,10].every((octet,index) => contenu[index] === octet)) return "image/png";
  if (contenu.length >= 12 && ascii(contenu,0,4) === "RIFF" && ascii(contenu,8,4) === "WEBP") return "image/webp";
  if (contenu.length >= 12 && ascii(contenu,4,4) === "ftyp") {
    const marque = ascii(contenu,8,4).toLowerCase();
    if (["heic","heix","hevc","hevx","heim","heis"].includes(marque)) return "image/heic";
    if (["mif1","msf1","heif"].includes(marque)) return "image/heif";
  }
  return null;
}

export function validerSignaturePhotoColors(contenu: Uint8Array, mimeDeclare: string) {
  const mimeDetecte = detecterMimePhotoColors(contenu);
  if (!mimeDetecte) return { erreur: "Le contenu du fichier n’est pas une image prise en charge", mime: null };
  if (mimeDetecte !== mimeDeclare) return { erreur: "Le contenu de l’image ne correspond pas au format déclaré", mime: null };
  return { erreur: null, mime: mimeDetecte };
}

export function cheminPhotoColors(entrepriseId:string,seauId:string,mime:MimePhotoColors){
  const extensions:Record<MimePhotoColors,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"};
  return `${entrepriseId}/${seauId}/${crypto.randomUUID()}.${extensions[mime]}`;
}
