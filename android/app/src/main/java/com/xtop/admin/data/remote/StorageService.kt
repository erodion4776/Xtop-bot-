package com.xtop.admin.data.remote

import android.content.Context
import android.net.Uri
import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.storage.storage
import java.util.UUID

object StorageService {
    private const val BUCKET_NAME = "course-media"

    suspend fun uploadImage(context: Context, imageUri: Uri): String {
        val inputStream = context.contentResolver.openInputStream(imageUri)
            ?: throw IllegalArgumentException("Cannot open image file")
        val bytes = inputStream.use { it.readBytes() }

        val fileName = "diagrams/${UUID.randomUUID()}.jpg"
        val bucket = SupabaseClient.storage.from(BUCKET_NAME)

        // Supabase-kt v2.5.4 upload syntax
        bucket.upload(path = fileName, data = bytes, upsert = true)

        return bucket.publicUrl(fileName)
    }
}
