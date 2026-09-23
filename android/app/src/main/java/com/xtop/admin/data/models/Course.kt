package com.xtop.admin.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Course(
    val id: String = "",
    @SerialName("course_code") val courseCode: String = "",
    @SerialName("course_name") val courseName: String = "",
    val term: String? = null,
    val description: String? = null,
    val status: String = "OPEN",
    @SerialName("test_price") val testPrice: Double = 0.0,
    @SerialName("show_answers") val showAnswers: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class CourseModule(
    val id: String = "",
    @SerialName("course_id") val courseId: String = "",
    val title: String = "",
    val description: String? = null,
    @SerialName("module_order") val moduleOrder: Int = 1,
    val status: String = "ACTIVE",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class ModuleSlide(
    val id: String = "",
    @SerialName("module_id") val moduleId: String = "",
    val title: String = "",
    val content: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("pdf_url") val pdfUrl: String? = null,
    @SerialName("video_url") val videoUrl: String? = null,
    @SerialName("slide_order") val slideOrder: Int = 1,
    val duration: String? = null,
    val status: String = "ACTIVE"
)

@Serializable
data class CourseQuestion(
    val id: String = "",
    @SerialName("course_id") val courseId: String = "",
    @SerialName("module_id") val moduleId: String? = null,
    val question: String = "",
    @SerialName("option_a") val optionA: String = "",
    @SerialName("option_b") val optionB: String = "",
    @SerialName("option_c") val optionC: String = "",
    @SerialName("option_d") val optionD: String = "",
    @SerialName("correct_answer") val correctAnswer: String = "A",
    val explanation: String? = null,
    @SerialName("question_order") val questionOrder: Int = 1,
    val status: String = "ACTIVE"
)

@Serializable
data class ExamConfig(
    val id: String = "",
    @SerialName("course_id") val courseId: String = "",
    @SerialName("question_count") val questionCount: Int = 10,
    @SerialName("pass_mark_percent") val passMarkPercent: Int = 50,
    @SerialName("randomize_questions") val randomizeQuestions: Boolean = true,
    @SerialName("randomize_options") val randomizeOptions: Boolean = false,
    @SerialName("show_answers") val showAnswers: Boolean = true,
    @SerialName("allow_retake") val allowRetake: Boolean = true,
    @SerialName("time_limit_minutes") val timeLimitMinutes: Int? = null
)

@Serializable
data class Student(
    val id: String = "",
    val phone: String = "",
    val name: String? = null,
    @SerialName("matric_number") val matricNumber: String? = null,
    val department: String? = null,
    val level: String? = null,
    val email: String? = null
)
