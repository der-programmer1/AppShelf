package de.appshelf.origincheck

import org.json.JSONObject
import java.net.URI
import java.time.Instant

object Limits { const val IMAGE_BYTES=25_000_000L;const val VIDEO_BYTES=200_000_000L;const val VIDEO_SECONDS=180.0 }
enum class Verdict(val wire:String,val label:String) {
 AI("likely_ai_generated","Wahrscheinlich KI-generiert"), CAMERA("likely_camera_original","Wahrscheinlich kamerabasiert/original"), EDITED("likely_edited_or_mixed","Wahrscheinlich bearbeitet oder gemischt"), INCONCLUSIVE("inconclusive","Nicht eindeutig bestimmbar");
 companion object { fun from(value:String)=entries.firstOrNull{it.wire==value}?:throw IllegalArgumentException("Unbekannter Verdict-Wert.") }
}
data class Signal(val title:String,val status:String,val explanation:String)
data class AnalysisResult(val verdict:Verdict,val confidenceBand:String,val summary:String,val signals:List<Signal>,val limitations:List<String>,val analyzedAt:String,val rawJson:String)
object Rules {
 fun backendUrl(value:String):String {
  val url=try{URI(value.trim())}catch(_:Exception){throw IllegalArgumentException("Bitte eine gültige HTTPS-Backend-URL eingeben.")}
  require(url.scheme=="https"&&!url.host.isNullOrBlank()&&url.rawUserInfo==null&&url.rawQuery==null&&url.rawFragment==null){"Die Backend-URL muss HTTPS verwenden und darf keine Zugangsdaten, Abfrage oder Fragment enthalten."}
  require(value.length<=2048){"Die Backend-Adresse ist zu lang."}
  return url.toASCIIString().trimEnd('/')
 }
 fun publicLink(value:String):String {
  val url=try{URI(value.trim())}catch(_:Exception){throw IllegalArgumentException("Bitte einen öffentlichen HTTPS-Link eingeben.")}
  require(url.scheme=="https"&&!url.host.isNullOrBlank()&&url.rawUserInfo==null&&url.rawFragment==null&&(url.port==-1||url.port==443)&&value.length<=2048){"Nur öffentliche HTTPS-Links ohne Zugangsdaten oder Sonderport sind erlaubt."}
  return url.toASCIIString()
 }
 const val SOCIAL_MESSAGE="Dieser Link kann nicht direkt verarbeitet werden. Teile stattdessen das Video über das Teilen-Menü oder lade die Datei hoch."
 fun isSocial(value:String):Boolean=runCatching{val h=URI(value).host?.lowercase().orEmpty();listOf("instagram.com","facebook.com","fb.watch","tiktok.com","youtube.com","youtu.be","x.com","twitter.com","threads.net","threads.com","linkedin.com","snapchat.com","reddit.com","vimeo.com","pinterest.com").any{h==it||h.endsWith(".$it")}}.getOrDefault(false)
 fun frameTimes(seconds:Double):List<Double>{require(seconds.isFinite()&&seconds>0&&seconds<=Limits.VIDEO_SECONDS){"Videos benötigen eine lesbare Dauer von höchstens 180 Sekunden."};return List(6){seconds*(it+0.5)/6}}
 fun sniff(bytes:ByteArray):String? {
  if(bytes.size<12)return null
  val t=String(bytes.copyOfRange(0,minOf(32,bytes.size)),Charsets.ISO_8859_1)
  if(bytes[0].toInt()and 255==255&&bytes[1].toInt()and 255==216&&bytes[2].toInt()and 255==255)return "image/jpeg"
  if(byteArrayOf(-119,80,78,71,13,10,26,10).indices.all{bytes[it]==byteArrayOf(-119,80,78,71,13,10,26,10)[it]})return "image/png"
  if(t.startsWith("RIFF")&&t.substring(8,12)=="WEBP")return "image/webp"
  if(t.startsWith("GIF87a")||t.startsWith("GIF89a"))return "image/gif"
  if(t.substring(4,8)=="ftyp")return when{Regex("avif|avis").containsMatchIn(t.drop(8))->"image/avif";Regex("heic|heix|hevc|mif1|msf1").containsMatchIn(t.drop(8))->"image/heic";t.drop(8).contains("qt  ")->"video/quicktime";else->"video/mp4"}
  if(bytes.take(4)==byteArrayOf(26,69,-33,-93).toList())return "video/webm"
  return null
 }
 fun validateFile(declared:String?,size:Long,head:ByteArray):String {
  val mime=sniff(head)?:throw IllegalArgumentException("Die Dateisignatur wird nicht unterstützt.")
  require(size>0&&size<=if(mime.startsWith("video/"))Limits.VIDEO_BYTES else Limits.IMAGE_BYTES){"Datei zu groß: Bilder maximal 25 MB, Videos maximal 200 MB."}
  val aliases=mapOf("image/jpg" to "image/jpeg","image/heif" to "image/heic","video/x-m4v" to "video/mp4")
  val given=declared?.substringBefore(';')?.lowercase().orEmpty()
  require(given.isBlank()||given=="application/octet-stream"||(aliases[given]?:given)==mime){"MIME-Type und Dateisignatur passen nicht zusammen."}
  return mime
 }
 fun parseResult(text:String):AnalysisResult {
  require(text.length<=256*1024){"Die Backend-Antwort ist zu groß."}
  val obj=JSONObject(text)
  require(obj.get("schemaVersion")==1&&obj.getString("providerStatus")=="ok"){"Das Backend lieferte kein gültiges Analyseergebnis."}
  val verdict=Verdict.from(obj.getString("verdict"));val band=obj.getString("confidenceBand")
  require(band in listOf("niedrig","mittel","hoch")){"Unbekanntes Vertrauensband."}
  fun field(o:JSONObject,key:String,max:Int):String {val value=o.get(key);require(value is String&&value.isNotBlank()&&value.length<=max){"Ungültiger Ergebnistext."};return value}
  val summary=field(obj,"summary",2000);val list=obj.getJSONArray("signals");require(list.length()<=30)
  val signals=List(list.length()){i->val s=list.getJSONObject(i);val status=field(s,"status",40);require(status in listOf("vorhanden","nicht gefunden","unklar"));Signal(field(s,"title",160),status,field(s,"explanation",1000))}
  val limits=obj.getJSONArray("limitations");require(limits.length() in 1..25)
  val limitations=List(limits.length()){i->limits.getString(i).also{require(it.isNotBlank()&&it.length<=1000)}}
  val analyzedAt=field(obj,"analyzedAt",60);Instant.parse(analyzedAt)
  return AnalysisResult(verdict,band,summary,signals,limitations,analyzedAt,obj.toString())
 }
}
