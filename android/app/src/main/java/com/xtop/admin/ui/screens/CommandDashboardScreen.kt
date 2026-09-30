package com.xtop.admin.data.repository

import com.xtop.admin.data.*
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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

            val leads = client.from("leads").select(columns = Columns.raw("id")) {
                filter {
                    gte("created_at", "${today}T00:00:00Z")
                    isIn("status", listOf("QUALIFYING", "QUOTED"))
                }
            }.decodeList<JsonObject>().size

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
    suspend fun getClients(limitCount: Long = 50L): List<ClientProfile> {
        return try {
            client.from("contacts").select {
                order("updated_at", Order.DESCENDING)
                limit(limitCount)
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

    // ── Messages ──
    suspend fun getMessages(contactId: String, limitCount: Long = 100L): List<MessageRecord> {
        return try {
            client.from("messages").select {
                filter { eq("contact_id", contactId) }
                order("created_at", Order.ASCENDING)
                limit(limitCount)
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    // ── Leads ──
    suspend fun getLeads(status: String? = null, limitCount: Long = 50L): List<LeadRecord> {
        return try {
            client.from("leads").select {
                if (status != null) filter { eq("status", status) }
                order("created_at", Order.DESCENDING)
                limit(limitCount)
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
    suspend fun getTickets(status: String? = null, limitCount: Long = 50L): List<TicketRecord> {
        return try {
            client.from("agent_requests").select {
                if (status != null) filter { eq("status", status) }
                order("created_at", Order.DESCENDING)
                limit(limitCount)
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
    suspend fun getRecentActivity(limitCount: Long = 50L): List<ActivityEvent> {
        return try {
            client.from("bot_activity_log").select {
                order("created_at", Order.DESCENDING)
                limit(limitCount)
            }.decodeList()
        } catch (e: Exception) { emptyList() }
    }

    // ── Agent Takeover ──
    suspend fun takeOverConversation(conversationId: String, phone: String): Boolean {
        return try {
            client.from("conversations").update(
                buildJsonObject {
                    put("context_json", buildJsonObject {
                        put("agent_takeover", true)
                        put("agent_name", "Admin")
                    })
                }
            ) { filter { eq("id", conversationId) } }
            true
        } catch (e: Exception) { false }
    }

    suspend fun returnToBot(conversationId: String): Boolean {
        return try {
            client.from("conversations").update(
                buildJsonObject {
                    put("context_json", buildJsonObject {
                        put("agent_takeover", false)
                    })
                }
            ) { filter { eq("id", conversationId) } }
            true
        } catch (e: Exception) { false }
    }

    // ── Send WhatsApp Message via existing Edge Function ──
    suspend fun sendWhatsAppMessage(phone: String, message: String): Boolean {
        return try {
            val supabaseUrl = com.xtop.admin.data.SupabaseClient.getSupabaseUrl().trimEnd('/')
            val apiKey = com.xtop.admin.data.SupabaseClient.getSupabaseKey()
            val url = java.net.URL("$supabaseUrl/functions/v1/whatsapp-webhook?action=send-message")
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("apikey", apiKey)
            conn.setRequestProperty("Authorization", "Bearer $apiKey")
            conn.doOutput = true
            val payload = org.json.JSONObject().apply {
                put("phone", phone)
                put("message", message)
            }
            conn.outputStream.write(payload.toString().toByteArray())
            conn.responseCode == 200
        } catch (e: Exception) { false }
    }
}
