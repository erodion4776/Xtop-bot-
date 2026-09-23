package com.xtop.admin.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import com.xtop.admin.BuildConfig

object SupabaseClient {
    private val supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://mldywarnnwjitfvqpgis.supabase.co" }
    private val supabaseKey = BuildConfig.SUPABASE_ANON_KEY.ifBlank { "PLACEHOLDER_KEY" }

    val client by lazy {
        createSupabaseClient(
            supabaseUrl = supabaseUrl,
            supabaseKey = supabaseKey
        ) {
            install(Postgrest)
        }
    }

    val postgrest: Postgrest get() = client.postgrest
}
