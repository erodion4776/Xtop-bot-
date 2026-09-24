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
        // 1. Read input stream ONCE into memory to avoid content provider re-open failures
        val rawBytes = try {
            context.contentResolver.openInputStream(imageUri)?.use { stream ->
                stream.readBytes()
            } ?: throw IllegalArgumentException("Could not open image stream.")
        } catch (e: Exception) {
            throw Exception("Failed to read image: ${e.localizedMessage ?: "Access denied"}", e)
        }

        if (rawBytes.isEmpty()) {
            throw IllegalArgumentException("The selected image file is empty.")
        }

        // 2. Compress & scale down in-memory
        val uploadBytes = try {
            compressRawBytes(rawBytes)
        } catch (_: Exception) {
            // Fallback to uploading original bytes if decoding encounters an uncommon format
            rawBytes
        }

        val fileName = "diagrams/${UUID.randomUUID()}.jpg"
        val bucket = SupabaseClient.storage.from(BUCKET_NAME)

        // 3. Upload optimized bytes to Supabase Storage
        bucket.upload(path = fileName, data = uploadBytes, upsert = true)

        // 4. Return the public URL
        bucket.publicUrl(fileName)
    }

    private fun compressRawBytes(rawBytes: ByteArray): ByteArray {
        // Step A: Decode image dimensions directly from the in-memory byte array
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, boundsOptions)

        // Step B: Calculate scaling factor (Target max 1280px dimension)
        val maxDimension = 1280
        var inSampleSize = 1
        if (boundsOptions.outHeight > maxDimension || boundsOptions.outWidth > maxDimension) {
            val halfHeight = boundsOptions.outHeight / 2
            val halfWidth = boundsOptions.outWidth / 2
            while ((halfHeight / inSampleSize) >= maxDimension && (halfWidth / inSampleSize) >= maxDimension) {
                inSampleSize *= 2
            }
        }

        // Step C: Decode bitmap with sample size
        val decodeOptions = BitmapFactory.Options().apply {
            this.inSampleSize = inSampleSize
        }

        val bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, decodeOptions)
            ?: return rawBytes // Return raw bytes if bitmap decoding fails

        // Step D: Compress to crisp JPEG (80% quality, reduces size significantly)
        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
        bitmap.recycle()

        return outputStream.toByteArray()
    }
}
