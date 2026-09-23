package com.xtop.admin.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import io.github.jan.supabase.SupabaseClient as JanSupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.serialization.json.Json
import com.xtop.admin.BuildConfig

object SupabaseClient {
    private const val TAG = "SupabaseClient"
    private var prefs: SharedPreferences? = null
    private var customClient: JanSupabaseClient? = null

    val customJson = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
        encodeDefaults = true
    }

    fun init(context: Context) {
        prefs = context.getSharedPreferences("xtop_admin_prefs", Context.MODE_PRIVATE)
    }

    fun getSupabaseUrl(): String {
        val saved = prefs?.getString("supabase_url", null)
        return if (!saved.isNullOrBlank()) saved.trim()
        else BuildConfig.SUPABASE_URL.ifBlank { "https://mldywarnnwjitfvqpgis.supabase.co" }.trim()
    }

    fun getSupabaseKey(): String {
        val saved = prefs?.getString("supabase_key", null)
        return if (!saved.isNullOrBlank()) saved.trim()
        else BuildConfig.SUPABASE_ANON_KEY.ifBlank { "" }.trim()
    }

    fun saveCredentials(url: String, key: String) {
        prefs?.edit()
            ?.putString("supabase_url", url.trim())
            ?.putString("supabase_key", key.trim())
            ?.apply()
        customClient = null // Invalidate client to rebuild on next access
    }

    val client: JanSupabaseClient
        get() {
            if (customClient == null) {
                val url = getSupabaseUrl()
                val key = getSupabaseKey()

                // Diagnostic validation before attempting initialization
                if (url.isBlank() || isPlaceholder(url)) {
                    val msg = "Supabase URL is not configured. Please set a valid Project URL in Settings (gear icon)."
                    Log.e(TAG, msg)
                    throw IllegalStateException(msg)
                }

                if (key.isBlank() || isPlaceholder(key)) {
                    val msg = "Supabase Anon Key is missing or invalid. Please configure your public anon key in Settings (gear icon)."
                    Log.e(TAG, msg)
                    throw IllegalStateException(msg)
                }

                try {
                    customClient = createSupabaseClient(
                        supabaseUrl = url,
                        supabaseKey = key
                    ) {
                        defaultSerializer = KotlinXSerializer(customJson)
                        install(Postgrest)
                    }
                } catch (e: Throwable) {
                    val msg = "Failed to initialize Supabase client: ${e.localizedMessage}"
                    Log.e(TAG, msg, e)
                    throw IllegalStateException(msg, e)
                }
            }
            return customClient!!
        }

    val postgrest: Postgrest
        get() = client.postgrest

    private fun isPlaceholder(value: String): Boolean {
        val lower = value.lowercase()
        return lower.contains("placeholder") || lower == "your_anon_key_here" || lower == "sk-placeholder"
    }
}
