package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.CourseQuestion
import com.xtop.admin.data.models.ExamConfig
import io.github.jan.supabase.postgrest.from

class QuestionRepository {

    private val db = SupabaseClient.postgrest

    suspend fun getQuestions(courseId: String): List<CourseQuestion> {
        return db.from("course_questions")
            .select { filter { eq("course_id", courseId) } }
            .decodeList()
    }

    suspend fun createQuestion(question: CourseQuestion): CourseQuestion {
        return db.from("course_questions")
            .insert(question) { select() }
            .decodeSingle()
    }

    suspend fun updateQuestion(questionId: String, updates: Map<String, String?>) {
        db.from("course_questions").update(updates) {
            filter { eq("id", questionId) }
        }
    }

    suspend fun deleteQuestion(questionId: String) {
        db.from("course_questions").delete { filter { eq("id", questionId) } }
    }

    // ── Exam Config ──

    suspend fun getExamConfig(courseId: String): ExamConfig? {
        return try {
            db.from("course_exam_config")
                .select { filter { eq("course_id", courseId) } }
                .decodeSingleOrNull()
        } catch (e: Exception) { null }
    }

    suspend fun saveExamConfig(config: ExamConfig) {
        db.from("course_exam_config").upsert(config)
    }
}
