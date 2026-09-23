package com.xtop.admin.data

import android.content.Context
import android.content.SharedPreferences
import io.github.jan.supabase.SupabaseClient as JanSupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.serialization.json.Json
import com.xtop.admin.BuildConfig

object SupabaseClient {
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
        return if (!saved.isNullOrBlank()) saved
        else BuildConfig.SUPABASE_URL.ifBlank { "https://mldywarnnwjitfvqpgis.supabase.co" }
    }

    fun getSupabaseKey(): String {
        val saved = prefs?.getString("supabase_key", null)
        return if (!saved.isNullOrBlank()) saved
        else BuildConfig.SUPABASE_ANON_KEY.ifBlank { "" }
    }

    fun saveCredentials(url: String, key: String) {
        prefs?.edit()
            ?.putString("supabase_url", url.trim())
            ?.putString("supabase_key", key.trim())
            ?.apply()
        customClient = null // Forces re-initialization with new credentials
    }

    val client: JanSupabaseClient
        get() {
            if (customClient == null) {
                val url = getSupabaseUrl()
                val key = getSupabaseKey()
                customClient = createSupabaseClient(
                    supabaseUrl = url,
                    supabaseKey = key.ifBlank { "placeholder_anon_key" }
                ) {
                    defaultSerializer = KotlinXSerializer(customJson)
                    install(Postgrest)
                }
            }
            return customClient!!
        }

    val postgrest: Postgrest get() = client.postgrest
}
