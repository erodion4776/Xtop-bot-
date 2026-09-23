package com.xtop.admin.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Serializable
data class GeneratedQuestion(
    val question: String = "",
    val option_a: String = "",
    val option_b: String = "",
    val option_c: String = "",
    val option_d: String = "",
    val correct_answer: String = "A",
    val explanation: String = ""
)

@Serializable
data class GeneratedCourse(
    val course_code: String = "",
    val course_name: String = "",
    val term: String = "First Semester",
    val description: String = "",
    val lesson_title: String = "",
    val lesson_content: String = "",
    val image_prompt: String = "",
    val questions: List<GeneratedQuestion> = emptyList()
)

object PollinationsService {
    private val httpClient = HttpClient(Android) {
        install(HttpTimeout) {
            requestTimeoutMillis = 60_000
            connectTimeoutMillis = 30_000
            socketTimeoutMillis = 60_000
        }
    }

    private val jsonParser = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    /**
     * Generates a complete course, lesson explanation, image prompt, and custom CBT questions.
     */
    suspend fun generateCourseWithAI(
        topicPrompt: String,
        courseCode: String = "",
        courseName: String = "",
        lessonNumber: Int = 1,
        questionCount: Int = 5
    ): GeneratedCourse {
        val resolvedCourseCode = courseCode.trim().ifBlank { "ELA301" }
        val resolvedCourseName = courseName.trim().ifBlank { topicPrompt }
        val safeCount = questionCount.coerceIn(1, 15)

        val systemPrompt = """
            You are an expert university engineering and technical lecturer.
            Generate a concise, high-yield WhatsApp lesson and CBT exam in strict JSON format.

            Schema requirements:
            {
              "course_code": "$resolvedCourseCode",
              "course_name": "$resolvedCourseName",
              "term": "First Semester",
              "description": "Short 2-sentence summary of this course module.",
              "lesson_title": "Lesson $lessonNumber: $topicPrompt",
              "lesson_content": "Detailed classroom lecture notes formatted cleanly for WhatsApp with headers (*Title*), key bullet points, concise explanations, and real-world examples.",
              "image_prompt": "Technical schematic diagram blueprint of $topicPrompt, clean 2D engineering illustration",
              "questions": [
                {
                  "question": "Question text here?",
                  "option_a": "Option A text",
                  "option_b": "Option B text",
                  "option_c": "Option C text",
                  "option_d": "Option D text",
                  "correct_answer": "A",
                  "explanation": "Brief explanation why"
                }
              ]
            }

            Rules:
            1. Output EXACTLY $safeCount CBT questions.
            2. Keep answers and explanations concise so response completes fully.
            3. Return ONLY the JSON object, no Markdown backticks or commentary.
        """.trimIndent()

        val userPrompt = "Create Lesson $lessonNumber on '$topicPrompt' with $safeCount CBT questions for course $resolvedCourseCode ($resolvedCourseName)."

        val payload = mapOf(
            "messages" to listOf(
                mapOf("role" to "system", "content" to systemPrompt),
                mapOf("role" to "user", "content" to userPrompt)
            ),
            "model" to "openai",
            "jsonMode" to "true",
            "seed" to (1000..9999).random().toString()
        )

        val rawResponse = httpClient.post("https://text.pollinations.ai/") {
            contentType(ContentType.Application.Json)
            setBody(Json.encodeToString(payload))
        }.bodyAsText()

        val sanitizedJson = sanitizeAndRepairJson(rawResponse)

        return jsonParser.decodeFromString<GeneratedCourse>(sanitizedJson)
    }

    /**
     * Repairs truncated or unclosed JSON returned if the LLM reached output limit.
     */
    private fun sanitizeAndRepairJson(raw: String): String {
        var clean = raw
            .replace("```json", "")
            .replace("```", "")
            .trim()

        val jsonStart = clean.indexOf('{')
        if (jsonStart != -1) {
            clean = clean.substring(jsonStart)
        }

        // If JSON is already closed properly
        if (clean.endsWith("}") && clean.count { it == '{' } == clean.count { it == '}' }) {
            return clean
        }

        // Repair truncated JSON
        val buffer = StringBuilder(clean)

        // Close any unclosed string
        val quoteCount = buffer.count { it == '"' }
        if (quoteCount % 2 != 0) {
            buffer.append("\"")
        }

        // Check unclosed arrays and objects
        val openBrackets = buffer.count { it == '[' } - buffer.count { it == ']' }
        val openBraces = buffer.count { it == '{' } - buffer.count { it == '}' }

        // Remove trailing commas if cut off right after a comma
        var trimmed = buffer.toString().trimEnd()
        if (trimmed.endsWith(",")) {
            trimmed = trimmed.dropLast(1)
        }

        val repaired = StringBuilder(trimmed)
        repeat(openBrackets.coerceAtLeast(0)) { repaired.append("]") }
        repeat(openBraces.coerceAtLeast(0)) { repaired.append("}") }

        return repaired.toString()
    }

    /**
     * Builds a direct Pollinations Image URL for technical diagram generation.
     */
    fun getImageUrl(prompt: String): String {
        val cleanPrompt = if (prompt.isNotBlank()) prompt else "engineering technical diagram blueprint"
        val encoded = URLEncoder.encode("$cleanPrompt, technical engineering blueprint, clean 4k diagram", StandardCharsets.UTF_8.toString())
        return "https://image.pollinations.ai/prompt/$encoded?width=1024&height=1024&nologo=true"
    }
}
