package de.appshelf.aufbrauchen

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class GoldenTest(private val name: String, private val fixture: String) {
    @Test
    fun sharedScenario() {
        val c = JSONObject(fixture)
        val input = Codec.decode(c.getJSONObject("input").toString())
        val original = Codec.encode(input)
        val op = {
            if (c.getString("operation") == "saveEditor") {
                val d = c.getJSONObject("draft")
                val values = d.getJSONObject("values")
                val fields = values.keys().asSequence().associateWith { values.getString(it) }
                val editor =
                    Editor(
                        d.getString("kind"),
                        d.getString("id"),
                        d.getLong("baseRev"),
                        if (d.isNull("sourceShopId")) null else d.getString("sourceShopId"),
                        d.getLong("sourceShopRev"),
                        fields,
                    )
                Rules.saveEditor(input, editor, c.getLong("now"))
            } else
                Rules.action(
                    input,
                    c.getString("id"),
                    c.getString("operation"),
                    c.getLong("now"),
                    if (c.has("value")) c.getLong("value") else null,
                    c.optString("newId", "generated-id"),
                )
        }
        if (c.getBoolean("error")) {
            assertTrue(name, runCatching(op).isFailure)
        } else assertEquals(name,canonical(c.getJSONObject("expected")),canonical(JSONObject(Codec.encode(op()))))
        assertEquals(canonical(JSONObject(original)),canonical(JSONObject(Codec.encode(input))))
    }

    private fun canonical(value:Any?):Any?=when(value){
        null,JSONObject.NULL->null
        is JSONObject->value.keys().asSequence().associateWith{canonical(value.get(it))}.toSortedMap()
        is JSONArray->(0 until value.length()).map{canonical(value.get(it))}
        is Number->value.toLong()
        else->value
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases(): Collection<Array<String>> {
            val json =
                GoldenTest::class
                    .java
                    .classLoader!!
                    .getResourceAsStream("scenarios.json")!!
                    .bufferedReader()
                    .use { it.readText() }
            val cases = JSONObject(json).getJSONArray("cases")
            return (0 until cases.length()).map {
                val c = cases.getJSONObject(it)
                arrayOf(c.getString("name"), c.toString())
            }
        }
    }
}
