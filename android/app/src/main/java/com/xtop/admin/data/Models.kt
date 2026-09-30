package com.xtop.admin.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ClientProfile(
    val id: String = "",
    val phone: String = "",
    val name: String? = null,
    val business_name: String? = null,
    val email: String? = null,
    val created_at: String = "",
    val updated_at: String? = null
)

@Serializable
data class ConversationRecord(
    val id: String = "",
    val contact_id: String? = null,
    val phone: String? = null,
    val current_module: String? = "MAIN_MENU",
    val current_state: String? = "IDLE",
    val context_json: JsonObject? = null,
    val created_at: String = "",
    val updated_at: String? = null
)

@Serializable
data class MessageRecord(
    val id: String = "",
    val contact_id: String? = null,
    val phone_number: String? = null,
    val direction: String = "INBOUND",
    val message_type: String = "text",
    val body: String? = null,
    val content: String? = null,
    val text: String? = null,
    val message_text: String? = null,
    val whatsapp_message_id: String? = null,
    val created_at: String = ""
) {
    val displayText: String
        get() = body ?: content ?: text ?: message_text ?: "[Media]"
}

@Serializable
data class LeadRecord(
    val id: String = "",
    val contact_id: String? = null,
    val service_type: String? = null,
    val business_name: String? = null,
    val industry: String? = null,
    val budget_range: String? = null,
    val status: String? = "QUALIFYING",
    val requirements_json: JsonObject? = null,
    val created_at: String = "",
    val updated_at: String? = null
)

@Serializable
data class TicketRecord(
    val id: String = "",
    val contact_id: String? = null,
    val request_type: String = "GENERAL_ENQUIRY",
    val message: String = "",
    val priority: String = "NORMAL",
    val status: String = "NEW",
    val lead_id: String? = null,
    val quotation_id: String? = null,
    val summary: String? = null,
    val created_at: String = "",
    val updated_at: String? = null
)

@Serializable
data class ActivityEvent(
    val id: String = "",
    val phone_number: String = "",
    val contact_name: String? = null,
    val direction: String = "INBOUND",
    val module: String? = null,
    val message_body: String? = null,
    val created_at: String = ""
)

@Serializable
data class AgentTakeover(
    val id: String = "",
    val conversation_id: String = "",
    val phone_number: String = "",
    val agent_name: String = "Admin",
    val is_active: Boolean = true,
    val created_at: String = ""
)

enum class LeadStatus(val label: String, val color: Long) {
    NEW("New", 0xFF3B82F6),
    CONTACTED("Contacted", 0xFFF59E0B),
    QUALIFIED("Qualified", 0xFF8B5CF6),
    DEMO("Demo", 0xFF06B6D4),
    PROPOSAL("Proposal", 0xFFF97316),
    NEGOTIATION("Negotiation", 0xFFEF4444),
    WON("Won", 0xFF22C55E),
    LOST("Lost", 0xFF6B7280)
}

enum class TicketPriority(val label: String, val color: Long) {
    CRITICAL("Critical", 0xFFDC2626),
    HIGH("High", 0xFFF97316),
    MEDIUM("Medium", 0xFFF59E0B),
    LOW("Low", 0xFF22C55E)
}
