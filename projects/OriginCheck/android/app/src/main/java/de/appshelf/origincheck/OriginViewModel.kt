package de.appshelf.origincheck

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class OriginState(val backend:String="",val link:String="",val consent:Boolean=false,val busy:Boolean=false,val prepared:PreparedMedia?=null,val result:AnalysisResult?=null,val history:List<AnalysisResult> = emptyList(),val message:String?=null,val error:String?=null,val progress:String="Wähle eine Datei oder füge einen Link ein.",val online:Boolean=true)
class OriginViewModel(app:Application):AndroidViewModel(app){
 private val prefs=app.getSharedPreferences("origincheck-settings",0)
 private val historyStore=HistoryStore(app)
 private var historyWritable=true
 private val historyMutex=Mutex()
 private val mutable=MutableStateFlow(OriginState(backend=prefs.getString("backend","").orEmpty()))
 val state=mutable.asStateFlow()
 private var task:Job?=null;private var expiry:Job?=null;private var call:AnalysisCall?=null;private var generation=0
 init{TemporaryMedia.clear(app);try{mutable.update{it.copy(history=historyStore.read())}}catch(_:Exception){historyWritable=false;mutable.update{it.copy(error="Die gespeicherte Historie konnte nicht gelesen werden. Sie wird nicht überschrieben. Du kannst sie ausdrücklich löschen.")}};refreshConnection()}
 fun refreshConnection(){val manager=getApplication<Application>().getSystemService(ConnectivityManager::class.java);val caps=manager.getNetworkCapabilities(manager.activeNetwork);mutable.update{it.copy(online=caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)==true)}}
 fun editBackend(value:String){mutable.update{it.copy(backend=value.take(2048),consent=false)}}
 fun saveBackend(){runCatching{val value=Rules.backendUrl(state.value.backend);check(prefs.edit().putString("backend",value).commit());mutable.update{it.copy(backend=value,message="Backend-Adresse lokal gespeichert.",error=null,consent=false)}}.onFailure{e->mutable.update{it.copy(error=e.message?:"Die Adresse konnte nicht gespeichert werden.")}}}
 fun clearBackend(){prefs.edit().remove("backend").apply();mutable.update{it.copy(backend="",consent=false,message="Backend-Adresse gelöscht.")}}
 fun editLink(value:String){clearTemporary();mutable.update{it.copy(link=value.take(2048),consent=false,result=null,error=if(Rules.isSocial(value))Rules.SOCIAL_MESSAGE else null,progress="Der Link wird erst nach Zustimmung übertragen.")}}
 fun consent(value:Boolean){mutable.update{it.copy(consent=value)}}
 fun clearTemporary(){generation++;task?.cancel();call?.cancel();call=null;expiry?.cancel();val old=state.value.prepared;mutable.update{it.copy(prepared=null,busy=false,consent=false)};TemporaryMedia.remove(old?.file)}
 fun cancel(){clearTemporary();mutable.update{it.copy(progress="Abgebrochen. Temporäre Daten gelöscht.")}}
 fun abandonTemporary(){clearTemporary();TemporaryMedia.clear(getApplication());mutable.update{it.copy(link="",progress="Temporäre Medien beim Verlassen gelöscht; laufende Analyse abgebrochen.")}}
 fun prepare(uri:Uri){clearTemporary();val ticket=generation;mutable.update{it.copy(link="",result=null,error=null,busy=true,progress="Lokale Vorprüfung startet. Noch kein Upload.")};task=viewModelScope.launch{
  var draft:PreparedMedia?=null
  try{draft=MediaPreparer(getApplication()).prepare(uri){message->if(ticket==generation)mutable.update{it.copy(progress=message)}}
   if(ticket==generation){mutable.update{it.copy(prepared=draft,busy=false,consent=false,progress="Lokal vorbereitet. Noch keine Cloud-Analyse.")};expiry=viewModelScope.launch{delay(10*60*1000L);if(ticket==generation){clearTemporary();mutable.update{it.copy(progress="Temporäre Daten nach zehn Minuten gelöscht. Bitte erneut auswählen.")}}}}
   else TemporaryMedia.remove(draft.file)
  }catch(_:CancellationException){TemporaryMedia.remove(draft?.file)}catch(e:Exception){TemporaryMedia.remove(draft?.file);if(ticket==generation)mutable.update{it.copy(busy=false,error=e.message?:"Die Datei konnte nicht verarbeitet werden.")}}
 }}
 fun analyze(){
  val before=state.value
  if(before.busy)return
  if(!before.consent){mutable.update{it.copy(error="Bitte der aktuellen Übertragung ausdrücklich zustimmen.")};return}
  val backend=runCatching{Rules.backendUrl(before.backend)}.getOrElse{mutable.update{it.copy(error="Analyse-Backend nicht konfiguriert")};return}
  if(before.prepared==null){runCatching{Rules.publicLink(before.link)}.onFailure{e->mutable.update{it.copy(error=e.message)};return};if(Rules.isSocial(before.link)){mutable.update{it.copy(error=Rules.SOCIAL_MESSAGE)};return}}
  val ticket=generation;val operation=AnalysisCall();call=operation;expiry?.cancel();mutable.update{it.copy(busy=true,result=null,error=null)}
  task=viewModelScope.launch{
   try{val result=operation.execute(backend,before.prepared,before.link,before.consent){message->if(ticket==generation)mutable.update{it.copy(progress=message)}};if(ticket==generation)mutable.update{it.copy(result=result,progress="Analyse abgeschlossen. Ergebnis noch nicht gespeichert.")}}
   catch(_:CancellationException){}catch(e:Exception){if(ticket==generation)mutable.update{it.copy(error=when(e){is java.net.SocketTimeoutException->"Zeitlimit erreicht. Es wurde kein Ergebnis erzeugt.";is java.net.UnknownHostException,is java.net.ConnectException->"Backend nicht erreichbar. Internet und HTTPS-Adresse prüfen.";else->e.message?:"Analyse fehlgeschlagen. Es wurde kein Ergebnis erzeugt."},progress="Keine Herkunftseinschätzung verfügbar.")}}
   finally{TemporaryMedia.remove(before.prepared?.file);operation.cancel();if(ticket==generation){call=null;mutable.update{it.copy(prepared=null,busy=false,consent=false)}}}
  }
 }
 fun saveResult(){val result=state.value.result?:return;viewModelScope.launch{historyMutex.withLock{if(!historyWritable){mutable.update{it.copy(error="Bitte die nicht lesbare Historie zuerst ausdrücklich löschen.")};return@withLock};try{val next=(listOf(result)+state.value.history).take(50);withContext(Dispatchers.IO){historyStore.write(next)};mutable.update{it.copy(history=next,message="Dieses Ergebnis wurde ausdrücklich lokal gespeichert.")}}catch(_:Exception){mutable.update{it.copy(error="Das Ergebnis konnte nicht gespeichert werden.")}}}}}
 fun openResult(result:AnalysisResult){mutable.update{it.copy(result=result)}}
 fun deleteResult(index:Int){viewModelScope.launch{historyMutex.withLock{try{val next=state.value.history.filterIndexed{i,_->i!=index};withContext(Dispatchers.IO){historyStore.write(next)};mutable.update{it.copy(history=next,message="Gespeichertes Ergebnis gelöscht.")}}catch(_:Exception){mutable.update{it.copy(error="Das gespeicherte Ergebnis konnte nicht gelöscht werden.")}}}}}
 fun clearHistory(){viewModelScope.launch{historyMutex.withLock{withContext(Dispatchers.IO){historyStore.clear()};historyWritable=true;mutable.update{it.copy(history=emptyList(),message="Gesamte gespeicherte Historie gelöscht.")}}}}
 fun clearResult(){mutable.update{it.copy(result=null,message="Angezeigtes Ergebnis aus dem Arbeitsspeicher entfernt.")}}
 fun dismissMessage(){mutable.update{it.copy(message=null)}}
 override fun onCleared(){clearTemporary();TemporaryMedia.clear(getApplication());super.onCleared()}
}
