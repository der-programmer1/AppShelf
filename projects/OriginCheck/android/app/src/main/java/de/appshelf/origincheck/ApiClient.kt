package de.appshelf.origincheck

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.HttpsURLConnection
import kotlin.coroutines.coroutineContext

class BackendFailure(message:String):Exception(message)
class AnalysisCall {
 private val connection=AtomicReference<HttpsURLConnection?>(null)
 fun cancel(){connection.getAndSet(null)?.disconnect()}
 suspend fun execute(base:String,media:PreparedMedia?,link:String,consent:Boolean,onProgress:(String)->Unit):AnalysisResult=withContext(Dispatchers.IO){
  require(consent){"Vor dem Upload ausdrücklich zustimmen."}
  val endpoint=Rules.backendUrl(base)
  var response:HttpsURLConnection?=null
  try{
   // Check configuration only after the user asks to analyze; avoid uploading to a keyless backend.
   onProgress("Backend-Konfiguration wird geprüft … Noch keine Mediendaten übertragen.")
   val health=open(endpoint+"/health","GET");connection.set(health)
   val healthText=read(health)
   if(health.responseCode !in 200..299)throw failure(health.responseCode,healthText)
   health.disconnect();connection.set(null);coroutineContext.ensureActive()
   val path=if(media!=null)"/v1/analyze" else "/v1/analyze-link"
   response=open(endpoint+path,"POST");connection.set(response);response.doOutput=true;response.setRequestProperty("X-OriginCheck-Consent","yes")
   if(media!=null){
    require(media.file.isFile&&media.file.length() in 1..Limits.IMAGE_BYTES){"Die temporäre Datei wurde gelöscht. Bitte erneut auswählen."}
    response.setRequestProperty("Content-Type","image/jpeg")
    response.setRequestProperty("X-OriginCheck-Context",Base64.encodeToString(media.context.toString().toByteArray(Charsets.UTF_8),Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
    response.setFixedLengthStreamingMode(media.file.length())
    response.outputStream.use{out->media.file.inputStream().use{input->val buffer=ByteArray(32768);var total=0L;while(true){coroutineContext.ensureActive();val n=input.read(buffer);if(n<0)break;out.write(buffer,0,n);total+=n;onProgress("Vorbereitetes JPEG wird übertragen: ${total/1024} KB.")}}}
   }else{
    val url=Rules.publicLink(link);require(!Rules.isSocial(url)){Rules.SOCIAL_MESSAGE}
    val body=JSONObject().put("url",url).toString().toByteArray()
    response.setRequestProperty("Content-Type","application/json");response.setFixedLengthStreamingMode(body.size)
    response.outputStream.use{it.write(body)}
   }
   onProgress("Übertragung abgeschlossen. Vorsichtige Analyse läuft …")
   val body=read(response);if(response.responseCode !in 200..299)throw failure(response.responseCode,body)
   Rules.parseResult(body)
  }finally{response?.disconnect();connection.getAndSet(null)?.disconnect()}
 }
 private fun open(url:String,method:String):HttpsURLConnection {
  val conn=URL(url).openConnection() as HttpsURLConnection
  conn.requestMethod=method;conn.instanceFollowRedirects=false;conn.connectTimeout=12000;conn.readTimeout=50000;conn.useCaches=false;conn.setRequestProperty("Accept","application/json")
  return conn
 }
 private fun read(conn:HttpsURLConnection):String {
  val input=if(conn.responseCode in 200..299)conn.inputStream else conn.errorStream?:throw BackendFailure("Backend-Fehler (${conn.responseCode}).")
  return input.use{val out=java.io.ByteArrayOutputStream();val chunk=ByteArray(8192);while(true){val n=it.read(chunk);if(n<0)break;require(out.size()+n<=256*1024){"Die Backend-Antwort ist zu groß."};out.write(chunk,0,n)};out.toString(Charsets.UTF_8.name())}
 }
 private fun failure(status:Int,text:String):Exception {
  val error=runCatching{JSONObject(text).getJSONObject("error")}.getOrNull()
  if(status==503&&error?.optString("code")=="backend_not_configured")return BackendFailure("Analyse-Backend nicht konfiguriert")
  return BackendFailure(error?.optString("message")?.take(1000)?.takeIf{it.isNotBlank()}?:"Backend-Fehler ($status). Es wird keine Einschätzung angezeigt.")
 }
}
