package de.appshelf.origincheck

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import java.io.File

class HistoryStore(context:Context){
 private val file=AtomicFile(File(context.filesDir,"origincheck-results.json"))
 fun read():List<AnalysisResult>{if(!file.baseFile.exists())return emptyList();val text=file.openRead().use{input->val data=input.readBytes();require(data.size<=4*1024*1024);data.toString(Charsets.UTF_8)};val array=JSONArray(text);require(array.length()<=50);return List(array.length()){Rules.parseResult(array.getJSONObject(it).toString())}}
 fun write(results:List<AnalysisResult>){require(results.size<=50);val array=JSONArray();results.forEach{array.put(org.json.JSONObject(it.rawJson))};val bytes=array.toString().toByteArray();require(bytes.size<=4*1024*1024);val out=file.startWrite();try{out.write(bytes);file.finishWrite(out)}catch(e:Exception){file.failWrite(out);throw e}}
 fun clear(){file.delete()}
}
object TemporaryMedia {
 fun directory(context:Context)=File(context.cacheDir,"origincheck").apply{mkdirs()}
 fun clear(context:Context){directory(context).listFiles()?.filter{it.isFile}?.forEach{it.delete()}}
 fun remove(file:File?){file?.delete()}
}
