package de.appshelf.origincheck

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.coroutines.coroutineContext

data class PreparedMedia(val file:File,val preview:Bitmap,val signals:List<Signal>,val context:JSONObject,val note:String)
class MediaPreparer(private val app:Context){
 suspend fun prepare(uri:Uri,onProgress:(String)->Unit):PreparedMedia=withContext(Dispatchers.IO){
  val dir=TemporaryMedia.directory(app);val original=File.createTempFile("source-",".tmp",dir);var output:File?=null;var success=false
  try{
   onProgress("Datei wird ausschließlich lokal gelesen …")
   val declared=app.contentResolver.getType(uri)
   app.contentResolver.openInputStream(uri)?.use{input->original.outputStream().use{out->val buffer=ByteArray(65536);var total=0L;while(true){coroutineContext.ensureActive();val count=input.read(buffer);if(count<0)break;total+=count;require(total<=Limits.VIDEO_BYTES){"Die Datei ist größer als 200 MB."};out.write(buffer,0,count)}}}?:error("Datei konnte nicht geöffnet werden.")
   val head=original.inputStream().use{input->val buffer=ByteArray(minOf(original.length(),2L*1024*1024).toInt());var pos=0;while(pos<buffer.size){val n=input.read(buffer,pos,buffer.size-pos);if(n<0)break;pos+=n};buffer.copyOf(pos)}
   val mime=Rules.validateFile(declared,original.length(),head)
   val marker=Regex("c2pa|jumb|contentauth|ContentCredentials",RegexOption.IGNORE_CASE).containsMatchIn(String(head,Charsets.ISO_8859_1))
   val signals=mutableListOf(Signal("Dateisignatur","vorhanden","Erkannt: $mime. MIME-Type und Signatur sind konsistent; das beweist keine Herkunft."),Signal("Dateigröße","vorhanden","${original.length()} Bytes, innerhalb des lokalen Limits."),Signal("Content Credentials / C2PA",if(marker)"vorhanden" else "nicht gefunden",if(marker)"Möglicher Marker im begrenzten 2-MB-Scan gefunden. Signatur und Zertifikatskette sind nicht verifiziert." else "Kein Marker im begrenzten Scan. Fehlende Credentials beweisen keine KI-Erzeugung."))
   val image:Bitmap;val metadata=JSONObject().put("kind","image");val note:String
   if(mime.startsWith("video/")){
    val reader=MediaMetadataRetriever()
    try{
     reader.setDataSource(original.absolutePath)
     val duration=reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull()?.div(1000.0)?:error("Die Videodauer konnte nicht gelesen werden.")
     val times=Rules.frameTimes(duration)
     val width=reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?:0
     val height=reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?:0
     require(width>0&&height>0&&width.toLong()*height<=100_000_000){"Videoabmessungen werden nicht unterstützt."}
     image=Bitmap.createBitmap(1536,660,Bitmap.Config.ARGB_8888);val canvas=Canvas(image);canvas.drawColor(Color.rgb(18,40,60));val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.WHITE;textSize=18f}
     times.forEachIndexed{i,t->coroutineContext.ensureActive();onProgress("Video lokal: Frame ${i+1} von 6 … Noch kein Upload.")
      val frame=reader.getFrameAtTime((t*1_000_000).roundToLong(),MediaMetadataRetriever.OPTION_CLOSEST)?:error("Ein Video-Frame konnte nicht gelesen werden. Bitte ein unterstütztes MP4 wählen.")
      try{val x=(i%3)*512f;val y=(i/3)*330f;val scale=minOf(512f/frame.width,288f/frame.height);val w=frame.width*scale;val h=frame.height*scale;canvas.drawBitmap(frame,null,android.graphics.RectF(x+(512-w)/2,y+(288-h)/2,x+(512+w)/2,y+(288+h)/2),null);canvas.drawText(String.format(Locale.GERMAN,"Frame %d · %.2f s",i+1,t),x+12,y+315,paint)}finally{frame.recycle()}
     }
     metadata.put("kind","video_contact_sheet").put("originalBytes",original.length()).put("durationSeconds",duration).put("frameTimes",JSONArray(times))
     signals.add(Signal("Video-Container","vorhanden","$width × $height Pixel, $duration Sekunden, sechs verschiedene Zeitpunkte tatsächlich decodiert."))
     note="Nur sechs Standbilder werden übertragen. Kein vollständiger Bewegungsverlauf und kein Ton; Frame-Sampling ersetzt keine vollständige temporale Videoprüfung."
    }finally{reader.release()}
   }else{
    val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(original.absolutePath,bounds)
    require(bounds.outWidth>0&&bounds.outHeight>0&&bounds.outWidth.toLong()*bounds.outHeight<=100_000_000){"Bildformat oder Abmessungen werden nicht unterstützt. HEIC gegebenenfalls als JPEG exportieren."}
    val exif=runCatching{ExifInterface(original)}.getOrNull()
    val exifPresent=exif?.let{listOf(ExifInterface.TAG_MAKE,ExifInterface.TAG_MODEL,ExifInterface.TAG_SOFTWARE,ExifInterface.TAG_DATETIME_ORIGINAL).any(it::hasAttribute)}?:false
    val software=exif?.getAttribute(ExifInterface.TAG_SOFTWARE).orEmpty()
    signals.add(Signal("EXIF-Metadaten",if(exifPresent)"vorhanden" else "nicht gefunden",if(exifPresent)"Lesbare EXIF-Felder vorhanden. Diese sind veränderbar und kein Herkunftsbeweis; persönliche Werte werden nicht übertragen." else "Keine lesbaren EXIF-Felder gefunden. Das beweist keine KI-Erzeugung."))
    if(software.isNotBlank())signals.add(Signal("Software-Tag","vorhanden","Ein veränderbarer Software-Tag ist vorhanden. Er beweist weder KI-Erzeugung noch Originalität."))
    val options=BitmapFactory.Options().apply{inSampleSize=1;while(maxOf(bounds.outWidth/inSampleSize,bounds.outHeight/inSampleSize)>2048)inSampleSize*=2}
    val decoded=BitmapFactory.decodeFile(original.absolutePath,options)?:error("Bild konnte nicht decodiert werden.")
    val matrix=Matrix();when(exif?.getAttributeInt(ExifInterface.TAG_ORIENTATION,1)?:1){2->matrix.setScale(-1f,1f);3->matrix.setRotate(180f);4->matrix.setScale(1f,-1f);5->{matrix.setRotate(90f);matrix.postScale(-1f,1f)};6->matrix.setRotate(90f);7->{matrix.setRotate(270f);matrix.postScale(-1f,1f)};8->matrix.setRotate(270f)}
    image=if(matrix.isIdentity)decoded else Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,matrix,true).also{if(it!==decoded)decoded.recycle()}
    signals.add(Signal("Bildabmessungen","vorhanden","${bounds.outWidth} × ${bounds.outHeight} Pixel lesbar. Eine kleinere JPEG-Kopie wird vorbereitet."))
    note="Vorbereitetes JPEG ohne Original-EXIF. Animierte Bilder werden als Standbild behandelt. Fehlende Metadaten sind kein KI-Beweis."
   }
   coroutineContext.ensureActive();output=File.createTempFile("upload-",".jpg",dir)
   output.outputStream().use{check(image.compress(Bitmap.CompressFormat.JPEG,88,it)){"JPEG konnte nicht erstellt werden."}}
   require(output.length() in 1..Limits.IMAGE_BYTES)
   success=true;PreparedMedia(output,image,signals,metadata,note)
  }finally{original.delete();if(!success)output?.delete()}
 }
}
