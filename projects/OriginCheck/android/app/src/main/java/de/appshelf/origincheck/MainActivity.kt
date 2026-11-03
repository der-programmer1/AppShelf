package de.appshelf.origincheck

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels

class MainActivity:ComponentActivity(){
 private val model:OriginViewModel by viewModels()
 private val picker=registerForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)model.prepare(uri)}
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent{OriginApp(model){model.clearTemporary();try{picker.launch(arrayOf("image/*","video/*"))}catch(_:android.content.ActivityNotFoundException){model.editLink("")}}};if(savedInstanceState==null)receive(intent)}
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);receive(intent)}
 override fun onResume(){super.onResume();model.refreshConnection()}
 override fun onStop(){if(!isChangingConfigurations)model.abandonTemporary();super.onStop()}
 @Suppress("DEPRECATION")
 private fun receive(source:Intent?){
  if(source?.action!=Intent.ACTION_SEND||source.getBooleanExtra("origincheck-consumed",false))return
  val type=source.type.orEmpty()
  if(type.startsWith("image/")||type.startsWith("video/")){
   val uri=if(Build.VERSION.SDK_INT>=33)source.getParcelableExtra(Intent.EXTRA_STREAM,Uri::class.java) else source.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
   val selected=uri?:source.clipData?.takeIf{it.itemCount>0}?.getItemAt(0)?.uri
   if(selected!=null&&selected.scheme=="content")model.prepare(selected)
  }else if(type.startsWith("text/")){model.editLink(source.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty())}
  setIntent(Intent(source).apply{removeExtra(Intent.EXTRA_STREAM);removeExtra(Intent.EXTRA_TEXT);clipData=null;putExtra("origincheck-consumed",true)})
 }
}
