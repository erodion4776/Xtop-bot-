package com.xtop.admin.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.get
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
    val question: String,
    val option_a: String,
    val option_b: String,
    val option_c: String,
    val option_d: String,
    val correct_answer: String,
    val explanation: String
)

@Serializable
data class GeneratedCourse(
    val course_code: String,
    val course_name: String,
    val term: String,
    val description: String,
    val lesson_title: String,
    val lesson_content: String,
    val image_prompt: String,
    val questions: List<GeneratedQuestion>
)

object PollinationsService {
    private val httpClient = HttpClient(Android)
    private val jsonParser = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Generates a complete course, lesson explanation, image prompt, and CBT questions.
     */
    suspend fun generateCourseWithAI(topicPrompt: String): GeneratedCourse {
        val systemPrompt = """
            You are an expert university engineering lecturer for Nigerian universities.
            Create a course curriculum for the topic: "$topicPrompt".
            
            Return ONLY raw valid JSON (no markdown formatting, no ```json codeblocks) in this exact schema:
            {
              "course_code": "ELA305",
              "course_name": "Short Course Name",
              "term": "First Semester",
              "description": "2-sentence overview of the course.",
              "lesson_title": "Lesson 1: Key Topic",
              "lesson_content": "Comprehensive lecture notes formatted for WhatsApp with bullet points, safety rules, and engineering principles.",
              "image_prompt": "Detailed mechanical diagram prompt for image generation",
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
                """{"messages": [{"role": "system", "content": ${Json.encodeToString(kotlinx.serialization.serializer(), systemPrompt)}}, {"role": "user", "content": ${Json.encodeToString(kotlinx.serialization.serializer(), topicPrompt)}}], "jsonMode": true}"""
            )
        }.bodyAsText()

        val cleanJson = response
            .replace("```json", "")
            .replace("```", "")
            .trim()

        return jsonParser.decodeFromString<GeneratedCourse>(cleanJson)
    }

    /**
     * Builds a direct Pollinations Image URL for diagram/slide display.
     */
    fun getImageUrl(prompt: String): String {
        val encoded = URLEncoder.encode(prompt + ", technical engineering blueprint, clean 4k diagram", StandardCharsets.UTF_8.toString())
        return "https://image.pollinations.ai/prompt/$encoded?width=1024&height=1024&nologo=true"
    }
}
