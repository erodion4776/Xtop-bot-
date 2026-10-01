package com.xtop.admin.data.repository

import com.xtop.admin.data.*
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class CommandCentreRepository(private val client: SupabaseClient) {

    // ── Dashboard Stats ──
    suspend fun getDashboardStats(): Map<String, Int> {
        val today = LocalDate.now().toString()
        return try {
            val contacts = client.from("contacts").select(columns = Columns.raw("id")) {
                filter { gte("created_at", "${today}T00:00:00Z") }
            }.decodeList<JsonObject>().size

            val conversations = client.from("conversations").select(columns = Columns.raw("id")) {
                filter { neq("current_state", "IDLE") }
            }.decodeList<JsonObject>().size

            val leads = client.from("leads").select(columns = Columns.raw("id, status, created_at")) {
                filter { gte("created_at", "${today}T00:00:00Z") }
            }.decodeList<JsonObject>().filter {
                val st = it["status"]?.toString()?.replace("\"", "") ?: ""
                st == "QUALIFYING" || st == "QUOTED"
            }.size

            val tickets = client.from("agent_requests").select(columns = Columns.raw("id")) {
                filter {
                    gte("created_at", "${today}T00:00:00Z")
                    eq("status", "NEW")
                }
            }.decodeList<JsonObject>().size

            mapOf(
                "activeUsers" to contacts,
                "conversations" to conversations,
                "newLeads" to leads,
                "newTickets" to tickets
            )
        } catch (e: Exception) {
            mapOf("activeUsers" to 0, "conversations" to 0, "newLeads" to 0, "newTickets" to 0)
        }
    }

    // ── Clients ──
    suspend fun getClients(limit: Int = 50): List<ClientProfile> {
        return try {
            client.from("contacts").select {
                order("updated_at", Order.DESCENDING)
                limit(limit.toLong())
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    suspend fun getClientById(id: String): ClientProfile? {
        return try {
            client.from("contacts").select {
                filter { eq("id", id) }
                limit(1L)
            }.decodeSingleOrNull()
        } catch (e: Exception) { null }
    }

    // ── Conversations ──
    suspend fun getConversationByContact(contactId: String): ConversationRecord? {
        return try {
            client.from("conversations").select {
                filter { eq("contact_id", contactId) }
                order("updated_at", Order.DESCENDING)
                limit(1L)
            }.decodeSingleOrNull()
        } catch (e: Exception) { null }
    }

    // ── Messages (Fetched via Unified Webhook Endpoint) ──
    suspend fun getMessages(contactIdOrPhone: String, limit: Int = 100): List<MessageRecord> {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = com.xtop.admin.data.SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = com.xtop.admin.data.SupabaseClient.getSupabaseKey()
                val url = URL("$baseUrl/functions/v1/whatsapp-webhook?action=chat&contact_id=$contactIdOrPhone&phone=$contactIdOrPhone")

                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("apikey", apiKey)
                conn.setRequestProperty("Authorization", "Bearer $apiKey")
                conn.connectTimeout = 7000
                conn.readTimeout = 7000

                if (conn.responseCode == 200) {
                    val responseText = conn.inputStream.bufferedReader().readText()
                    val json = JSONObject(responseText)
                    val dataArr = json.optJSONArray("data") ?: JSONArray()
                    val result = mutableListOf<MessageRecord>()

                    for (i in 0 until dataArr.length()) {
                        val obj = dataArr.getJSONObject(i)
                        result.add(
                            MessageRecord(
                                id = obj.optString("id", ""),
                                contact_id = obj.optString("contact_id", null),
                                phone_number = obj.optString("phone_number", null),
                                direction = obj.optString("direction", "INBOUND"),
                                message_type = obj.optString("message_type", "text"),
                                body = obj.optString("body", null),
                                content = obj.optString("content", null),
                                text = obj.optString("text", null),
                                message_text = obj.optString("message_text", null),
                                whatsapp_message_id = obj.optString("whatsapp_message_id", null),
                                created_at = obj.optString("created_at", "")
                            )
                        )
                    }
                    result
                } else {
                    emptyList()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                emptyList()
            }
        }
    }

    // ── Leads ──
    suspend fun getLeads(status: String? = null, limit: Int = 50): List<LeadRecord> {
        return try {
            client.from("leads").select {
                if (status != null) filter { eq("status", status) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    suspend fun updateLeadStatus(leadId: String, status: String): Boolean {
        return try {
            client.from("leads").update(
                buildJsonObject { put("status", status) }
            ) { filter { eq("id", leadId) } }
            true
        } catch (e: Exception) { false }
    }

    // ── Tickets / Agent Requests ──
    suspend fun getTickets(status: String? = null, limit: Int = 50): List<TicketRecord> {
        return try {
            client.from("agent_requests").select {
                if (status != null) filter { eq("status", status) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    suspend fun updateTicketStatus(ticketId: String, status: String): Boolean {
        return try {
            client.from("agent_requests").update(
                buildJsonObject { put("status", status) }
            ) { filter { eq("id", ticketId) } }
            true
        } catch (e: Exception) { false }
    }

    // ── Live Activity ──
    suspend fun getRecentActivity(limit: Int = 50): List<ActivityEvent> {
        return try {
            client.from("bot_activity_log").select {
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    // ── Agent Takeover ──
    suspend fun takeOverConversation(contactIdOrConvId: String, phone: String = ""): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = com.xtop.admin.data.SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = com.xtop.admin.data.SupabaseClient.getSupabaseKey()
                val url = URL("$baseUrl/functions/v1/whatsapp-webhook?action=toggle-takeover")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", apiKey)
                conn.setRequestProperty("Authorization", "Bearer $apiKey")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("contact_id", contactIdOrConvId)
                    put("phone", phone)
                    put("enabled", true)
                }

                conn.outputStream.write(payload.toString().toByteArray())
                conn.responseCode == 200
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    suspend fun returnToBot(contactIdOrConvId: String, phone: String = ""): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = com.xtop.admin.data.SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = com.xtop.admin.data.SupabaseClient.getSupabaseKey()
                val url = URL("$baseUrl/functions/v1/whatsapp-webhook?action=toggle-takeover")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", apiKey)
                conn.setRequestProperty("Authorization", "Bearer $apiKey")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("contact_id", contactIdOrConvId)
                    put("phone", phone)
                    put("enabled", false)
                }

                conn.outputStream.write(payload.toString().toByteArray())
                conn.responseCode == 200
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    // ── Send WhatsApp Message ──
    suspend fun sendWhatsAppMessage(phone: String, contactId: String, message: String): Pair<Boolean, String> {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = com.xtop.admin.data.SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = com.xtop.admin.data.SupabaseClient.getSupabaseKey()
                val url = URL("$baseUrl/functions/v1/whatsapp-webhook?action=send-message")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", apiKey)
                conn.setRequestProperty("Authorization", "Bearer $apiKey")
                conn.connectTimeout = 12000
                conn.readTimeout = 12000
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("phone", phone)
                    if (contactId.isNotBlank()) put("contact_id", contactId)
                    put("message", message)
                }

                conn.outputStream.write(payload.toString().toByteArray())
                val responseCode = conn.responseCode
                val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
                val responseText = stream?.bufferedReader()?.readText() ?: "{}"
                val json = JSONObject(responseText)

                if (responseCode == 200 && json.optBoolean("success", false)) {
                    Pair(true, "Sent")
                } else {
                    val err = json.optString("error", "Server returned HTTP $responseCode")
                    Pair(false, err)
                }
            } catch (e: Exception) {
                Pair(false, e.localizedMessage ?: "Network connection error")
            }
        }
    }

    suspend fun sendWhatsAppMessage(phone: String, message: String): Boolean {
        val result = sendWhatsAppMessage(phone = phone, contactId = "", message = message)
        return result.first
    }
}
