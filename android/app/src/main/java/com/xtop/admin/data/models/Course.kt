package com.xtop.admin.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Course(
    val id: String? = null,
    @SerialName("course_code") val courseCode: String = "",
    @SerialName("course_name") val courseName: String = "",
    val term: String? = null,
    val description: String? = null,
    val status: String = "OPEN",
    @SerialName("test_price") val testPrice: Double = 0.0,
    @SerialName("show_answers") val showAnswers: Boolean = false,
    val department: String? = "Automobile Workshop",
    val level: String? = "300",
    val semester: String? = "First Semester",
    val duration: String? = "15 weeks",
    @SerialName("is_archived") val isArchived: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class CourseModule(
    val id: String? = null,
    @SerialName("course_id") val courseId: String = "",
    val title: String = "",
    val description: String? = null,
    @SerialName("module_order") val moduleOrder: Int = 1,
    val status: String = "ACTIVE",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class ModuleSlide(
    val id: String? = null,
    @SerialName("module_id") val moduleId: String = "",
    val title: String = "",
    val content: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("pdf_url") val pdfUrl: String? = null,
    @SerialName("video_url") val videoUrl: String? = null,
    @SerialName("slide_order") val slideOrder: Int = 1,
    val duration: String? = null,
    val status: String = "ACTIVE",
    @SerialName("is_draft") val isDraft: Boolean = true,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class CourseQuestion(
    val id: String? = null,
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
    val status: String = "ACTIVE",
    val marks: Int = 1,
    val difficulty: String = "medium",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class Student(
    val id: String? = null,
    val phone: String = "",
    val name: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("matric_number") val matricNumber: String? = null,
    val department: String? = null,
    val level: String? = null,
    val email: String? = null,
    val status: String = "ACTIVE",
    @SerialName("registration_date") val registrationDate: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class StudentCourseAccess(
    val id: String? = null,
    @SerialName("student_id") val studentId: String = "",
    @SerialName("course_id") val courseId: String = "",
    @SerialName("access_status") val accessStatus: String = "ACTIVE",
    @SerialName("granted_at") val grantedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("granted_by") val grantedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class Attendance(
    val id: String? = null,
    @SerialName("student_id") val studentId: String = "",
    @SerialName("course_id") val courseId: String = "",
    @SerialName("session_date") val sessionDate: String = "",
    @SerialName("session_label") val sessionLabel: String = "Regular",
    val phone: String? = null,
    @SerialName("recorded_at") val recordedAt: String? = null
)

@Serializable
data class Exam(
    val id: String? = null,
    @SerialName("course_id") val courseId: String = "",
    @SerialName("module_id") val moduleId: String? = null,
    @SerialName("exam_title") val examTitle: String = "",
    val description: String? = null,
    @SerialName("question_count") val questionCount: Int = 10,
    @SerialName("duration_minutes") val durationMinutes: Int = 30,
    @SerialName("pass_mark_percent") val passMarkPercent: Int = 50,
    @SerialName("marks_per_question") val marksPerQuestion: Int = 1,
    @SerialName("randomize_questions") val randomizeQuestions: Boolean = true,
    @SerialName("randomize_options") val randomizeOptions: Boolean = false,
    @SerialName("show_answers") val showAnswers: Boolean = true,
    @SerialName("allow_retake") val allowRetake: Boolean = true,
    val status: String = "DRAFT",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class ExamAttempt(
    val id: String? = null,
    @SerialName("student_id") val studentId: String = "",
    @SerialName("exam_id") val examId: String = "",
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    val score: Int = 0,
    @SerialName("total_marks") val totalMarks: Int = 0,
    val percentage: Double = 0.0,
    @SerialName("pass_status") val passStatus: String = "PENDING",
    @SerialName("is_locked") val isLocked: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class ExamAnswer(
    val id: String? = null,
    @SerialName("attempt_id") val attemptId: String = "",
    @SerialName("question_id") val questionId: String? = null,
    @SerialName("student_answer") val studentAnswer: String? = null,
    @SerialName("correct_answer") val correctAnswer: String? = null,
    @SerialName("marks_obtained") val marksObtained: Int = 0,
    @SerialName("is_correct") val isCorrect: Boolean = false
)

@Serializable
data class Result(
    val id: String? = null,
    @SerialName("student_id") val studentId: String = "",
    @SerialName("course_id") val courseId: String = "",
    @SerialName("cbt_score") val cbtScore: Double = 0.0,
    @SerialName("essay_score") val essayScore: Double = 0.0,
    @SerialName("total_score") val totalScore: Double = 0.0,
    val percentage: Double = 0.0,
    val status: String = "PENDING",
    @SerialName("calculated_at") val calculatedAt: String? = null,
    @SerialName("released_at") val releasedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class CourseMaterial(
    val id: String? = null,
    @SerialName("course_id") val courseId: String? = null,
    @SerialName("module_id") val moduleId: String? = null,
    @SerialName("slide_id") val slideId: String? = null,
    @SerialName("file_name") val fileName: String = "",
    @SerialName("file_type") val fileType: String = "image",
    @SerialName("file_url") val fileUrl: String = "",
    @SerialName("storage_path") val storagePath: String? = null,
    @SerialName("uploaded_by") val uploadedBy: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class AdminUser(
    val id: String? = null,
    val username: String = "",
    @SerialName("full_name") val fullName: String? = null,
    val phone: String? = null,
    val role: String = "VIEWER",
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class AuditLog(
    val id: String? = null,
    @SerialName("admin_user") val adminUser: String = "system",
    val action: String = "",
    val entity: String = "",
    @SerialName("entity_id") val entityId: String? = null,
    val metadata: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class BotActivity(
    val id: String? = null,
    @SerialName("student_phone") val studentPhone: String? = null,
    @SerialName("student_name") val studentName: String? = null,
    @SerialName("course_code") val courseCode: String? = null,
    @SerialName("event_type") val eventType: String = "",
    @SerialName("event_detail") val eventDetail: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class ExamConfig(
    val id: String? = null,
    @SerialName("course_id") val courseId: String = "",
    @SerialName("question_count") val questionCount: Int = 10,
    @SerialName("pass_mark_percent") val passMarkPercent: Int = 50,
    @SerialName("randomize_questions") val randomizeQuestions: Boolean = true,
    @SerialName("randomize_options") val randomizeOptions: Boolean = false,
    @SerialName("show_answers") val showAnswers: Boolean = true,
    @SerialName("allow_retake") val allowRetake: Boolean = true,
    @SerialName("time_limit_minutes") val timeLimitMinutes: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)
// ── MANUAL COURSE EDITOR MODELS ──

@Serializable
data class LessonSection(
    val id: String? = null,
    @SerialName("lesson_id") val lessonId: String = "",
    val title: String = "",
    val content: String? = null,
    @SerialName("order_index") val orderIndex: Int = 1,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class LessonMedia(
    val id: String? = null,
    @SerialName("lesson_id") val lessonId: String = "",
    @SerialName("media_type") val mediaType: String = "image",
    @SerialName("file_url") val fileUrl: String = "",
    val caption: String? = null,
    val description: String? = null,
    @SerialName("alt_text") val altText: String? = null,
    @SerialName("order_index") val orderIndex: Int = 1,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class LessonMaterial(
    val id: String? = null,
    @SerialName("lesson_id") val lessonId: String = "",
    val title: String = "",
    @SerialName("file_url") val fileUrl: String = "",
    @SerialName("file_type") val fileType: String = "pdf",
    val description: String? = null,
    @SerialName("order_index") val orderIndex: Int = 1,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class LessonPracticeQuestion(
    val id: String? = null,
    @SerialName("lesson_id") val lessonId: String = "",
    val question: String = "",
    @SerialName("question_type") val questionType: String = "mcq",
    val options: String = "[]",
    @SerialName("correct_answer") val correctAnswer: String = "A",
    val explanation: String? = null,
    val difficulty: String = "medium",
    val marks: Int = 1,
    @SerialName("order_index") val orderIndex: Int = 1,
    val status: String = "ACTIVE",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class CourseSettings(
    @SerialName("course_id") val courseId: String = "",
    @SerialName("sequential_lessons") val sequentialLessons: Boolean = true,
    @SerialName("allow_skip") val allowSkip: Boolean = false,
    @SerialName("require_practice") val requirePractice: Boolean = false,
    @SerialName("practice_pass_score") val practicePassScore: Int = 50,
    @SerialName("require_final_cbt") val requireFinalCbt: Boolean = true,
    @SerialName("cbt_pass_score") val cbtPassScore: Int = 50,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class CourseRevision(
    val id: String? = null,
    @SerialName("entity_type") val entityType: String = "",
    @SerialName("entity_id") val entityId: String = "",
    val action: String = "",
    @SerialName("previous_data") val previousData: String? = null,
    @SerialName("new_data") val newData: String? = null,
    @SerialName("changed_by") val changedBy: String = "admin",
    @SerialName("created_at") val createdAt: String? = null
)
