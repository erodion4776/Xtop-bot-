package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RetailContact(
    val id: String? = null,
    val phone: String = "",
    val name: String? = null,
    val email: String? = null,
    @SerialName("business_name") val businessName: String? = null,
    @SerialName("business_type") val businessType: String? = null,
    @SerialName("created_at") val createdAt: String? = null
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
    @SerialName("contact_id") val contactId: String = "",
    val direction: String = "INBOUND",
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("message_text") val messageText: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

class RetailRepository {
    private val db by lazy { SupabaseClient.postgrest }

    // ── CONTACTS / CLIENTS ──
    suspend fun getContacts(): List<RetailContact> =
        db.from("contacts").select { order("created_at", Order.DESCENDING) }.decodeList()

    suspend fun searchContacts(query: String): List<RetailContact> =
        db.from("contacts").select {
            filter { or { ilike("name", "%$query%"); ilike("phone", "%$query%"); ilike("business_name", "%$query%") } }
            order("created_at", Order.DESCENDING)
        }.decodeList()

    // ── LEADS ──
    suspend fun getLeads(): List<RetailLead> =
        db.from("leads").select { order("created_at", Order.DESCENDING) }.decodeList()

    suspend fun updateLeadStatus(leadId: String, status: String) {
        db.from("leads").update({ set("status", status) }) { filter { eq("id", leadId) } }
    }

    // ── QUOTATIONS ──
    suspend fun getQuotations(): List<RetailQuotation> =
        db.from("quotations").select { order("created_at", Order.DESCENDING) }.decodeList()

    suspend fun updateQuotationStatus(quotationId: String, status: String) {
        db.from("quotations").update({ set("status", status) }) { filter { eq("id", quotationId) } }
    }

    // ── AGENT REQUESTS / SUPPORT TICKETS ──
    suspend fun getAgentRequests(): List<RetailAgentRequest> =
        db.from("agent_requests").select { order("created_at", Order.DESCENDING) }.decodeList()

    suspend fun resolveRequest(requestId: String, notes: String) {
        db.from("agent_requests").update({
            set("status", "RESOLVED")
            set("admin_notes", notes)
            set("resolved_at", java.time.Instant.now().toString())
        }) { filter { eq("id", requestId) } }
    }

    // ── CHAT MESSAGES ──
    suspend fun getMessages(contactId: String): List<RetailMessage> =
        db.from("messages").select {
            filter { eq("contact_id", contactId) }
            order("created_at", Order.ASCENDING)
        }.decodeList()

    // ── DASHBOARD STATS ──
    suspend fun getNewRequestCount(): Int =
        db.from("agent_requests").select { filter { eq("status", "NEW") } }.decodeList<RetailAgentRequest>().size

    suspend fun getActiveLeadCount(): Int =
        db.from("leads").select { filter { eq("status", "QUALIFYING") } }.decodeList<RetailLead>().size

    suspend fun getPresentedQuotationCount(): Int =
        db.from("quotations").select { filter { eq("status", "PRESENTED") } }.decodeList<RetailQuotation>().size

    suspend fun getTotalContactCount(): Int =
        db.from("contacts").select().decodeList<RetailContact>().size
}
