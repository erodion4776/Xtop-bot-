package com.xtop.admin.data.repository

import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ═══════════════════════════════════════════════════════
// RETAIL MODELS
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
    val displayBody: String
        get() = body?.takeIf { it.isNotBlank() }
            ?: text?.takeIf { it.isNotBlank() }
            ?: content?.takeIf { it.isNotBlank() }
            ?: messageText?.takeIf { it.isNotBlank() }
            ?: "[Action/Media]"
}

// ═══════════════════════════════════════════════════════
// RETAIL REPOSITORY
// ═══════════════════════════════════════════════════════

class RetailRepository {
    private val db by lazy { SupabaseClient.postgrest }

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

    suspend fun getLeads(): List<RetailLead> = try {
        db.from("leads").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateLeadStatus(leadId: String, status: String) {
        try {
            db.from("leads").update({ set("status", status) }) { filter { eq("id", leadId) } }
        } catch (e: Exception) { e.printStackTrace() }
    }

    suspend fun getQuotations(): List<RetailQuotation> = try {
        db.from("quotations").select { order("created_at", Order.DESCENDING) }.decodeList()
    } catch (e: Exception) { emptyList() }

    suspend fun updateQuotationStatus(quotationId: String, status: String) {
        try {
            db.from("quotations").update({ set("status", status) }) { filter { eq("id", quotationId) } }
        } catch (e: Exception) { e.printStackTrace() }
    }

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

    suspend fun getMessages(contactIdOrPhone: String): List<RetailMessage> = try {
        val clean = contactIdOrPhone.replace("+", "").replace(" ", "").trim()

        if (contactIdOrPhone.contains("-") && contactIdOrPhone.length > 20) {
            db.from("messages").select {
                filter { eq("contact_id", contactIdOrPhone) }
                order("created_at", Order.ASCENDING)
                limit(100L)
            }.decodeList()
        } else {
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
