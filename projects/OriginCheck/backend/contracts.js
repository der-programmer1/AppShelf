export const VERDICTS = Object.freeze({
  likely_ai_generated: 'Wahrscheinlich KI-generiert',
  likely_camera_original: 'Wahrscheinlich kamerabasiert/original',
  likely_edited_or_mixed: 'Wahrscheinlich bearbeitet oder gemischt',
  inconclusive: 'Nicht eindeutig bestimmbar'
});
export const BANDS = Object.freeze(['niedrig', 'mittel', 'hoch']);
export const SOCIAL_MESSAGE = 'Dieser Link kann nicht direkt verarbeitet werden. Teile stattdessen das Video über das Teilen-Menü oder lade die Datei hoch.';
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const resultSchema = {
  type:'object', additionalProperties:false,
  properties:{
    verdict:{type:'string',enum:Object.keys(VERDICTS)}, confidenceBand:{type:'string',enum:BANDS},
    summary:{type:'string'},
    signals:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},status:{type:'string',enum:['vorhanden','nicht gefunden','unklar']},explanation:{type:'string'}},required:['title','status','explanation']}},
    limitations:{type:'array',items:{type:'string'}}
  }, required:['verdict','confidenceBand','summary','signals','limitations']
};
function text(value,max) { return typeof value==='string' && value.trim().length>0 && value.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
export function validateProviderResult(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!==['confidenceBand','limitations','signals','summary','verdict'].sort().join(',') || !Object.hasOwn(VERDICTS,value.verdict) || !BANDS.includes(value.confidenceBand) || !text(value.summary,1600) || !Array.isArray(value.signals) || value.signals.length>12 || !Array.isArray(value.limitations) || value.limitations.length<1 || value.limitations.length>12 || !value.limitations.every(x=>text(x,800)) || !value.signals.every(s=>s&&Object.keys(s).sort().join(',')==='explanation,status,title'&&text(s.title,140)&&text(s.explanation,800)&&['vorhanden','nicht gefunden','unklar'].includes(s.status))) {
    throw new ApiError(502,'invalid_provider_response','Die Analyse lieferte kein gültiges Ergebnis. Es wird keine Einschätzung angezeigt.');
  }
  const prose=[value.summary,...value.limitations,...value.signals.map(s=>s.explanation)].join(' ');
  if(/\d+(?:[.,]\d+)?\s*(?:%|Prozent)|hundertprozentig|zweifelsfrei|mit absoluter Sicherheit/i.test(prose))throw new ApiError(502,'invalid_provider_response','Die Anbieterantwort enthält unzulässige Sicherheits- oder Prozentangaben.');
  return value;
}
export function finalizeResult(value, technical, context) {
  validateProviderResult(value);
  // A general vision model is not a calibrated forensic detector. No confidence inflation.
  const limits=[...value.limitations,
    'Eine visuelle Modellprüfung kann sich irren und ist kein Beweis für die Herkunft.',
    'Fehlende Metadaten sind kein Beweis für KI-Erzeugung.',
    'Content-Credentials-Marker werden erkannt, aber in Version 0.1.0 nicht kryptografisch verifiziert.',
    'Vertrauensbänder sind qualitative Einschätzungen, keine kalibrierten Wahrscheinlichkeiten.'
  ];
  if(context.kind==='video_contact_sheet') limits.push('Sechs Standbilder ersetzen keine vollständige temporale Videoprüfung; Ton und nicht ausgewählte Szenen wurden nicht analysiert.');
  return {schemaVersion:1,verdict:value.verdict,confidenceBand:'niedrig',summary:value.summary,
    signals:[...technical,...value.signals],limitations:[...new Set(limits)],analyzedAt:new Date().toISOString(),providerStatus:'ok'};
}
export function publicHttpsUrl(raw) {
  let url;
  try { url=new URL(raw); } catch { throw new ApiError(400,'invalid_url','Bitte eine vollständige HTTPS-URL eingeben.'); }
  if(url.protocol!=='https:' || url.username || url.password || url.hash || raw.length>2048 || !url.hostname || url.port && url.port!=='443') throw new ApiError(400,'invalid_url','Nur öffentliche HTTPS-Links ohne Zugangsdaten, Fragment oder abweichenden Port sind erlaubt.');
  return url;
}
export function backendUrl(raw) {
  let url;
  try { url=new URL(raw); } catch { throw new Error('Bitte eine gültige HTTPS-Backend-URL eingeben.'); }
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname) throw new Error('Die Backend-URL muss HTTPS verwenden und darf keine Zugangsdaten, Abfrage oder Fragment enthalten.');
  return url.href.replace(/\/+$/,'');
}
