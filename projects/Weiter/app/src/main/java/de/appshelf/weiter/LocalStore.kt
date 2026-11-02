package de.appshelf.weiter

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException

/** Private, atomic on-device storage. All instances share one lock, including receivers. */
class LocalStore(context: Context) {
    private val file = AtomicFile(File(context.applicationContext.filesDir, "weiter-state.json"))

    fun read(): AppData = synchronized(lock) { readLocked() }

    fun write(data: AppData) = synchronized(lock) { writeLocked(data) }

    fun exportJson(data: AppData): String = BackupCodec.encode(data)

    fun transform(block: (AppData) -> AppData): AppData = synchronized(lock) {
        val updated = block(readLocked())
        writeLocked(updated)
        updated
    }

    /** Validate everything first, then merge and atomically commit. Conflicting local IDs win. */
    fun importJson(text: String): AppData {
        val incoming = BackupCodec.decode(text)
        return synchronized(lock) {
            val merged = BackupCodec.merge(readLocked(), incoming)
            writeLocked(merged)
            merged
        }
    }

    private fun readLocked(): AppData {
        val bytes = try {
            file.openRead().use { input ->
                val bytes = input.readBytesBounded(BackupCodec.MAX_JSON_BYTES)
                bytes
            }
        } catch (error: FileNotFoundException) {
            // An absent file is first use; an inaccessible existing file is a real error.
            if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists()) throw error
            return AppData()
        }
        return BackupCodec.decodeStorage(decodeUtf8(bytes))
    }

    private fun writeLocked(data: AppData) {
        // Serialization performs complete validation before startWrite can touch the old file.
        val bytes = BackupCodec.encodeStorage(data).toByteArray(Charsets.UTF_8)
        val output = file.startWrite()
        try {
            output.write(bytes)
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
    }

    companion object {
        private val lock = Any()
    }
}

internal fun java.io.InputStream.readBytesBounded(maxBytes: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    var count: Int
    while (read(buffer).also { count = it } != -1) {
        require(output.size().toLong() + count <= maxBytes) { "Die Sicherungsdatei ist zu groß." }
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

internal fun decodeUtf8(bytes: ByteArray): String = try {
    Charsets.UTF_8.newDecoder()
        .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
        .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
        .decode(java.nio.ByteBuffer.wrap(bytes)).toString()
} catch (_: java.nio.charset.CharacterCodingException) {
    throw IllegalArgumentException("Die Datei enthält ungültige UTF-8-Daten.")
}
