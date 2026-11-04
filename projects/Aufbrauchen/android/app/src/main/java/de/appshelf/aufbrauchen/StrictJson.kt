package de.appshelf.aufbrauchen

/** Bounded RFC 8259 syntax check, including duplicate keys and well-formed Unicode strings. */
internal class StrictJsonSyntax(private val text: String) {
    private var position = 0

    fun validate() {
        whitespace()
        value(0)
        whitespace()
        require(position == text.length) { "Die Datei enthält zusätzliche ungültige Daten." }
    }

    private fun value(depth: Int) {
        require(depth <= 12) { "Die Sicherungsdatei ist zu tief verschachtelt." }
        whitespace()
        when (peek()) {
            '{' -> objectValue(depth)
            '[' -> arrayValue(depth)
            '"' -> stringValue()
            't' -> literal("true")
            'f' -> literal("false")
            'n' -> literal("null")
            '-',
            in '0'..'9' -> number()
            else -> invalid()
        }
    }

    private fun objectValue(depth: Int) {
        position++
        whitespace()
        if (take('}')) return
        val keys = HashSet<String>()
        while (true) {
            whitespace()
            require(peek() == '"') { "Die Sicherungsdatei enthält ungültiges JSON." }
            require(keys.add(stringValue(capture = true))) {
                "Die Sicherungsdatei enthält doppelte Feldnamen."
            }
            whitespace()
            if (!take(':')) invalid()
            value(depth + 1)
            whitespace()
            if (take('}')) return
            if (!take(',')) invalid()
        }
    }

    private fun arrayValue(depth: Int) {
        position++
        whitespace()
        if (take(']')) return
        while (true) {
            value(depth + 1)
            whitespace()
            if (take(']')) return
            if (!take(',')) invalid()
        }
    }

    private fun stringValue(capture: Boolean = false): String {
        if (!take('"')) invalid()
        val decoded = if (capture) StringBuilder() else null
        var highSurrogate = false
        while (position < text.length) {
            val source = text[position++]
            if (source == '"') {
                if (highSurrogate) invalid()
                return decoded?.toString().orEmpty()
            }
            val character =
                if (source == '\\') {
                    if (position >= text.length) invalid()
                    when (text[position++]) {
                        '"' -> '"'
                        '\\' -> '\\'
                        '/' -> '/'
                        'b' -> '\b'
                        'f' -> '\u000c'
                        'n' -> '\n'
                        'r' -> '\r'
                        't' -> '\t'
                        'u' -> {
                            if (text.length - position < 4) invalid()
                            var code = 0
                            repeat(4) {
                                val digit =
                                    when (val hex = text[position++]) {
                                        in '0'..'9' -> hex - '0'
                                        in 'a'..'f' -> hex - 'a' + 10
                                        in 'A'..'F' -> hex - 'A' + 10
                                        else -> invalid()
                                    }
                                code = code * 16 + digit
                            }
                            code.toChar()
                        }
                        else -> invalid()
                    }
                } else {
                    if (source < ' ') invalid()
                    source
                }
            when {
                highSurrogate -> {
                    if (!character.isLowSurrogate()) invalid()
                    highSurrogate = false
                }
                character.isHighSurrogate() -> highSurrogate = true
                character.isLowSurrogate() -> invalid()
            }
            decoded?.append(character)
        }
        invalid()
    }

    private fun number() {
        take('-')
        if (take('0')) {
            if (peek() in '0'..'9') invalid()
        } else {
            if (peek() !in '1'..'9') invalid()
            while (peek() in '0'..'9') position++
        }
        if (take('.')) digits()
        if (take('e') || take('E')) {
            if (!take('+')) take('-')
            digits()
        }
    }

    private fun digits() {
        if (peek() !in '0'..'9') invalid()
        while (peek() in '0'..'9') position++
    }

    private fun literal(word: String) {
        if (!text.startsWith(word, position)) invalid()
        position += word.length
    }

    private fun whitespace() {
        while (peek() in charArrayOf(' ', '\t', '\n', '\r')) position++
    }

    private fun peek(): Char = text.getOrNull(position) ?: '\u0000'

    private fun take(character: Char): Boolean {
        if (peek() != character) return false
        position++
        return true
    }

    private fun invalid(): Nothing =
        throw IllegalArgumentException("Die Sicherungsdatei enthält ungültiges JSON.")
}
