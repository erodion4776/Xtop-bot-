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

    suspend fun createCourse(course: Course): Course =
        db.from("courses").insert(course) { select() }.decodeSingle<Course>()

    suspend fun updateCourse(courseId: String, updates: Map<String, String>) {
        db.from("courses").update(updates) { filter { eq("id", courseId) } }
    }

    suspend fun updateCourse(course: Course) {
        val cId = course.id ?: return
        db.from("courses").update(course) { filter { eq("id", cId) } }
    }

    suspend fun updateCourseStatus(courseId: String, status: String) {
        db.from("courses").update({
            set("status", status)
            set("is_archived", status == "ARCHIVED")
        }) {
            filter { eq("id", courseId) }
        }
    }

    suspend fun deleteCourse(courseId: String) {
        db.from("courses").delete { filter { eq("id", courseId) } }
    }

    // ── MODULES ──
    suspend fun getModules(courseId: String): List<CourseModule> =
        db.from("course_modules").select {
            filter { eq("course_id", courseId) }
            order("module_order", Order.ASCENDING)
        }.decodeList<CourseModule>()

    suspend fun createModule(module: CourseModule): CourseModule =
        db.from("course_modules").insert(module) { select() }.decodeSingle<CourseModule>()

    suspend fun updateModule(moduleId: String, updates: Map<String, String>) {
        db.from("course_modules").update(updates) { filter { eq("id", moduleId) } }
    }

    suspend fun updateModuleStatus(moduleId: String, status: String) {
        db.from("course_modules").update({
            set("status", status)
        }) {
            filter { eq("id", moduleId) }
        }
    }

    suspend fun deleteModule(moduleId: String) {
        db.from("course_modules").delete { filter { eq("id", moduleId) } }
    }

    // ── LESSONS (module_slides) ──
    suspend fun getLessons(moduleId: String): List<ModuleSlide> =
        db.from("module_slides").select {
            filter { eq("module_id", moduleId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<ModuleSlide>()

    suspend fun createLesson(lesson: ModuleSlide): ModuleSlide =
        db.from("module_slides").insert(lesson) { select() }.decodeSingle<ModuleSlide>()

    suspend fun updateLesson(lessonId: String, updates: Map<String, String>) {
        db.from("module_slides").update(updates) { filter { eq("id", lessonId) } }
    }

    suspend fun updateLessonContent(lessonId: String, content: String) {
        db.from("module_slides").update({
            set("content", content)
        }) {
            filter { eq("id", lessonId) }
        }
    }

    suspend fun updateLessonStatus(lessonId: String, status: String, isDraft: Boolean) {
        db.from("module_slides").update({
            set("status", status)
            set("is_draft", isDraft)
        }) {
            filter { eq("id", lessonId) }
        }
    }

    suspend fun deleteLesson(lessonId: String) {
        db.from("module_slides").delete { filter { eq("id", lessonId) } }
    }

    // ── LESSON SECTIONS ──
    suspend fun getSections(lessonId: String): List<LessonSection> =
        db.from("lesson_sections").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonSection>()

    suspend fun createSection(section: LessonSection): LessonSection =
        db.from("lesson_sections").insert(section) { select() }.decodeSingle<LessonSection>()

    suspend fun deleteSection(sectionId: String) {
        db.from("lesson_sections").delete { filter { eq("id", sectionId) } }
    }

    // ── LESSON MEDIA ──
    suspend fun getMedia(lessonId: String): List<LessonMedia> =
        db.from("lesson_media").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonMedia>()

    suspend fun createMedia(media: LessonMedia): LessonMedia =
        db.from("lesson_media").insert(media) { select() }.decodeSingle<LessonMedia>()

    suspend fun deleteMedia(mediaId: String) {
        db.from("lesson_media").delete { filter { eq("id", mediaId) } }
    }

    // ── LESSON MATERIALS ──
    suspend fun getMaterials(lessonId: String): List<LessonMaterial> =
        db.from("lesson_materials").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonMaterial>()

    suspend fun createMaterial(material: LessonMaterial): LessonMaterial =
        db.from("lesson_materials").insert(material) { select() }.decodeSingle<LessonMaterial>()

    suspend fun deleteMaterial(materialId: String) {
        db.from("lesson_materials").delete { filter { eq("id", materialId) } }
    }

    // ── PRACTICE QUESTIONS ──
    suspend fun getPracticeQuestions(lessonId: String): List<LessonPracticeQuestion> =
        db.from("lesson_practice_questions").select {
            filter { eq("lesson_id", lessonId) }
            order("order_index", Order.ASCENDING)
        }.decodeList<LessonPracticeQuestion>()

    suspend fun createPracticeQuestion(q: LessonPracticeQuestion): LessonPracticeQuestion =
        db.from("lesson_practice_questions").insert(q) { select() }.decodeSingle<LessonPracticeQuestion>()

    suspend fun deletePracticeQuestion(qId: String) {
        db.from("lesson_practice_questions").delete { filter { eq("id", qId) } }
    }

    // ── REVISIONS ──
    suspend fun getRevisions(entityType: String, entityId: String): List<CourseRevision> {
        return try {
            db.from("course_revisions").select {
                filter {
                    eq("entity_type", entityType)
                    eq("entity_id", entityId)
                }
                order("created_at", Order.DESCENDING)
            }.decodeList<CourseRevision>()
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun logRevision(entityType: String, entityId: String, action: String, changedBy: String = "admin") {
        try {
            db.from("course_revisions").insert(
                CourseRevision(entityType = entityType, entityId = entityId, action = action, changedBy = changedBy)
            )
        } catch (_: Exception) {}
    }

    // ── PUBLISH HELPERS ──
    suspend fun publishCourse(courseId: String) {
        updateCourseStatus(courseId, "OPEN")
        logRevision("course", courseId, "PUBLISHED")
    }

    suspend fun unpublishCourse(courseId: String) {
        updateCourseStatus(courseId, "DRAFT")
        logRevision("course", courseId, "UNPUBLISHED")
    }

    suspend fun publishModule(moduleId: String) {
        updateModuleStatus(moduleId, "ACTIVE")
        logRevision("module", moduleId, "PUBLISHED")
    }

    suspend fun publishLesson(lessonId: String) {
        updateLessonStatus(lessonId, "ACTIVE", false)
        logRevision("lesson", lessonId, "PUBLISHED")
    }

    suspend fun unpublishLesson(lessonId: String) {
        updateLessonStatus(lessonId, "DRAFT", true)
        logRevision("lesson", lessonId, "UNPUBLISHED")
    }
}
