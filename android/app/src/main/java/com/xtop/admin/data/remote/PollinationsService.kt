package com.xtop.admin.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
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
    private val httpClient = HttpClient(Android)
    private val jsonParser = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    /**
     * Generates a complete course, lesson explanation, image prompt, and custom number of CBT questions.
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

        val systemPrompt = """
            You are an expert university engineering and technical lecturer.
            Create curriculum content for:
            - Course Code: $resolvedCourseCode
            - Course Name: $resolvedCourseName
            - Lesson Number: Lesson $lessonNumber
            - Lesson Topic: $topicPrompt
            - Number of CBT Questions: $questionCount

            Return ONLY raw valid JSON (no markdown formatting, no ```json codeblocks) in this exact schema:
            {
              "course_code": "$resolvedCourseCode",
              "course_name": "$resolvedCourseName",
              "term": "First Semester",
              "description": "2-sentence overview of the course.",
              "lesson_title": "Lesson $lessonNumber: $topicPrompt",
              "lesson_content": "Comprehensive lecture notes formatted cleanly for WhatsApp with bold headers, bullet points, emojis, key concepts, and practical applications.",
              "image_prompt": "Clean engineering schematic blueprint illustration of $topicPrompt, technical diagram",
              "questions": [
                {
                  "question": "Clear multiple choice question?",
                  "option_a": "First option",
                  "option_b": "Second option",
                  "option_c": "Third option",
                  "option_d": "Fourth option",
                  "correct_answer": "A",
                  "explanation": "Why this answer is correct"
                }
              ]
            }
        """.trimIndent()

        val response = httpClient.post("https://text.pollinations.ai/") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"messages": [{"role": "system", "content": ${Json.encodeToString(kotlinx.serialization.serializer(), systemPrompt)}}, {"role": "user", "content": ${Json.encodeToString(kotlinx.serialization.serializer(), "Generate lesson $lessonNumber on $topicPrompt with $questionCount questions for $resolvedCourseCode.")}}], "jsonMode": true}"""
            )
        }.bodyAsText()

        val cleanJson = response
            .replace("```json", "")
            .replace("```", "")
            .trim()

        val jsonStart = cleanJson.indexOf('{')
        val jsonEnd = cleanJson.lastIndexOf('}')
        val parsedJson = if (jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart) {
            cleanJson.substring(jsonStart, jsonEnd + 1)
        } else {
            cleanJson
        }

        return jsonParser.decodeFromString<GeneratedCourse>(parsedJson)
    }

    /**
     * Builds a direct Pollinations Image URL for diagram/slide display.
     */
    fun getImageUrl(prompt: String): String {
        val cleanPrompt = if (prompt.isNotBlank()) prompt else "engineering technical diagram blueprint"
        val encoded = URLEncoder.encode("$cleanPrompt, technical engineering blueprint, clean 4k diagram", StandardCharsets.UTF_8.toString())
        return "https://image.pollinations.ai/prompt/$encoded?width=1024&height=1024&nologo=true"
    }
}
