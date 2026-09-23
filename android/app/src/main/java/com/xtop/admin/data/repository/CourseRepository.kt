package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.models.CourseModule
import com.xtop.admin.data.models.ModuleSlide
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class CourseRepository {

    private val db = SupabaseClient.postgrest

    suspend fun getCourses(): List<Course> {
        return try {
            db.from("courses")
                .select {
                    order("course_code", Order.ASCENDING)
                }
                .decodeList<Course>()
        } catch (e: Exception) {
            e.printStackTrace()
            throw e
        }
    }

    suspend fun createCourse(course: Course): Course {
        return db.from("courses").insert(course) { select() }.decodeSingle<Course>()
    }

    suspend fun updateCourse(courseId: String, updates: Map<String, String>) {
        db.from("courses").update(updates) {
            filter { eq("id", courseId) }
        }
    }

    suspend fun toggleCourseStatus(courseId: String, currentStatus: String) {
        val newStatus = if (currentStatus == "OPEN") "BLOCKED" else "OPEN"
        updateCourse(courseId, mapOf("status" to newStatus))
    }

    suspend fun getModules(courseId: String): List<CourseModule> {
        return db.from("course_modules").select {
            filter { eq("course_id", courseId) }
            order("module_order", Order.ASCENDING)
        }.decodeList<CourseModule>()
    }

    suspend fun createModule(module: CourseModule): CourseModule {
        return db.from("course_modules").insert(module) { select() }.decodeSingle<CourseModule>()
    }

    suspend fun deleteModule(moduleId: String) {
        db.from("course_modules").delete { filter { eq("id", moduleId) } }
    }

    suspend fun getSlides(moduleId: String): List<ModuleSlide> {
        return db.from("module_slides").select {
            filter { eq("module_id", moduleId) }
            order("slide_order", Order.ASCENDING)
        }.decodeList<ModuleSlide>()
    }

    suspend fun createSlide(slide: ModuleSlide): ModuleSlide {
        return db.from("module_slides").insert(slide) { select() }.decodeSingle<ModuleSlide>()
    }

    suspend fun deleteSlide(slideId: String) {
        db.from("module_slides").delete { filter { eq("id", slideId) } }
    }
}
