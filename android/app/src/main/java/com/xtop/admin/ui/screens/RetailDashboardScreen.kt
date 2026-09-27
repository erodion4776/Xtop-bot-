package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.repository.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private const val DASHBOARD_API = "https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RetailDashboardScreen(navController: NavController) {
    val context = LocalContext.current
    val repo = remember { RetailRepository() }
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableIntStateOf(0) }
    var contacts by remember { mutableStateOf<List<RetailContact>>(emptyList()) }
    var leads by remember { mutableStateOf<List<RetailLead>>(emptyList()) }
    var quotations by remember { mutableStateOf<List<RetailQuotation>>(emptyList()) }
    var requests by remember { mutableStateOf<List<RetailAgentRequest>>(emptyList()) }
    var chatMessages by remember { mutableStateOf<List<RetailMessage>>(emptyList()) }
    var selectedContact by remember { mutableStateOf<RetailContact?>(null) }
    var chatPhone by remember { mutableStateOf("") }
    var chatName by remember { mutableStateOf("") }

    var statContacts by remember { mutableIntStateOf(0) }
    var statLeads by remember { mutableIntStateOf(0) }
    var statQuotations by remember { mutableIntStateOf(0) }
    var statRequests by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var isSending by remember { mutableStateOf(false) }
    var sabiHandoff by remember { mutableStateOf(false) }

    fun findPhoneForContact(contactId: String?): String {
        if (contactId.isNullOrBlank()) return ""
        val found = contacts.find { it.id == contactId }
        return found?.phone ?: ""
    }

    fun openChatWith(phoneOrId: String, name: String, contactObj: RetailContact? = null) {
        val resolvedPhone = if (phoneOrId.length > 20 && phoneOrId.contains("-")) {
            findPhoneForContact(phoneOrId)
        } else {
            phoneOrId
        }

        chatPhone = resolvedPhone
        chatName = name
        selectedContact = contactObj ?: contacts.find { it.phone == resolvedPhone }

        scope.launch {
            if (selectedContact != null) {
                chatMessages = repo.getMessages(selectedContact?.id ?: "")
            } else {
                chatMessages = emptyList()
            }
        }
        selectedTab = 5
    }

    fun refreshData() {
        scope.launch {
            loading = true
            try {
                statContacts = repo.getTotalContactCount()
                statLeads = repo.getActiveLeadCount()
                statQuotations = repo.getPresentedQuotationCount()
                statRequests = repo.getNewRequestCount()
                contacts = repo.getContacts()
                leads = repo.getLeads()
                quotations = repo.getQuotations()
                requests = repo.getAgentRequests()

                // Fetch live server handoff status
                withContext(Dispatchers.IO) {
                    try {
                        val url = URL("$DASHBOARD_API?action=get-handoff")
                        val conn = url.openConnection() as HttpURLConnection
                        conn.setRequestProperty("apikey", SupabaseClient.getApiKey())
                        conn.setRequestProperty("Authorization", "Bearer ${SupabaseClient.getApiKey()}")
                        if (conn.responseCode == 200) {
                            val res = conn.inputStream.bufferedReader().readText()
                            sabiHandoff = JSONObject(res).optBoolean("enabled", false)
                        }
                    } catch (_: Exception) {}
                }

                if (selectedContact != null) {
                    chatMessages = repo.getMessages(selectedContact?.id ?: "")
                }
            } catch (_: Exception) {}
            loading = false
        }
    }

    fun toggleSabiHandoff(enabled: Boolean) {
        sabiHandoff = enabled
        scope.launch {
            withContext(Dispatchers.IO) {
                try {
                    val url = URL("$DASHBOARD_API?action=toggle-handoff")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("apikey", SupabaseClient.getApiKey())
                    conn.setRequestProperty("Authorization", "Bearer ${SupabaseClient.getApiKey()}")
                    conn.doOutput = true
                    val payload = JSONObject().apply { put("enabled", enabled) }
                    conn.outputStream.write(payload.toString().toByteArray())
                    conn.responseCode
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    LaunchedEffect(Unit) { refreshData() }

    val tabs = listOf("Overview", "Clients", "Leads", "Quotes", "Tickets", "Chat")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Retail CRM", fontWeight = FontWeight.Bold)
                        Text(
                            if (sabiHandoff) "🛑 Sabi PAUSED (Agent Live)" else "🤖 Sabi Auto-Response ON",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (sabiHandoff) Color(0xFFF59E0B) else Color(0xFF10B981)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { refreshData() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ScrollableTabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                    )
                }
            }

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                when (selectedTab) {
                    0 -> OverviewTab(statContacts, statLeads, statQuotations, statRequests, sabiHandoff) { toggleSabiHandoff(it) }
                    1 -> ClientsTab(contacts, context) { c -> openChatWith(c.phone, c.name ?: c.phone, c) }
                    2 -> LeadsTab(leads, contacts, context) { phone, name -> openChatWith(phone, name) }
                    3 -> QuotationsTab(quotations, leads, contacts, context) { phone, name -> openChatWith(phone, name) }
                    4 -> TicketsTab(requests, repo, scope, contacts, context) { phone, name -> openChatWith(phone, name) }
                    5 -> ChatTab(
                        contactName = chatName,
                        contactPhone = chatPhone,
                        contact = selectedContact,
                        messages = chatMessages,
                        context = context,
                        isSending = isSending,
                        onSendMessage = { messageText ->
                            if (chatPhone.isBlank()) {
                                Toast.makeText(context, "No valid phone number selected", Toast.LENGTH_SHORT).show()
                                return@ChatTab
                            }
                            scope.launch {
                                isSending = true
                                val result = sendViaSabiBot(chatPhone, messageText)
                                if (result.first) {
                                    Toast.makeText(context, "✅ Message delivered", Toast.LENGTH_SHORT).show()
                                    if (selectedContact != null) {
                                        chatMessages = repo.getMessages(selectedContact?.id ?: "")
                                    }
                                } else {
                                    Toast.makeText(context, "⚠️ ${result.second}", Toast.LENGTH_LONG).show()
                                }
                                isSending = false
                            }
                        }
                    )
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// API CALL WITH SUPABASE AUTHENTICATION
// ═══════════════════════════════════════════════════════

suspend fun sendViaSabiBot(phone: String, message: String): Pair<Boolean, String> {
    return withContext(Dispatchers.IO) {
        try {
            val url = URL("$DASHBOARD_API?action=send-message")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            // Supabase API Gateway Auth headers:
            val apiKey = SupabaseClient.getApiKey()
            conn.setRequestProperty("apikey", apiKey)
            conn.setRequestProperty("Authorization", "Bearer $apiKey")
            conn.connectTimeout = 12000
            conn.readTimeout = 12000
            conn.doOutput = true

            val payload = JSONObject().apply {
                put("phone", phone)
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

// ═══════════════════════════════════════════════════════
// TAB 0: OVERVIEW
// ═══════════════════════════════════════════════════════

@Composable
fun OverviewTab(contacts: Int, leads: Int, quotations: Int, requests: Int, sabiHandoff: Boolean, onToggle: (Boolean) -> Unit) {
    val stats = listOf(
        Triple("Total Clients", "$contacts", Icons.Default.People),
        Triple("Active Leads", "$leads", Icons.Default.TrendingUp),
        Triple("Open Quotes", "$quotations", Icons.Default.Receipt),
        Triple("New Tickets", "$requests", Icons.Default.Notifications)
    )

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Dashboard Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (sabiHandoff) Color(0xFFFEF3C7) else MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            if (sabiHandoff) "🛑 Sabi Paused (Agent Mode)" else "🤖 Sabi Auto-Response Active",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (sabiHandoff) Color(0xFF92400E) else MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            if (sabiHandoff) "Sabi is paused. Messages are logged and you can reply manually without bot interruptions."
                            else "Sabi is answering WhatsApp customer enquiries automatically.",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (sabiHandoff) Color(0xFF92400E) else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = sabiHandoff,
                        onCheckedChange = { onToggle(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color(0xFFF59E0B),
                            checkedTrackColor = Color(0xFFFDE68A)
                        )
                    )
                }
            }
        }

        items(stats.chunked(2)) { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, value, icon) ->
                    Card(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                            Spacer(Modifier.height(6.dp))
                            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// TAB 1: CLIENTS
// ═══════════════════════════════════════════════════════

@Composable
fun ClientsTab(contacts: List<RetailContact>, context: android.content.Context, onOpenChat: (RetailContact) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Clients & Contacts (${contacts.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(contacts) { c ->
            Card(modifier = Modifier.fillMaxWidth().clickable { onOpenChat(c) }) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(c.name ?: c.phone, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("📞 ${c.phone}", style = MaterialTheme.typography.bodySmall)
                    c.businessName?.let { Text("🏢 $it", style = MaterialTheme.typography.bodySmall) }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                        OutlinedButton(onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${c.phone}")))
                        }, modifier = Modifier.weight(0.45f)) {
                            Icon(Icons.Default.Phone, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Call", fontSize = 11.sp)
                        }
                        Button(onClick = { onOpenChat(c) }, modifier = Modifier.weight(0.55f)) {
                            Icon(Icons.Default.Forum, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Chat as Sabi", fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// TAB 2: LEADS
// ═══════════════════════════════════════════════════════

@Composable
fun LeadsTab(leads: List<RetailLead>, contacts: List<RetailContact>, context: android.content.Context, onChatWith: (String, String) -> Unit) {
    var expandedLeadId by remember { mutableStateOf<String?>(null) }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Sales Leads (${leads.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(leads) { lead ->
            val isExpanded = expandedLeadId == lead.id
            val matchedContact = contacts.find { it.id == lead.contactId }
            val clientPhone = matchedContact?.phone ?: ""

            Card(modifier = Modifier.fillMaxWidth().clickable { expandedLeadId = if (isExpanded) null else lead.id }) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(lead.businessName ?: matchedContact?.name ?: "Lead", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (lead.status) {
                            "QUALIFYING" -> Color(0xFFFF9800); "QUOTED" -> Color(0xFF2196F3)
                            "PACKAGE_SELECTED" -> Color(0xFF4CAF50); else -> Color.Gray
                        }
                        Text(lead.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${lead.serviceType ?: "General"} • ${lead.industry ?: ""}", style = MaterialTheme.typography.bodySmall)
                    lead.budgetRange?.let { Text("💰 Budget: $it", style = MaterialTheme.typography.labelSmall) }

                    if (isExpanded) {
                        Divider(modifier = Modifier.padding(vertical = 6.dp))
                        if (clientPhone.isNotBlank()) Text("📞 Phone: $clientPhone", style = MaterialTheme.typography.bodySmall)
                        if (lead.estimatedMinPrice != null && lead.estimatedMaxPrice != null) {
                            Text("💵 Estimate: ₦${lead.estimatedMinPrice?.toLong()} – ₦${lead.estimatedMaxPrice?.toLong()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                        Text("📅 Created: ${lead.createdAt?.take(10) ?: "Unknown"}", style = MaterialTheme.typography.labelSmall)

                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (clientPhone.isNotBlank()) {
                                OutlinedButton(onClick = {
                                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clientPhone")))
                                }, modifier = Modifier.weight(0.4f)) {
                                    Icon(Icons.Default.Phone, null, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Call", fontSize = 11.sp)
                                }
                            }
                            Button(onClick = { onChatWith(clientPhone.ifBlank { lead.contactId ?: "" }, lead.businessName ?: "Lead") }, modifier = Modifier.weight(0.6f)) {
                                Icon(Icons.Default.Forum, null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Chat as Sabi", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// TAB 3: QUOTATIONS
// ═══════════════════════════════════════════════════════

@Composable
fun QuotationsTab(quotations: List<RetailQuotation>, leads: List<RetailLead>, contacts: List<RetailContact>, context: android.content.Context, onChatWith: (String, String) -> Unit) {
    var expandedQuoteId by remember { mutableStateOf<String?>(null) }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Quotations (${quotations.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(quotations) { q ->
            val isExpanded = expandedQuoteId == q.id
            val matchedLead = leads.find { it.id == q.leadId }
            val matchedContact = contacts.find { it.id == matchedLead?.contactId }
            val clientPhone = matchedContact?.phone ?: ""

            Card(modifier = Modifier.fillMaxWidth().clickable { expandedQuoteId = if (isExpanded) null else q.id }) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(q.quotationNumber, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (q.status) {
                            "PRESENTED" -> Color(0xFFFF9800); "PACKAGE_SELECTED" -> Color(0xFF4CAF50)
                            "AGENT_REVIEW" -> Color(0xFF2196F3); else -> Color.Gray
                        }
                        Text(q.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text(q.title, style = MaterialTheme.typography.bodySmall)
                    Text("₦${q.estimatedMinPrice.toLong()} – ₦${q.estimatedMaxPrice.toLong()} ${q.currency}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)

                    if (isExpanded) {
                        Divider(modifier = Modifier.padding(vertical = 6.dp))
                        if (clientPhone.isNotBlank()) Text("📞 Phone: $clientPhone", style = MaterialTheme.typography.bodySmall)
                        Text("📅 Issued: ${q.createdAt?.take(10) ?: "Unknown"}", style = MaterialTheme.typography.labelSmall)

                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (clientPhone.isNotBlank()) {
                                OutlinedButton(onClick = {
                                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clientPhone")))
                                }, modifier = Modifier.weight(0.4f)) {
                                    Icon(Icons.Default.Phone, null, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Call", fontSize = 11.sp)
                                }
                            }
                            Button(onClick = { onChatWith(clientPhone.ifBlank { q.leadId ?: "" }, q.quotationNumber) }, modifier = Modifier.weight(0.6f)) {
                                Icon(Icons.Default.Forum, null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Chat as Sabi", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// TAB 4: TICKETS
// ═══════════════════════════════════════════════════════

@Composable
fun TicketsTab(
    requests: List<RetailAgentRequest>,
    repo: RetailRepository,
    scope: kotlinx.coroutines.CoroutineScope,
    contacts: List<RetailContact>,
    context: android.content.Context,
    onChatWith: (String, String) -> Unit
) {
    var expandedTicketId by remember { mutableStateOf<String?>(null) }
    var resolveId by remember { mutableStateOf<String?>(null) }
    var resolveNotes by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Support Tickets (${requests.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(requests) { req ->
            val isExpanded = expandedTicketId == req.id
            val matchedContact = contacts.find { it.id == req.contactId }
            val clientPhone = matchedContact?.phone ?: ""

            Card(modifier = Modifier.fillMaxWidth().clickable { expandedTicketId = if (isExpanded) null else req.id }) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("#${req.id?.take(8)?.uppercase()}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (req.status) { "NEW" -> Color(0xFFFF9800); "RESOLVED" -> Color(0xFF4CAF50); else -> Color.Gray }
                        Text(req.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${req.requestType} • ${req.priority}", style = MaterialTheme.typography.bodySmall)
                    Text(req.message.take(80), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    if (isExpanded) {
                        Divider(modifier = Modifier.padding(vertical = 6.dp))
                        if (clientPhone.isNotBlank()) Text("📞 Phone: $clientPhone", style = MaterialTheme.typography.bodySmall)
                        Text("💬 Message: ${req.message}", style = MaterialTheme.typography.bodySmall)
                        req.quotationSummary?.let { Text("📄 Summary: $it", style = MaterialTheme.typography.labelSmall) }
                        Text("📅 Date: ${req.createdAt?.take(16) ?: ""}", style = MaterialTheme.typography.labelSmall)

                        Spacer(modifier = Modifier.height(8.dp))

                        if (req.status == "NEW") {
                            if (resolveId == req.id) {
                                OutlinedTextField(value = resolveNotes, onValueChange = { resolveNotes = it }, label = { Text("Resolution Notes") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = {
                                        scope.launch {
                                            try { repo.resolveRequest(req.id ?: "", resolveNotes) } catch (_: Exception) {}
                                            resolveId = null; resolveNotes = ""
                                        }
                                    }) { Text("✅ Resolve") }
                                    OutlinedButton(onClick = { resolveId = null }) { Text("Cancel") }
                                }
                            } else {
                                OutlinedButton(onClick = { resolveId = req.id }) {
                                    Icon(Icons.Default.CheckCircle, null, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Mark Resolved")
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (clientPhone.isNotBlank()) {
                                OutlinedButton(onClick = {
                                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clientPhone")))
                                }, modifier = Modifier.weight(0.4f)) {
                                    Icon(Icons.Default.Phone, null, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Call", fontSize = 11.sp)
                                }
                            }
                            Button(onClick = { onChatWith(clientPhone.ifBlank { req.contactId ?: "" }, "#${req.id?.take(8)?.uppercase()}") }, modifier = Modifier.weight(0.6f)) {
                                Icon(Icons.Default.Forum, null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Chat as Sabi", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
// TAB 5: CHAT
// ═══════════════════════════════════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatTab(
    contactName: String,
    contactPhone: String,
    contact: RetailContact?,
    messages: List<RetailMessage>,
    context: android.content.Context,
    isSending: Boolean,
    onSendMessage: (String) -> Unit
) {
    if (contactPhone.isBlank()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Default.Forum, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Text("Select a client, lead, quote, or ticket to start chatting.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }

    var replyText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Chat Header
        Card(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(contactName.ifBlank { "WhatsApp Client" }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(contactPhone, style = MaterialTheme.typography.bodySmall)
                    Text("💬 Messages sent as Sabi Bot", style = MaterialTheme.typography.labelSmall, color = Color(0xFF10B981))
                }
                IconButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$contactPhone")))
                }) {
                    Icon(Icons.Default.Phone, "Call", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }

        // Message Stream
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            items(messages) { msg ->
                val isInbound = msg.direction == "INBOUND"
                val bgColor = if (isInbound) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFDCF8C6)
                val textColor = if (isInbound) MaterialTheme.colorScheme.onSurfaceVariant else Color.Black

                Box(modifier = Modifier.fillMaxWidth()) {
                    Card(
                        modifier = Modifier.widthIn(max = 280.dp).align(if (isInbound) Alignment.CenterStart else Alignment.CenterEnd),
                        colors = CardDefaults.cardColors(containerColor = bgColor)
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(msg.messageText ?: "[Media/Action]", style = MaterialTheme.typography.bodySmall, color = textColor)
                            Text(
                                "${if (isInbound) "👤 Client" else "🤖 Sabi"} • ${msg.createdAt?.takeLast(8) ?: ""}",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isInbound) MaterialTheme.colorScheme.onSurfaceVariant else Color.DarkGray
                            )
                        }
                    }
                }
            }
        }

        // Input Bar
        Surface(tonalElevation = 6.dp, modifier = Modifier.fillMaxWidth()) {
            Row(modifier = Modifier.padding(12.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = replyText,
                    onValueChange = { replyText = it },
                    placeholder = { Text("Reply as Sabi...") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(24.dp),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline
                    )
                )
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(
                    onClick = {
                        if (replyText.isNotBlank()) {
                            onSendMessage(replyText)
                            replyText = ""
                        }
                    },
                    enabled = !isSending && replyText.isNotBlank(),
                    colors = IconButtonDefaults.iconButtonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    )
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.Send, contentDescription = "Send")
                    }
                }
            }
        }
    }
}
