package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.*
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class CourseEditorRepository {
    private val db by lazy { SupabaseClient.postgrest }

    // ── COURSES ──
    suspend fun getCourses(): List<Course> =
        db.from("courses").select { order("course_code", Order.ASCENDING) }.decodeList<Course>()

    suspend fun getCourse(id: String): Course =
        db.from("courses").select { filter { eq("id", id) } }.decodeSingle<Course>()

    suspend fun createCourse(course: Course): Course =
        db.from("courses").insert(course) { select() }.decodeSingle<Course>()

    suspend fun updateCourse(id: String, data: Map<String, String>) {
        db.from("courses").update(data) { filter { eq("id", id) } }
    }

    suspend fun deleteCourse(id: String) {
        db.from("courses").delete { filter { eq("id", id) } }
    }

    // ── MODULES ──
    suspend fun getModules(courseId: String): List<CourseModule> =
        db.from("course_modules").select {
            filter { eq("course_id", courseId) }
            order("module_order", Order.ASCENDING)
        }.decodeList<CourseModule>()

    suspend fun createModule(module: CourseModule): CourseModule =
        db.from("course_modules").insert(module) { select() }.decodeSingle<CourseModule>()

    suspend fun updateModule(id: String, data: Map<String, String>) {
        db.from("course_modules").update(data) { filter { eq("id", id) } }
    }

    suspend fun deleteModule(id: String) {
        db.from("course_modules").delete { filter { eq("id", id) } }
    }

    // ── LESSONS (module_slides) ──
    suspend fun getLessons(moduleId: String): List<ModuleSlide> =
        db.from("module_slides").select {
            filter { eq("module_id", moduleId) }
            order("slide_order", Order.ASCENDING)
        }.decodeList<ModuleSlide>()

    suspend fun createLesson(lesson: ModuleSlide): ModuleSlide =
        db.from("module_slides").insert(lesson) { select() }.decodeSingle<ModuleSlide>()

    suspend fun updateLesson(id: String, data: Map<String, String>) {
        db.from("module_slides").update(data) { filter { eq("id", id) } }
    }

    suspend fun deleteLesson(id: String) {
        db.from("module_slides").delete { filter { eq("id", id) } }
    }

    // ── LESSON SECTIONS ──
    suspend fun getSections(lessonId: String): List<LessonSection> =
        db.from("lesson_sections").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonSection>()

    suspend fun saveSection(section: LessonSection): LessonSection =
        db.from("lesson_sections").insert(section) { select() }.decodeSingle<LessonSection>()

    suspend fun deleteSection(id: String) {
        db.from("lesson_sections").delete { filter { eq("id", id) } }
    }

    // ── LESSON MEDIA ──
    suspend fun getMedia(lessonId: String): List<LessonMedia> =
        db.from("lesson_media").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonMedia>()

    suspend fun saveMedia(media: LessonMedia): LessonMedia =
        db.from("lesson_media").insert(media) { select() }.decodeSingle<LessonMedia>()

    suspend fun deleteMedia(id: String) {
        db.from("lesson_media").delete { filter { eq("id", id) } }
    }

    // ── LESSON MATERIALS ──
    suspend fun getMaterials(lessonId: String): List<LessonMaterial> =
        db.from("lesson_materials").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonMaterial>()

    suspend fun saveMaterial(mat: LessonMaterial): LessonMaterial =
        db.from("lesson_materials").insert(mat) { select() }.decodeSingle<LessonMaterial>()

    suspend fun deleteMaterial(id: String) {
        db.from("lesson_materials").delete { filter { eq("id", id) } }
    }

    // ── PRACTICE QUESTIONS ──
    suspend fun getPracticeQuestions(lessonId: String): List<LessonPracticeQuestion> =
        db.from("lesson_practice_questions").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonPracticeQuestion>()

    suspend fun savePracticeQuestion(q: LessonPracticeQuestion): LessonPracticeQuestion =
        db.from("lesson_practice_questions").insert(q) { select() }.decodeSingle<LessonPracticeQuestion>()

    suspend fun deletePracticeQuestion(id: String) {
        db.from("lesson_practice_questions").delete { filter { eq("id", id) } }
    }

    // ── COURSE SETTINGS ──
    suspend fun getSettings(courseId: String): CourseSettings? =
        try { db.from("course_settings").select { filter { eq("course_id", courseId) } }.decodeSingle<CourseSettings>() }
        catch (_: Exception) { null }

    suspend fun saveSettings(settings: CourseSettings) {
        db.from("course_settings").upsert(settings)
    }

    // ── REVISIONS ──
    suspend fun logRevision(entityType: String, entityId: String, action: String, changedBy: String = "admin") {
        db.from("course_revisions").insert(
            CourseRevision(entityType = entityType, entityId = entityId, action = action, changedBy = changedBy)
        )
    }

    suspend fun getRevisions(entityType: String, entityId: String): List<CourseRevision> =
        db.from("course_revisions").select {
            filter {
                eq("entity_type", entityType)
                eq("entity_id", entityId)
            }
            order("created_at", Order.DESCENDING)
        }.decodeList<CourseRevision>()
}
