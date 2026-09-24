package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.*
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class AdminRepository {
    private val db by lazy { SupabaseClient.postgrest }

    // ── DASHBOARD STATS ──
    suspend fun getStudentCount(): Int =
        db.from("students").select().decodeList<Student>().size

    suspend fun getActiveCourseCount(): Int =
        db.from("courses").select { filter { eq("status", "OPEN") } }.decodeList<Course>().size

    suspend fun getTodayAttendanceCount(): Int {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        return db.from("attendance").select { filter { eq("session_date", today) } }.decodeList<Attendance>().size
    }

    suspend fun getCbtAttemptCount(): Int =
        db.from("exam_attempts").select().decodeList<ExamAttempt>().size

    suspend fun getAverageCbtScore(): Double {
        val attempts = db.from("exam_attempts").select().decodeList<ExamAttempt>()
        return if (attempts.isEmpty()) 0.0 else attempts.map { it.percentage }.average()
    }

    suspend fun getPassRate(): Double {
        val attempts = db.from("exam_attempts").select().decodeList<ExamAttempt>()
        if (attempts.isEmpty()) return 0.0
        val passed = attempts.count { it.passStatus == "PASS" }
        return (passed.toDouble() / attempts.size) * 100
    }

    suspend fun getPublishedLessonCount(): Int =
        db.from("module_slides").select { filter { eq("is_draft", false) } }.decodeList<ModuleSlide>().size

    suspend fun getActiveAccessCount(): Int =
        db.from("student_course_access").select { filter { eq("access_status", "ACTIVE") } }.decodeList<StudentCourseAccess>().size

    suspend fun getRecentStudents(): List<Student> =
        db.from("students").select { order("created_at", Order.DESCENDING) }.decodeList<Student>().take(5)

    suspend fun getRecentAttendance(): List<Attendance> =
        db.from("attendance").select { order("recorded_at", Order.DESCENDING) }.decodeList<Attendance>().take(5)

    suspend fun getRecentAttempts(): List<ExamAttempt> =
        db.from("exam_attempts").select { order("created_at", Order.DESCENDING) }.decodeList<ExamAttempt>().take(5)

    suspend fun getRecentAuditLogs(): List<AuditLog> =
        db.from("audit_logs").select { order("created_at", Order.DESCENDING) }.decodeList<AuditLog>().take(5)

    // ── ATTENDANCE ──
    suspend fun getAttendance(): List<Attendance> =
        db.from("attendance").select { order("recorded_at", Order.DESCENDING) }.decodeList<Attendance>()

    suspend fun recordAttendance(att: Attendance): Attendance =
        db.from("attendance").insert(att) { select() }.decodeSingle<Attendance>()

    // ── COURSE ACCESS ──
    suspend fun getAccessRecords(): List<StudentCourseAccess> =
        db.from("student_course_access").select().decodeList<StudentCourseAccess>()

    suspend fun grantAccess(access: StudentCourseAccess): StudentCourseAccess =
        db.from("student_course_access").insert(access) { select() }.decodeSingle<StudentCourseAccess>()

    suspend fun updateAccessStatus(accessId: String, status: String) {
        db.from("student_course_access").update(mapOf("access_status" to status)) {
            filter { eq("id", accessId) }
        }
    }

    // ── EXAMS ──
    suspend fun getExams(): List<Exam> =
        db.from("exams").select { order("created_at", Order.DESCENDING) }.decodeList<Exam>()

    suspend fun createExam(exam: Exam): Exam =
        db.from("exams").insert(exam) { select() }.decodeSingle<Exam>()

    suspend fun updateExamStatus(examId: String, status: String) {
        db.from("exams").update(mapOf("status" to status)) {
            filter { eq("id", examId) }
        }
    }

    // ── ATTEMPTS ──
    suspend fun getAttempts(): List<ExamAttempt> =
        db.from("exam_attempts").select { order("created_at", Order.DESCENDING) }.decodeList<ExamAttempt>()

    // ── RESULTS ──
    suspend fun getResults(): List<Result> =
        db.from("results").select { order("created_at", Order.DESCENDING) }.decodeList<Result>()

    suspend fun calculateAndSaveResult(studentId: String, courseId: String): Result {
        val attempts = db.from("exam_attempts").select {
            filter {
                eq("student_id", studentId)
            }
        }.decodeList<ExamAttempt>()
        val best = attempts.maxByOrNull { it.percentage }
        val cbt = best?.percentage ?: 0.0
        return db.from("results").insert(
            Result(studentId = studentId, courseId = courseId, cbtScore = cbt, totalScore = cbt, percentage = cbt, status = "PENDING")
        ) { select() }.decodeSingle<Result>()
    }

    suspend fun releaseResult(resultId: String) {
        db.from("results").update(mapOf("status" to "RELEASED")) {
            filter { eq("id", resultId) }
        }
    }

    // ── MATERIALS ──
    suspend fun getMaterials(): List<CourseMaterial> =
        db.from("course_materials").select { order("created_at", Order.DESCENDING) }.decodeList<CourseMaterial>()

    suspend fun uploadMaterial(mat: CourseMaterial): CourseMaterial =
        db.from("course_materials").insert(mat) { select() }.decodeSingle<CourseMaterial>()

    // ── ADMIN USERS ──
    suspend fun getAdminUsers(): List<AdminUser> =
        db.from("admin_users").select().decodeList<AdminUser>()

    suspend fun createAdminUser(user: AdminUser): AdminUser =
        db.from("admin_users").insert(user) { select() }.decodeSingle<AdminUser>()

    // ── AUDIT LOG ──
    suspend fun getAuditLogs(): List<AuditLog> =
        db.from("audit_logs").select { order("created_at", Order.DESCENDING) }.decodeList<AuditLog>()

    suspend fun logAction(admin: String, action: String, entity: String, entityId: String? = null) {
        db.from("audit_logs").insert(AuditLog(adminUser = admin, action = action, entity = entity, entityId = entityId))
    }

    // ── BOT ACTIVITY ──
    suspend fun getBotActivity(): List<BotActivity> =
        db.from("bot_activity").select { order("created_at", Order.DESCENDING) }.decodeList<BotActivity>()
}
