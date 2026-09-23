package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Student
import io.github.jan.supabase.postgrest.from

class StudentRepository {

    private val db = SupabaseClient.postgrest

    suspend fun getStudents(): List<Student> {
        return db.from("students").select().decodeList<Student>()
    }
}
