package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Student
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order

class StudentRepository {

    private val db = SupabaseClient.postgrest

    suspend fun getStudents(
        searchQuery: String? = null,
        department: String? = null,
        level: String? = null
    ): List<Student> {
        return db.from("students")
            .select {
                filter {
                    searchQuery?.let { or {
                        ilike("name", "%$it%")
                        ilike("matric_number", "%$it%")
                        ilike("phone", "%$it%")
                    }}
                    department?.let { eq("department", it) }
                    level?.let { eq("level", it) }
                }
                order("name", Order.ASCENDING)
            }
            .decodeList()
    }
}
