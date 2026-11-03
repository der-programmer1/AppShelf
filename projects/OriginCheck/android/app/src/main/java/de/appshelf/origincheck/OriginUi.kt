package de.appshelf.origincheck

import androidx.compose.foundation.Image
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun OriginApp(model:OriginViewModel,onPick:()->Unit){
 val state by model.state.collectAsState()
 var screen by rememberSaveable{mutableStateOf("Prüfen")}
 val dark=isSystemInDarkTheme()
 val colors=if(dark)darkColorScheme(primary=Color(0xff99d8e4),onPrimary=Color(0xff0e2936),background=Color(0xff0e1c28),onBackground=Color(0xffe8f0f5),surface=Color(0xff132637),onSurface=Color(0xffe8f0f5),surfaceVariant=Color(0xff203e50),onSurfaceVariant=Color(0xffb7cbd4),outline=Color(0xff7390a2)) else lightColorScheme(primary=Color(0xff185b72),onPrimary=Color.White,background=Color(0xfff4f3ef),onBackground=Color(0xff152b3c),surface=Color(0xfffffefa),onSurface=Color(0xff152b3c),surfaceVariant=Color(0xffdfedf0),onSurfaceVariant=Color(0xff506775),outline=Color(0xff718b98))
 MaterialTheme(colorScheme=colors,typography=Typography(bodyLarge=androidx.compose.ui.text.TextStyle(fontSize=17.sp,lineHeight=25.sp),bodyMedium=androidx.compose.ui.text.TextStyle(fontSize=15.sp,lineHeight=22.sp),titleLarge=androidx.compose.ui.text.TextStyle(fontSize=24.sp,lineHeight=30.sp,fontWeight=FontWeight.SemiBold),headlineLarge=androidx.compose.ui.text.TextStyle(fontSize=34.sp,lineHeight=40.sp,fontWeight=FontWeight.Bold))){
  val snack=remember{SnackbarHostState()}
  LaunchedEffect(state.message){state.message?.let{snack.showSnackbar(it);model.dismissMessage()}}
  Scaffold(modifier=Modifier.imePadding(),containerColor=colors.background,
   topBar={Surface(color=colors.background){Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal=18.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically){Image(painterResource(R.drawable.ic_launcher),null,Modifier.size(43.dp));Spacer(Modifier.width(12.dp));Column{Text("OriginCheck",style=MaterialTheme.typography.titleLarge);Text("Herkunft mit Vorbehalt",style=MaterialTheme.typography.labelMedium,color=colors.onSurfaceVariant)}}}},
   bottomBar={NavigationBar(containerColor=colors.surface){listOf("Prüfen","Backend","Gespeichert").forEachIndexed{i,title->NavigationBarItem(selected=screen==title,onClick={screen=title},modifier=Modifier.testTag("tab_$i"),icon={Text(listOf("◎","⚙","▤")[i],fontSize=23.sp)},label={Text(title)})}}},snackbarHost={SnackbarHost(snack)}
  ){padding->Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(top=12.dp,bottom=36.dp).testTag("screen_scroll"),verticalArrangement=Arrangement.spacedBy(18.dp)){
   if(!state.online)Notice("Offline: Die lokale Vorprüfung bleibt verfügbar. Für die Cloud-Analyse wird eine Verbindung benötigt.")
   state.error?.let{Notice(it,true)}
   when(screen){
    "Backend"->{
     Heading("Deine Verbindung.\nDeine Entscheidung.")
     Text("Hier kommt die HTTPS-Adresse deines eingerichteten OriginCheck-Backends hinein. Kein API-Schlüssel wird in der App hinterlegt.",style=MaterialTheme.typography.bodyLarge)
     OutlinedTextField(state.backend,model::editBackend,label={Text("HTTPS-Backend-URL")},modifier=Modifier.fillMaxWidth().testTag("backend_url"),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Uri),singleLine=true)
     Button(onClick=model::saveBackend,modifier=Modifier.fillMaxWidth().heightIn(min=54.dp).testTag("backend_save")){Text("Adresse lokal speichern")}
     OutlinedButton(onClick=model::clearBackend,modifier=Modifier.fillMaxWidth().heightIn(min=50.dp)){Text("Backend-Adresse löschen")}
     Notice(if(state.backend.isBlank())"Analyse-Backend nicht konfiguriert" else "Die Adresse ist eingetragen. Erreichbarkeit und Anbieterzugang werden erst nach deinem Analyseauftrag geprüft.")
     Title("Was wird übertragen?")
     Text("Bilder werden lokal als kleineres JPEG ohne Original-EXIF vorbereitet. Bei Videos gehen nur sechs Standbilder als Kontaktbogen an dein Backend und von dort an OpenAI. Bei direkten Links lädt das Backend das öffentliche Bild; darin können Metadaten enthalten sein.")
     Text("Ohne ausdrückliche Zustimmung findet kein Upload statt. Beim Verlassen der App oder nach zehn Minuten werden temporäre Medien gelöscht. Ergebnisse bleiben nur nach deinem Tippen auf Speichern dauerhaft erhalten.")
     Text("Responses-Speicherung ist serverseitig deaktiviert. Die Datenbedingungen des Anbieters gelten dennoch; store:false garantiert keine vollständige Null-Aufbewahrung. API- und Hosting-Kosten sind möglich.")
     Title("Unabhängiges persönliches Projekt")
     Text("OriginCheck 0.1.0 ist keine offizielle Store-App. Diese APK wird außerhalb des Play Stores verteilt. Keine Nutzerkonten, Werbung oder Tracking. Für Live-Analysen ist ein eigenes, eingerichtetes Backend erforderlich.")
    }
    "Gespeichert"->{
     Heading("Nur was du\naufbewahren möchtest.")
     Text("Originalmedien und Kontaktbögen werden nicht in der Historie gespeichert. Ein Ergebnis kommt nur nach deiner ausdrücklichen Auswahl hierher.")
     if(state.history.isEmpty())Notice("Noch keine gespeicherten Ergebnisse.")
     state.history.forEachIndexed{i,result->OutlinedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Text(result.verdict.label,style=MaterialTheme.typography.titleMedium);Text("Vertrauensband: ${result.confidenceBand} · ${result.analyzedAt}",style=MaterialTheme.typography.bodyMedium);Button(onClick={model.openResult(result);screen="Prüfen"},modifier=Modifier.heightIn(min=48.dp)){Text("Ergebnis öffnen")};TextButton(onClick={model.deleteResult(i)},modifier=Modifier.heightIn(min=48.dp).testTag("history_delete_$i")){Text("Dieses Ergebnis löschen")}}}}
     OutlinedButton(onClick=model::clearHistory,modifier=Modifier.fillMaxWidth().heightIn(min=52.dp).testTag("history_clear")){Text("Gesamte Historie löschen")}
    }
    else->{
     Heading("Erst Signale prüfen.\nDann einordnen.")
     Text("Ist ein weitergeleitetes Foto synthetisch? Wurde ein Clip verändert? OriginCheck prüft zuerst die Datei lokal und liefert nach deiner Freigabe eine vorsichtige Cloud-Einschätzung. Ein Ergebnis ist eine Hypothese, kein Beweis.",style=MaterialTheme.typography.bodyLarge)
     Button(onClick=onPick,enabled=!state.busy,modifier=Modifier.fillMaxWidth().heightIn(min=58.dp).testTag("choose_media")){Text("Bild oder Video auswählen")}
     Text("Bilder bis 25 MB · Videos bis 200 MB / 180 Sekunden",style=MaterialTheme.typography.bodyMedium,color=colors.onSurfaceVariant)
     OutlinedTextField(state.link,model::editLink,label={Text("Öffentlichen HTTPS-Link einfügen")},modifier=Modifier.fillMaxWidth().testTag("link_input"),enabled=!state.busy,keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Uri),maxLines=3)
     Text("Direkte Bildlinks können unterstützt werden. Social-Media-Seiten werden nicht ausgelesen; teile stattdessen die Bild- oder Videodatei.",style=MaterialTheme.typography.bodyMedium)
     state.prepared?.let{prepared->
      Title("Lokale Vorprüfung · noch kein Urteil")
      Image(prepared.preview.asImageBitmap(),"Lokal vorbereitetes JPEG; bei Videos sechs zeitlich verteilte Frames",Modifier.fillMaxWidth().heightIn(max=320.dp))
      SignalList(prepared.signals)
      Notice(prepared.note)
     }
     Title("Bewusst zur Cloud übertragen")
     Text("Das vorbereitete JPEG oder der öffentliche Link wird an dein Backend übermittelt. Das Backend übergibt die Bilddaten an OpenAI. Ohne Freigabe gibt es keine Übertragung und keine erfundene Herkunftsbewertung.")
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top){Checkbox(checked=state.consent,onCheckedChange=model::consent,enabled=!state.busy,modifier=Modifier.testTag("upload_consent"));Text("Ich stimme dieser Übertragung für die aktuelle Analyse zu und darf die Inhalte übermitteln.",Modifier.weight(1f).padding(top=10.dp))}
     val source=state.prepared!=null||state.link.isNotBlank()
     Button(onClick=model::analyze,enabled=source&&state.consent&&!state.busy&&!Rules.isSocial(state.link),modifier=Modifier.fillMaxWidth().heightIn(min=56.dp).testTag("analyze")){Text("Vorsichtig analysieren")}
     if(state.backend.isBlank()){TextButton(onClick={screen="Backend"},modifier=Modifier.heightIn(min=48.dp)){Text("Analyse-Backend nicht konfiguriert · einrichten")}}
     Text(state.progress,style=MaterialTheme.typography.bodyMedium,modifier=Modifier.testTag("progress"))
     if(state.busy)LinearProgressIndicator(Modifier.fillMaxWidth())
     if(state.busy||state.prepared!=null)OutlinedButton(onClick=model::cancel,modifier=Modifier.fillMaxWidth().heightIn(min=50.dp).testTag("cancel")){Text("Abbrechen und temporäre Daten löschen")}
     state.result?.let{result->
      HorizontalDivider();Title("Einschätzung · kein Herkunftsbeweis")
      Text(result.verdict.label,style=MaterialTheme.typography.titleLarge,modifier=Modifier.testTag("result_verdict"))
      Notice("Vertrauensband: ${result.confidenceBand} · qualitative Einschätzung")
      Text(result.summary,style=MaterialTheme.typography.bodyLarge)
      SignalList(result.signals)
      Title("Einschränkungen")
      result.limitations.forEach{Text("• $it")}
      Text("Analysiert: ${result.analyzedAt}",style=MaterialTheme.typography.bodySmall)
      Button(onClick=model::saveResult,modifier=Modifier.fillMaxWidth().heightIn(min=54.dp).testTag("save_result")){Text("Dieses Ergebnis lokal speichern")}
      OutlinedButton(onClick=model::clearResult,modifier=Modifier.fillMaxWidth().heightIn(min=50.dp)){Text("Angezeigtes Ergebnis löschen")}
     }
     HorizontalDivider();Title("Grenzen offen benennen")
     Text("Fehlende Metadaten sind kein KI-Beweis. C2PA-/Content-Credentials-Marker werden gesucht, aber nicht kryptografisch verifiziert. Sechs Video-Frames ersetzen keine vollständige temporale Prüfung und keinen Ton. Die visuelle Modellprüfung ist kein validierter KI-Detektor; deshalb begrenzt OriginCheck 0.1.0 ihr Vertrauensband auf niedrig.")
     Text("Kein Faktencheck, keine Wahrheits- oder Urheberrechtsprüfung, keine Gesichts-, Identitäts- oder Personenerkennung.",style=MaterialTheme.typography.bodyMedium)
    }
   }
  }}
 }
}
@Composable private fun Heading(text:String){Text(text,style=MaterialTheme.typography.headlineLarge,modifier=Modifier.semantics{heading()})}
@Composable private fun Title(text:String){Text(text,style=MaterialTheme.typography.titleLarge,modifier=Modifier.semantics{heading()})}
@Composable private fun Notice(text:String,error:Boolean=false){val colors=MaterialTheme.colorScheme;OutlinedCard(Modifier.fillMaxWidth(),colors=CardDefaults.outlinedCardColors(containerColor=if(error)colors.errorContainer else colors.surfaceVariant)){Text(text,Modifier.padding(18.dp),color=if(error)colors.onErrorContainer else colors.onSurfaceVariant,style=MaterialTheme.typography.bodyMedium)}}
@Composable private fun SignalList(signals:List<Signal>){signals.forEach{signal->OutlinedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){Text("${signal.title} · ${signal.status}",fontWeight=FontWeight.SemiBold);Text(signal.explanation,style=MaterialTheme.typography.bodyMedium)}}}}
