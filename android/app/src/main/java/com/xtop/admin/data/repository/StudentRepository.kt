package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Student
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class StudentRepository {

    // Lazy initialization defers client creation until called inside a suspend function
    private val db by lazy { SupabaseClient.postgrest }

    suspend fun getStudents(): List<Student> {
        return try {
            db.from("students")
                .select {
                    order("name", Order.ASCENDING)
                }
                .decodeList<Student>()
        } catch (e: Exception) {
            throw Exception("Failed to load students: ${e.localizedMessage}", e)
        }
    }
}
