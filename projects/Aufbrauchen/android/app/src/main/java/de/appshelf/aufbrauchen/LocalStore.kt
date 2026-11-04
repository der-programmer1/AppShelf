package de.appshelf.aufbrauchen

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStream

class LocalStore(context: Context) {
    private val file = AtomicFile(File(context.applicationContext.filesDir, "aufbrauchen.json"))

    fun read(): State = synchronized(lock) { readLocked() }

    fun transform(change: (State) -> State): State =
        synchronized(lock) {
            val next = change(readLocked())
            val bytes = Codec.encodeState(next).toByteArray(Charsets.UTF_8)
            val out = file.startWrite()
            try {
                out.write(bytes)
                file.finishWrite(out)
            } catch (error: Exception) {
                file.failWrite(out)
                throw error
            }
            next
        }

    private fun readLocked(): State {
        val bytes =
            try {
                file.openRead().use { it.bounded(Codec.MAX_STORAGE) }
            } catch (error: FileNotFoundException) {
                if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists())
                    throw error
                return State()
            }
        return Codec.decodeState(utf8(bytes))
    }

    companion object {
        private val lock = Any()
    }
}

fun InputStream.bounded(max: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val count = read(buffer)
        if (count < 0) break
        require(out.size().toLong() + count <= max) { "Die Datei ist zu groß." }
        out.write(buffer, 0, count)
    }
    return out.toByteArray()
}

fun utf8(bytes: ByteArray): String =
    try {
        Charsets.UTF_8.newDecoder()
            .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
            .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
            .decode(java.nio.ByteBuffer.wrap(bytes))
            .toString()
    } catch (_: java.nio.charset.CharacterCodingException) {
        throw IllegalArgumentException("Die Datei enthält ungültiges UTF-8.")
    }
