package com.xtop.admin.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.serialization.json.Json
import com.xtop.admin.BuildConfig

object SupabaseClient {
    private val supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://mldywarnnwjitfvqpgis.supabase.co" }
    private val supabaseKey = BuildConfig.SUPABASE_ANON_KEY.ifBlank { "PLACEHOLDER_KEY" }

    // Crash-proof JSON configuration (ignores extra columns returned from PostgreSQL)
    val customJson = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
        encodeDefaults = true
    }

    val client by lazy {
        createSupabaseClient(
            supabaseUrl = supabaseUrl,
            supabaseKey = supabaseKey
        ) {
            defaultSerializer = KotlinXSerializer(customJson)
            install(Postgrest)
        }
    }

    val postgrest: Postgrest get() = client.postgrest
}
