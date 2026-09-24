package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.models.CourseModule
import com.xtop.admin.data.models.ModuleSlide
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class CourseRepository {

    private val db by lazy { SupabaseClient.postgrest }

    suspend fun getCourses(): List<Course> {
        return try {
            db.from("courses")
                .select {
                    order("course_code", Order.ASCENDING)
                }
                .decodeList<Course>()
        } catch (e: Exception) {
            throw Exception("Failed to load courses: ${e.localizedMessage}", e)
        }
    }

    suspend fun createCourse(course: Course): Course {
        return try {
            db.from("courses").insert(course) { select() }.decodeSingle<Course>()
        } catch (e: Exception) {
            throw Exception("Failed to create course '${course.courseCode}': ${e.localizedMessage}", e)
        }
    }

    suspend fun updateCourse(courseId: String, updates: Map<String, String>) {
        try {
            db.from("courses").update(updates) {
                filter { eq("id", courseId) }
            }
        } catch (e: Exception) {
            throw Exception("Failed to update course: ${e.localizedMessage}", e)
        }
    }

    suspend fun updateCourse(course: Course) {
        val cId = course.id ?: return
        try {
            db.from("courses").update(course) {
                filter { eq("id", cId) }
            }
        } catch (e: Exception) {
            throw Exception("Failed to update course: ${e.localizedMessage}", e)
        }
    }

    suspend fun toggleCourseStatus(courseId: String, currentStatus: String) {
        try {
            val newStatus = if (currentStatus == "OPEN") "BLOCKED" else "OPEN"
            updateCourse(courseId, mapOf("status" to newStatus))
        } catch (e: Exception) {
            throw Exception("Failed to toggle course status: ${e.localizedMessage}", e)
        }
    }

    suspend fun getModules(courseId: String): List<CourseModule> {
        return try {
            db.from("course_modules").select {
                filter { eq("course_id", courseId) }
                order("module_order", Order.ASCENDING)
            }.decodeList<CourseModule>()
        } catch (e: Exception) {
            throw Exception("Failed to load course modules: ${e.localizedMessage}", e)
        }
    }

    suspend fun createModule(module: CourseModule): CourseModule {
        return try {
            db.from("course_modules").insert(module) { select() }.decodeSingle<CourseModule>()
        } catch (e: Exception) {
            throw Exception("Failed to create module: ${e.localizedMessage}", e)
        }
    }

    suspend fun deleteModule(moduleId: String) {
        try {
            db.from("course_modules").delete { filter { eq("id", moduleId) } }
        } catch (e: Exception) {
            throw Exception("Failed to delete module: ${e.localizedMessage}", e)
        }
    }

    suspend fun getSlides(moduleId: String): List<ModuleSlide> {
        return try {
            db.from("module_slides").select {
                filter { eq("module_id", moduleId) }
                order("slide_order", Order.ASCENDING)
            }.decodeList<ModuleSlide>()
        } catch (e: Exception) {
            throw Exception("Failed to load slides: ${e.localizedMessage}", e)
        }
    }

    suspend fun createSlide(slide: ModuleSlide): ModuleSlide {
        return try {
            db.from("module_slides").insert(slide) { select() }.decodeSingle<ModuleSlide>()
        } catch (e: Exception) {
            throw Exception("Failed to create slide: ${e.localizedMessage}", e)
        }
    }

    suspend fun deleteSlide(slideId: String) {
        try {
            db.from("module_slides").delete { filter { eq("id", slideId) } }
        } catch (e: Exception) {
            throw Exception("Failed to delete slide: ${e.localizedMessage}", e)
        }
    }
}
