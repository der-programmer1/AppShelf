package de.appshelf.weiter

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/** All attachments are copied into the private local data, never linked to a remote service. */
object AttachmentTools {
    private const val PHOTO_LIMIT = 2 * 1024 * 1024
    private const val AUDIO_LIMIT = 3 * 1024 * 1024
    private const val PHOTO_INPUT_LIMIT = 12 * 1024 * 1024
    private val stamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")

    fun readPhoto(context: Context, uri: Uri): Attachment {
        val source = context.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val length = input.read(buffer)
                if (length < 0) break
                require(output.size().toLong() + length <= PHOTO_INPUT_LIMIT) {
                    "Das Foto ist zu groß. Bitte wähle ein Bild unter 12 MB."
                }
                output.write(buffer, 0, length)
            }
            output.toByteArray()
        } ?: throw IllegalArgumentException("Das Foto konnte nicht geöffnet werden.")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(source, 0, source.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0 &&
            bounds.outWidth.toLong() * bounds.outHeight <= 120_000_000L) {
            "Dieses Bildformat oder diese Bildgröße wird nicht unterstützt."
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = 1
            while (maxOf(bounds.outWidth / inSampleSize, bounds.outHeight / inSampleSize) > 1600) inSampleSize *= 2
        }
        var image = BitmapFactory.decodeByteArray(source, 0, source.size, options)
            ?: throw IllegalArgumentException("Das Foto konnte nicht gelesen werden.")
        try {
            val orientation = try {
                ExifInterface(ByteArrayInputStream(source)).getAttributeInt(ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL)
            } catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
                ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
                ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(270f); matrix.postScale(-1f, 1f) }
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
            }
            if (!matrix.isIdentity) {
                val rotated = Bitmap.createBitmap(image, 0, 0, image.width, image.height, matrix, true)
                if (rotated !== image) { image.recycle(); image = rotated }
            }
            val output = ByteArrayOutputStream()
            var quality = 88
            do {
                output.reset()
                check(image.compress(Bitmap.CompressFormat.JPEG, quality, output)) { "Das Foto konnte nicht gespeichert werden." }
                quality -= 12
            } while (output.size() > PHOTO_LIMIT && quality >= 40)
            require(output.size() in 1..PHOTO_LIMIT) { "Das Foto ist nach dem Verkleinern noch zu groß." }
            return Attachment(UUID.randomUUID().toString(), "Foto-${LocalDateTime.now().format(stamp)}.jpg",
                "image/jpeg", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))
        } finally { image.recycle() }
    }

    /** Returns a prepared recorder. The activity starts it, then stops/releases on pause or completion. */
    @Suppress("DEPRECATION")
    fun createRecorder(context: Context, file: File): MediaRecorder {
        require(file.canonicalPath.startsWith(context.cacheDir.canonicalPath + File.separator)) {
            "Der Aufnahmeort ist nicht verfügbar."
        }
        val recorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioEncodingBitRate(64_000)
            recorder.setAudioSamplingRate(44_100)
            recorder.setMaxDuration(3 * 60 * 1000)
            recorder.setMaxFileSize(AUDIO_LIMIT.toLong())
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            return recorder
        } catch (error: Exception) {
            recorder.release()
            file.delete()
            throw IllegalArgumentException("Die Sprachnotiz konnte nicht gestartet werden. Texteingabe funktioniert weiterhin.", error)
        }
    }

    fun readAudio(file: File): Attachment {
        require(file.isFile && file.length() in 1..AUDIO_LIMIT.toLong()) {
            "Die Sprachnotiz ist leer oder größer als 3 MB."
        }
        val bytes = file.readBytes()
        require(bytes.size >= 12 && String(bytes, 4, 4, Charsets.US_ASCII) == "ftyp") {
            "Die Sprachnotiz konnte nicht gelesen werden."
        }
        val reader = MediaMetadataRetriever()
        try {
            reader.setDataSource(file.absolutePath)
            val duration = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            require(duration in 1..190_000L) { "Die Sprachnotiz hat keine gültige Dauer." }
        } finally { reader.release() }
        return Attachment(UUID.randomUUID().toString(), "Sprachnotiz-${LocalDateTime.now().format(stamp)}.m4a",
            "audio/mp4", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    fun open(context: Context, attachment: Attachment) {
        val extensions = mapOf("image/jpeg" to "jpg", "image/png" to "png", "image/webp" to "webp",
            "audio/mp4" to "m4a", "audio/3gpp" to "3gp", "audio/m4a" to "m4a", "audio/aac" to "aac",
            "audio/mpeg" to "mp3", "audio/ogg" to "ogg", "audio/wav" to "wav")
        val extension = extensions[attachment.mime] ?: throw IllegalArgumentException("Dieses Dateiformat wird nicht unterstützt.")
        val bytes = try { Base64.decode(attachment.base64, Base64.NO_WRAP) }
            catch (_: IllegalArgumentException) { throw IllegalArgumentException("Der Anhang ist beschädigt.") }
        require(bytes.size in 1..AUDIO_LIMIT) { "Der Anhang ist zu groß oder leer." }
        val directory = File(context.cacheDir, "shared-attachments").apply { mkdirs() }
        // Filenames are generated here; never turn a backup's filename into a filesystem path.
        directory.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - 24L * 60 * 60 * 1000 }
            ?.forEach { it.delete() }
        val file = File(directory, "anhang-${UUID.randomUUID()}.$extension")
        file.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, attachment.mime)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }
}
