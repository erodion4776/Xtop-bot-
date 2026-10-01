package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

// ═══════════════════════════════════════════════════════
// DATA MODELS
// ═══════════════════════════════════════════════════════

@Serializable
data class RetailContact(
    val id: String? = null,
    val phone: String = "",
    val name: String? = null,
    val email: String? = null,
    @SerialName("business_name") val businessName: String? = null,
    @SerialName("business_type") val businessType: String? = null,
    @SerialName("agent_mode") val agentMode: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class RetailLead(
    val id: String? = null,
    @SerialName("contact_id") val contactId: String = "",
    @SerialName("service_type") val serviceType: String? = null,
    @SerialName("business_name") val businessName: String? = null,
    val industry: String? = null,
    val features: List<String>? = null,
    @SerialName("budget_range") val budgetRange: String? = null,
    @SerialName("estimated_min_price") val estimatedMinPrice: Double? = null,
    @SerialName("estimated_max_price") val estimatedMaxPrice: Double? = null,
    val status: String = "QUALIFYING",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class RetailQuotation(
    val id: String? = null,
    @SerialName("lead_id") val leadId: String? = null,
    @SerialName("quotation_number") val quotationNumber: String = "",
    @SerialName("package_id") val packageId: String? = null,
    val title: String = "",
    val summary: String? = null,
    @SerialName("estimated_min_price") val estimatedMinPrice: Double = 0.0,
    @SerialName("estimated_max_price") val estimatedMaxPrice: Double = 0.0,
    val currency: String = "NGN",
    val status: String = "PRESENTED",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class RetailAgentRequest(
    val id: String? = null,
    @SerialName("contact_id") val contactId: String = "",
    @SerialName("request_type") val requestType: String = "",
    val message: String = "",
    val status: String = "NEW",
    val priority: String = "NORMAL",
    @SerialName("admin_notes") val adminNotes: String? = null,
    @SerialName("quotation_summary") val quotationSummary: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("resolved_at") val resolvedAt: String? = null
)

@Serializable
data class RetailMessage(
    val id: String? = null,
    @SerialName("contact_id") val contactId: String? = null,
    @SerialName("phone_number") val phoneNumber: String? = null,
    val direction: String = "INBOUND",
    @SerialName("message_type") val messageType: String = "text",
    val body: String? = null,
    val content: String? = null,
    val text: String? = null,
    @SerialName("message_text") val messageText: String? = null,
    @SerialName("created_at") val createdAt: String? = null
) {
    // Reads whichever column is populated in the database
    val displayBody: String
        get() = body?.takeIf { it.isNotBlank() }
            ?: text?.takeIf { it.isNotBlank() }
            ?: content?.takeIf { it.isNotBlank() }
            ?: messageText?.takeIf { it.isNotBlank() }
            ?: "[Action/Media]"
}

// ═══════════════════════════════════════════════════════
// RETAIL REPOSITORY (Fast Direct PostgREST Access)
// ═══════════════════════════════════════════════════════

class RetailRepository {
    private val db by lazy { SupabaseClient.postgrest }

    // ── CONTACTS / CLIENTS ──
    suspend fun getContacts(): List<RetailContact> = try {
        db.from("contacts").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    suspend fun getContactById(id: String): RetailContact? = try {
        db.from("contacts").select {
            filter { eq("id", id) }
            limit(1L)
        }.decodeSingleOrNull()
    } catch (e: Exception) { null }

    suspend fun searchContacts(query: String): List<RetailContact> = try {
        db.from("contacts").select {
            filter { or { ilike("name", "%$query%"); ilike("phone", "%$query%"); ilike("business_name", "%$query%") } }
            order("created_at", Order.DESCENDING)
        }.decodeList()
    } catch (e: Exception) { emptyList() }

    // ── LEADS ──
    suspend fun getLeads(): List<RetailLead> = try {
        db.from("leads").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateLeadStatus(leadId: String, status: String) {
        try {
            db.from("leads").update({ set("status", status) }) { filter { eq("id", leadId) } }
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ── QUOTATIONS ──
    suspend fun getQuotations(): List<RetailQuotation> = try {
        db.from("quotations").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateQuotationStatus(quotationId: String, status: String) {
        try {
            db.from("quotations").update({ set("status", status) }) { filter { eq("id", quotationId) } }
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ── AGENT REQUESTS / SUPPORT TICKETS ──
    suspend fun getAgentRequests(): List<RetailAgentRequest> = try {
        db.from("agent_requests").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun resolveRequest(requestId: String, notes: String) {
        try {
            db.from("agent_requests").update({
                set("status", "RESOLVED")
                set("admin_notes", notes)
                set("resolved_at", java.time.Instant.now().toString())
            }) { filter { eq("id", requestId) } }
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ── CHAT MESSAGES (Direct DB Query by contact_id OR phone) ──
    suspend fun getMessages(contactIdOrPhone: String): List<RetailMessage> = try {
        val clean = contactIdOrPhone.replace("+", "").replace(" ", "").trim()

        if (contactIdOrPhone.contains("-") && contactIdOrPhone.length > 20) {
            // Is UUID -> Query by contact_id
            db.from("messages").select {
                filter { eq("contact_id", contactIdOrPhone) }
                order("created_at", Order.ASCENDING)
                limit(100L)
            }.decodeList()
        } else {
            // Is phone -> Query by phone_number
            db.from("messages").select {
                filter {
                    or {
                        eq("phone_number", clean)
                        eq("phone_number", "+$clean")
                    }
                }
                order("created_at", Order.ASCENDING)
                limit(100L)
            }.decodeList()
        }
    } catch (e: Exception) {
        e.printStackTrace()
        emptyList()
    }

    // ── DASHBOARD STATS ──
    suspend fun getNewRequestCount(): Int = try {
        db.from("agent_requests").select { filter { eq("status", "NEW") } }.decodeList<RetailAgentRequest>().size
    } catch (e: Exception) { 0 }

    suspend fun getActiveLeadCount(): Int = try {
        db.from("leads").select { filter { eq("status", "QUALIFYING") } }.decodeList<RetailLead>().size
    } catch (e: Exception) { 0 }

    suspend fun getPresentedQuotationCount(): Int = try {
        db.from("quotations").select { filter { eq("status", "PRESENTED") } }.decodeList<RetailQuotation>().size
    } catch (e: Exception) { 0 }

    suspend fun getTotalContactCount(): Int = try {
        db.from("contacts").select().decodeList<RetailContact>().size
    } catch (e: Exception) { 0 }
}

// ═══════════════════════════════════════════════════════
// COMMAND CENTRE REPOSITORY
// ═══════════════════════════════════════════════════════

class CommandCentreRepository(private val client: io.github.jan.supabase.SupabaseClient) {
    private val retailRepo = RetailRepository()

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

    suspend fun getClients(limit: Int = 50): List<ClientProfile> = try {
        client.from("contacts").select {
            order("updated_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun getClientById(id: String): ClientProfile? = try {
        client.from("contacts").select {
            filter { eq("id", id) }
            limit(1L)
        }.decodeSingleOrNull()
    } catch (e: Exception) { null }

    suspend fun getConversationByContact(contactId: String): ConversationRecord? = try {
        client.from("conversations").select {
            filter { eq("contact_id", contactId) }
            order("updated_at", Order.DESCENDING)
            limit(1L)
        }.decodeSingleOrNull()
    } catch (e: Exception) { null }

    // Direct database read for messages (matches RetailRepository)
    suspend fun getMessages(contactIdOrPhone: String, limit: Int = 100): List<MessageRecord> {
        val rawMessages = retailRepo.getMessages(contactIdOrPhone)
        return rawMessages.map {
            MessageRecord(
                id = it.id ?: "",
                contact_id = it.contactId,
                phone_number = it.phoneNumber,
                direction = it.direction,
                message_type = it.messageType,
                body = it.displayBody,
                content = it.content,
                text = it.text,
                message_text = it.messageText,
                created_at = it.createdAt ?: ""
            )
        }
    }

    suspend fun getLeads(status: String? = null, limit: Int = 50): List<LeadRecord> = try {
        client.from("leads").select {
            if (status != null) filter { eq("status", status) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateLeadStatus(leadId: String, status: String): Boolean = try {
        client.from("leads").update(buildJsonObject { put("status", status) }) { filter { eq("id", leadId) } }
        true
    } catch (e: Exception) { false }

    suspend fun getTickets(status: String? = null, limit: Int = 50): List<TicketRecord> = try {
        client.from("agent_requests").select {
            if (status != null) filter { eq("status", status) }
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateTicketStatus(ticketId: String, status: String): Boolean = try {
        client.from("agent_requests").update(buildJsonObject { put("status", status) }) { filter { eq("id", ticketId) } }
        true
    } catch (e: Exception) { false }

    suspend fun getRecentActivity(limit: Int = 50): List<ActivityEvent> = try {
        client.from("bot_activity_log").select {
            order("created_at", Order.DESCENDING)
            limit(limit.toLong())
        }.decodeList()
    } catch (e: Exception) { emptyList() }

    // Takeover Endpoint
    suspend fun takeOverConversation(contactIdOrConvId: String, phone: String = ""): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = SupabaseClient.getSupabaseKey()
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
                false
            }
        }
    }

    suspend fun returnToBot(contactIdOrConvId: String, phone: String = ""): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = SupabaseClient.getSupabaseKey()
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
                false
            }
        }
    }

    // Outbound WhatsApp Delivery via Edge Function
    suspend fun sendWhatsAppMessage(phone: String, contactId: String, message: String): Pair<Boolean, String> {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = SupabaseClient.getSupabaseKey()
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
