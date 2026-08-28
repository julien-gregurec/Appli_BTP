const MIME_IMAGES = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
export function validerPhotoColors(photo:{mime:string;taille:number}){
  if(photo.taille<=0)return "Le fichier est vide";
  if(photo.taille>10*1024*1024)return "La photo dépasse 10 Mo";
  if(!MIME_IMAGES.includes(photo.mime))return "Format d’image non pris en charge";
  return null;
}
export function cheminPhotoColors(entrepriseId:string,seauId:string,nom:string){
  const extension=nom.toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/)?.[1]??"jpg";
  return `${entrepriseId}/${seauId}/${crypto.randomUUID()}.${extension === "jpeg" ? "jpg" : extension}`;
}
