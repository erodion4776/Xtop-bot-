package com.xtop.admin.data.remote

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.util.UUID

object StorageService {
    private const val BUCKET_NAME = "course-media"

    suspend fun uploadImage(context: Context, imageUri: Uri): String = withContext(Dispatchers.IO) {
        // 1. Compress & downsample image on background thread
        val compressedBytes = compressImageUri(context, imageUri)

        val fileName = "diagrams/${UUID.randomUUID()}.jpg"
        val bucket = SupabaseClient.storage.from(BUCKET_NAME)

        // 2. Upload optimized bytes
        bucket.upload(path = fileName, data = compressedBytes, upsert = true)

        // 3. Return the public URL
        bucket.publicUrl(fileName)
    }

    private fun compressImageUri(context: Context, uri: Uri): ByteArray {
        // Step A: Decode image dimensions first without loading full bitmap to memory
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream, null, boundsOptions)
        } ?: throw IllegalArgumentException("Cannot open image file")

        // Step B: Calculate inSampleSize to downscale large camera images (Max 1280px)
        val maxDimension = 1280
        var inSampleSize = 1
        if (boundsOptions.outHeight > maxDimension || boundsOptions.outWidth > maxDimension) {
            val halfHeight = boundsOptions.outHeight / 2
            val halfWidth = boundsOptions.outWidth / 2
            while ((halfHeight / inSampleSize) >= maxDimension && (halfWidth / inSampleSize) >= maxDimension) {
                inSampleSize *= 2
            }
        }

        // Step C: Decode bitmap using calculated sample size
        val decodeOptions = BitmapFactory.Options().apply { 
            this.inSampleSize = inSampleSize 
        }
        val bitmap = context.contentResolver.openInputStream(uri)?.use { stream ->
            BitmapFactory.decodeStream(stream, null, decodeOptions)
        } ?: throw IllegalArgumentException("Failed to decode image bitmap")

        // Step D: Compress to JPEG 80% quality (reduces size by ~90% with great quality)
        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
        bitmap.recycle()

        return outputStream.toByteArray()
    }
}
