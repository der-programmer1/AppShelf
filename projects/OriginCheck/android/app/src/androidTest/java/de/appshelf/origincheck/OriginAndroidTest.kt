package de.appshelf.origincheck

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
@androidx.test.filters.SdkSuppress(minSdkVersion=29)
class OriginAndroidTest {
 @get:Rule val ui=createEmptyComposeRule()
 private val context:Context=ApplicationProvider.getApplicationContext()
 private val media=mutableListOf<Uri>()
 private var scenario:ActivityScenario<MainActivity>?=null
 @Before fun resetOwnApp(){HistoryStore(context).clear();TemporaryMedia.clear(context);context.getSharedPreferences("origincheck-settings",0).edit().clear().commit()}
 @After fun clean(){scenario?.close();media.forEach{context.contentResolver.delete(it,null,null)};TemporaryMedia.clear(context)}
 private fun image():Uri {val bmp=Bitmap.createBitmap(80,60,Bitmap.Config.ARGB_8888);bmp.eraseColor(Color.rgb(26,80,120));val out=java.io.ByteArrayOutputStream();bmp.compress(Bitmap.CompressFormat.PNG,100,out);bmp.recycle();return create("image/png","png",out.toByteArray())}
 private fun create(mime:String,ext:String,bytes:ByteArray):Uri{val values=ContentValues().apply{put(MediaStore.MediaColumns.DISPLAY_NAME,"OriginCheck-test-${System.nanoTime()}.$ext");put(MediaStore.MediaColumns.MIME_TYPE,mime)};val uri=context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)!!;media.add(uri);context.contentResolver.openOutputStream(uri)!!.use{it.write(bytes)};return uri}
 @Test fun actualImagePrecheckDeletesTemporaryOriginalAndExplicitClearDeletesPreparedFile()=runBlocking{
  val prepared=MediaPreparer(context).prepare(image()){}
  assertTrue(prepared.file.exists());assertEquals("image/jpeg",Rules.sniff(prepared.file.readBytes().take(32).toByteArray()));assertTrue(prepared.signals.any{it.title=="EXIF-Metadaten"});assertFalse(TemporaryMedia.directory(context).listFiles().orEmpty().any{it.name.startsWith("source-")});TemporaryMedia.remove(prepared.file);assertFalse(prepared.file.exists())
 }
 @Test fun actualVideoDecodesSixFramesAtDifferentTimes()=runBlocking{
  val bytes=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.assets.open("video.mp4").use{it.readBytes()};val prepared=MediaPreparer(context).prepare(create("video/mp4","mp4",bytes)){}
  assertEquals("video_contact_sheet",prepared.context.getString("kind"));val times=prepared.context.getJSONArray("frameTimes");assertEquals(6,times.length());assertEquals(6,(0 until 6).map{times.getDouble(it)}.distinct().size);assertEquals(1536,prepared.preview.width);assertEquals(660,prepared.preview.height);assertTrue(prepared.note.contains("temporale"));assertFalse(TemporaryMedia.directory(context).listFiles().orEmpty().any{it.name.startsWith("source-")});TemporaryMedia.remove(prepared.file)
 }
 @Test fun shareIntentImportsImageWithoutUploadAndConsentIsInitiallyOff(){
  val intent=Intent(context,MainActivity::class.java).setAction(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,image()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
  scenario=ActivityScenario.launch(intent);var model:OriginViewModel?=null;scenario!!.onActivity{model=ViewModelProvider(it)[OriginViewModel::class.java]}
  ui.waitUntil(30000){model!!.state.value.prepared!=null&&!model!!.state.value.busy};assertFalse(model!!.state.value.consent);assertNull(model!!.state.value.result);assertTrue(model!!.state.value.history.isEmpty());val file=model!!.state.value.prepared!!.file;scenario!!.recreate();assertTrue(file.exists());assertNotNull(model!!.state.value.prepared);scenario!!.close();scenario=null;ui.waitUntil(10000){!file.exists()}
 }
 @Test fun emptyNoBackendAndSocialLinkNeverProduceFakeResults(){
  scenario=ActivityScenario.launch(MainActivity::class.java)
  ui.onNodeWithTag("link_input").performScrollTo().performTextInput("https://github.com/image.png")
  ui.onNodeWithTag("analyze").performScrollTo().assertIsNotEnabled()
  ui.onNodeWithTag("upload_consent").performScrollTo().performClick()
  ui.onNodeWithTag("analyze").performScrollTo().performClick()
  var model:OriginViewModel?=null;scenario!!.onActivity{model=ViewModelProvider(it)[OriginViewModel::class.java]};ui.waitUntil(5000){model!!.state.value.error=="Analyse-Backend nicht konfiguriert"};assertNull(model!!.state.value.result);assertTrue(model!!.state.value.history.isEmpty())
  ui.onNodeWithTag("link_input").performScrollTo().performTextReplacement("https://youtu.be/video")
  ui.waitUntil(5000){model!!.state.value.error==Rules.SOCIAL_MESSAGE};assertFalse(model!!.state.value.consent);assertNull(model!!.state.value.result)
 }
 @Test fun historyRequiresExplicitSaveAndDeletionRemovesTheActualLocalFile(){
  val store=HistoryStore(context);assertTrue(store.read().isEmpty())
  val fixture="""{"schemaVersion":1,"verdict":"inconclusive","confidenceBand":"niedrig","summary":"Ausschließlich ein lokaler Speicher-Testvertrag.","signals":[],"limitations":["Keine Live-Analyse."],"analyzedAt":"2026-11-03T08:00:00Z","providerStatus":"ok"}"""
  val result=Rules.parseResult(fixture);assertTrue(store.read().isEmpty());store.write(listOf(result));assertEquals(Verdict.INCONCLUSIVE,store.read().single().verdict);store.clear();assertTrue(store.read().isEmpty());assertFalse(File(context.filesDir,"origincheck-results.json").exists())
 }
}
