/** Bounded format inspection. Presence of a metadata marker is never signature verification. */
export const IMAGE_LIMIT=25_000_000;
export const VIDEO_LIMIT=200_000_000;
export const VIDEO_SECONDS=180;
const bytesText=(bytes,start=0,end=bytes.length)=>new TextDecoder('latin1').decode(bytes.subarray(start,end));
export function sniffMime(bytes) {
  if(bytes.length<12) return null;
  const text=bytesText(bytes,0,32);
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
  if(text.startsWith('GIF87a')||text.startsWith('GIF89a'))return 'image/gif';
  if(text.slice(4,8)==='ftyp') {
    if(/avif|avis/.test(text.slice(8)))return 'image/avif';
    if(/heic|heix|hevc|mif1|msf1/.test(text.slice(8)))return 'image/heic';
    return /qt  /.test(text.slice(8))?'video/quicktime':'video/mp4';
  }
  if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return 'video/webm';
  return null;
}
export function sampleTimes(seconds) {
  if(!Number.isFinite(seconds)||seconds<=0||seconds>VIDEO_SECONDS)throw new Error('Videos müssen eine lesbare Dauer von höchstens 180 Sekunden haben.');
  return Array.from({length:6},(_,i)=>seconds*(i+0.5)/6);
}
export function validateFile(type,size,bytes) {
  const actual=sniffMime(bytes);
  if(!actual)throw new Error('Die Dateisignatur wird nicht unterstützt.');
  const video=actual.startsWith('video/');
  if(!Number.isSafeInteger(size)||size<=0||size>(video?VIDEO_LIMIT:IMAGE_LIMIT))throw new Error(video?'Das Video darf höchstens 200 MB groß sein.':'Das Bild darf höchstens 25 MB groß sein.');
  const normalized=(type||'').split(';')[0].toLowerCase();
  const aliases={'image/jpg':'image/jpeg','video/x-m4v':'video/mp4','image/heif':'image/heic'};
  if(normalized && normalized!=='application/octet-stream' && (aliases[normalized]||normalized)!==actual) throw new Error('MIME-Type und Dateisignatur passen nicht zusammen.');
  return {mime:actual,isVideo:video,size};
}
export function readExif(bytes) {
  let tiff=null;
  if(sniffMime(bytes)==='image/jpeg'){
    let pos=2;
    for(let count=0;count<512&&pos+4<=bytes.length;count++){
      if(bytes[pos]!==255)break;const marker=bytes[pos+1];pos+=2;
      if(marker===0xda||marker===0xd9)break;
      const length=(bytes[pos]<<8)|bytes[pos+1];if(length<2||pos+length>bytes.length)break;
      if(marker===0xe1&&bytesText(bytes,pos+2,pos+8)==='Exif\u0000\u0000'){tiff=bytes.subarray(pos+8,pos+length);break;}
      pos+=length;
    }
  }else if(sniffMime(bytes)==='image/png'){
    let pos=8;
    for(let count=0;count<4096&&pos+12<=bytes.length;count++){
      const length=new DataView(bytes.buffer,bytes.byteOffset+pos,4).getUint32(0);if(pos+12+length>bytes.length)break;
      if(bytesText(bytes,pos+4,pos+8)==='eXIf'){tiff=bytes.subarray(pos+8,pos+8+length);break;}pos+=12+length;
    }
  }
  if(!tiff||tiff.length<8)return {present:false,fields:[],editingSoftware:false};
  const little=tiff[0]===73&&tiff[1]===73,big=tiff[0]===77&&tiff[1]===77;
  if(!little&&!big)return {present:false,fields:[],editingSoftware:false};
  const v=new DataView(tiff.buffer,tiff.byteOffset,tiff.length);
  try{
    if(v.getUint16(2,little)!==42)return {present:false,fields:[],editingSoftware:false};
    const offset=v.getUint32(4,little),count=v.getUint16(offset,little);if(count>512)throw Error();
    const fields=[];let editingSoftware=false;
    for(let i=0;i<count;i++){
      const at=offset+2+i*12,tag=v.getUint16(at,little),type=v.getUint16(at+2,little),size=v.getUint32(at+4,little);
      const names={271:'Kamerahersteller',272:'Kameramodell',274:'Orientierung',305:'Software',306:'Zeitfeld',34853:'GPS-Verweis'};
      if(names[tag])fields.push(names[tag]);
      if(tag===305&&type===2&&size>0&&size<=256){const start=size<=4?at+8:v.getUint32(at+8,little);if(start+size<=tiff.length)editingSoftware=/Photoshop|Lightroom|GIMP|Affinity|ComfyUI|Stable Diffusion/i.test(bytesText(tiff,start,start+size));}
    }
    return {present:true,fields,editingSoftware};
  }catch{return {present:false,fields:[],editingSoftware:false,malformed:true};}
}
export function inspectMetadata(bytes) {
  const scanned=bytes.subarray(0,Math.min(bytes.length,2*1024*1024));
  const text=bytesText(scanned);
  const parsedExif=readExif(scanned);
  const exif=parsedExif.present;
  const credential=/c2pa|jumb|contentauth|ContentCredentials/i.test(text);
  const editing=parsedExif.editingSoftware;
  const mime=sniffMime(bytes);
  let dimensions=null;
  if(mime==='image/png'&&bytes.length>=24){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);dimensions={width:v.getUint32(16),height:v.getUint32(20)};}
  if(mime==='image/jpeg'){
    let p=2;
    for(let segments=0;p+4<bytes.length&&segments<512;segments++){
      if(bytes[p]!==255)break;const marker=bytes[p+1];p+=2;
      if(marker===0xda||marker===0xd9)break;
      if(marker===0x00||marker===0xff||marker===0xd8)continue;
      const length=(bytes[p]<<8)|bytes[p+1];if(length<2||p+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){dimensions={width:(bytes[p+5]<<8)|bytes[p+6],height:(bytes[p+3]<<8)|bytes[p+4]};break;}
      p+=length;
    }
  }
  return {mime,exifFields:parsedExif.fields,exifPresent:exif,credentialMarkerPresent:credential,editingTagPresent:editing,dimensions,scanBytes:scanned.length,
    signals:[
      {title:'Dateisignatur',status:mime?'vorhanden':'unklar',explanation:mime?`Erkanntes Format: ${mime}. Das Format beweist keine Herkunft.`:'Das Format konnte nicht sicher gelesen werden.'},
      {title:'EXIF-/Container-Metadaten',status:exif?'vorhanden':'nicht gefunden',explanation:exif?`Lesbare TIFF/EXIF-Struktur${parsedExif.fields.length?': '+parsedExif.fields.join(', '):''}. Werte können verändert oder kopiert sein; persönliche Werte werden nicht übertragen.`:'Im begrenzten lokalen Scan kein EXIF gefunden. Das ist kein Hinweis auf KI-Erzeugung.'},
      {title:'Content Credentials / C2PA',status:credential?'vorhanden':'nicht gefunden',explanation:credential?'Ein möglicher JUMBF/C2PA-Marker ist vorhanden. Signatur, Zertifikatskette und Aussagen wurden nicht verifiziert.':'Im begrenzten Scan kein Credential-Marker gefunden. Fehlende Credentials sagen nichts über die Herkunft aus.'},
      {title:'Software-/Bearbeitungshinweis',status:editing?'vorhanden':'nicht gefunden',explanation:editing?'Ein bekannter Software-Textmarker wurde gefunden. Er ist veränderbar und kein Beweis für KI-Erzeugung.':'Kein bekannter Software-Textmarker im begrenzten Scan. Auch das ist kein Herkunftsbeweis.'},
      {title:'Metadaten-Prüfumfang',status:'vorhanden',explanation:`Maximal 2 MB der Dateistruktur untersucht (${scanned.length} Bytes). Kein vollständiger C2PA-Verifikator.`}
    ]};
}
