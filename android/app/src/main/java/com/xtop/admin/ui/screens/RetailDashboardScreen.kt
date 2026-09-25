package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.navigation.NavController
import com.xtop.admin.data.repository.*
import kotlinx.coroutines.launch

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

    var statContacts by remember { mutableIntStateOf(0) }
    var statLeads by remember { mutableIntStateOf(0) }
    var statQuotations by remember { mutableIntStateOf(0) }
    var statRequests by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            try {
                statContacts = repo.getTotalContactCount()
                statLeads = repo.getActiveLeadCount()
                statQuotations = repo.getPresentedQuotationCount()
                statRequests = repo.getNewRequestCount()
                contacts = repo.getContacts()
                leads = repo.getLeads()
                quotations = repo.getQuotations()
                requests = repo.getAgentRequests()
            } catch (_: Exception) {}
            loading = false
        }
    }

    val tabs = listOf("Overview", "Clients", "Leads", "Quotes", "Tickets", "Chat")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Retail CRM", fontWeight = FontWeight.Bold)
                        Text("Business Dashboard", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            loading = true
                            try {
                                contacts = repo.getContacts()
                                leads = repo.getLeads()
                                quotations = repo.getQuotations()
                                requests = repo.getAgentRequests()
                            } catch (_: Exception) {}
                            loading = false
                        }
                    }) { Icon(Icons.Default.Refresh, "Refresh") }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            ScrollableTabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(title) })
                }
            }

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                when (selectedTab) {
                    0 -> OverviewTab(statContacts, statLeads, statQuotations, statRequests)
                    1 -> ClientsTab(contacts, context) { contact ->
                        selectedContact = contact
                        scope.launch {
                            chatMessages = repo.getMessages(contact.id ?: "")
                        }
                        selectedTab = 5
                    }
                    2 -> LeadsTab(leads, repo, scope)
                    3 -> QuotationsTab(quotations, repo, scope)
                    4 -> TicketsTab(requests, repo, scope)
                    5 -> ChatTab(selectedContact, chatMessages, context)
                }
            }
        }
    }
}

@Composable
fun OverviewTab(contacts: Int, leads: Int, quotations: Int, requests: Int) {
    val stats = listOf(
        Triple("Total Clients", "$contacts", Icons.Default.People),
        Triple("Active Leads", "$leads", Icons.Default.TrendingUp),
        Triple("Open Quotes", "$quotations", Icons.Default.Receipt),
        Triple("New Tickets", "$requests", Icons.Default.Notifications)
    )

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Business Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
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

@Composable
fun ClientsTab(contacts: List<RetailContact>, context: android.content.Context, onViewChat: (RetailContact) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Clients & Contacts (${contacts.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(contacts) { c ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(c.name ?: c.phone, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("📞 ${c.phone}", style = MaterialTheme.typography.bodySmall)
                    c.businessName?.let { Text("🏢 $it", style = MaterialTheme.typography.bodySmall) }
                    c.email?.let { Text("✉️ $it", style = MaterialTheme.typography.labelSmall) }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            val cleanPhone = c.phone.replace("+", "").replace(" ", "")
                            val url = "https://wa.me/$cleanPhone?text=Hi%20${Uri.encode(c.name ?: "there")},%20this%20is%20Xtop%20Retail%20Technologies."
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        }, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Chat, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("WhatsApp")
                        }
                        OutlinedButton(onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${c.phone}")))
                        }, modifier = Modifier.weight(0.7f)) {
                            Icon(Icons.Default.Phone, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Call")
                        }
                        OutlinedButton(onClick = { onViewChat(c) }, modifier = Modifier.weight(0.7f)) {
                            Icon(Icons.Default.Forum, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Chat")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LeadsTab(leads: List<RetailLead>, repo: RetailRepository, scope: kotlinx.coroutines.CoroutineScope) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Sales Leads (${leads.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(leads) { lead ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(lead.businessName ?: "Lead", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (lead.status) { "QUALIFYING" -> Color(0xFFFF9800); "QUOTED" -> Color(0xFF2196F3); "PACKAGE_SELECTED" -> Color(0xFF4CAF50); else -> Color.Gray }
                        Text(lead.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${lead.serviceType ?: "General"} • ${lead.industry ?: ""}", style = MaterialTheme.typography.bodySmall)
                    lead.budgetRange?.let { Text("Budget: $it", style = MaterialTheme.typography.labelSmall) }
                    if (lead.estimatedMinPrice != null && lead.estimatedMaxPrice != null) {
                        Text("Estimate: ₦${lead.estimatedMinPrice?.toLong()?.toString()} – ₦${lead.estimatedMaxPrice?.toLong()?.toString()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Text(lead.createdAt?.take(10) ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun QuotationsTab(quotations: List<RetailQuotation>, repo: RetailRepository, scope: kotlinx.coroutines.CoroutineScope) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Quotations (${quotations.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(quotations) { q ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(q.quotationNumber, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (q.status) { "PRESENTED" -> Color(0xFFFF9800); "PACKAGE_SELECTED" -> Color(0xFF4CAF50); "AGENT_REVIEW" -> Color(0xFF2196F3); else -> Color.Gray }
                        Text(q.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text(q.title, style = MaterialTheme.typography.bodySmall)
                    Text("₦${q.estimatedMinPrice.toLong()} – ₦${q.estimatedMaxPrice.toLong()} ${q.currency}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
                    Text(q.createdAt?.take(10) ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun TicketsTab(requests: List<RetailAgentRequest>, repo: RetailRepository, scope: kotlinx.coroutines.CoroutineScope) {
    var resolveId by remember { mutableStateOf<String?>(null) }
    var resolveNotes by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Support Tickets (${requests.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        items(requests) { req ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("#${req.id?.take(8)?.uppercase()}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        val statusColor = when (req.status) { "NEW" -> Color(0xFFFF9800); "RESOLVED" -> Color(0xFF4CAF50); else -> Color.Gray }
                        Text(req.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Text("${req.requestType} • ${req.priority}", style = MaterialTheme.typography.bodySmall)
                    Text(req.message.take(120), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    req.quotationSummary?.let { Text(it.take(80), style = MaterialTheme.typography.labelSmall) }
                    Text(req.createdAt?.take(16) ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    if (req.status == "NEW") {
                        if (resolveId == req.id) {
                            OutlinedTextField(value = resolveNotes, onValueChange = { resolveNotes = it }, label = { Text("Resolution Notes") }, modifier = Modifier.fillMaxWidth(), singleLine = false, minLines = 2)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    scope.launch {
                                        try { repo.resolveRequest(req.id ?: "", resolveNotes) } catch (_: Exception) {}
                                        resolveId = null
                                        resolveNotes = ""
                                    }
                                }) { Text("Resolve") }
                                OutlinedButton(onClick = { resolveId = null }) { Text("Cancel") }
                            }
                        } else {
                            OutlinedButton(onClick = { resolveId = req.id }) {
                                Icon(Icons.Default.CheckCircle, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Mark Resolved")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ChatTab(contact: RetailContact?, messages: List<RetailMessage>, context: android.content.Context) {
    if (contact == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Select a client from the Clients tab to view their chat history.", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item {
            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(contact.name ?: contact.phone, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(contact.phone, style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = {
                        val cleanPhone = contact.phone.replace("+", "").replace(" ", "")
                        val url = "https://wa.me/$cleanPhone"
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    }) {
                        Icon(Icons.Default.Chat, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Open WhatsApp")
                    }
                }
            }
        }

        item { Text("Chat History (${messages.size} messages)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold) }

        if (messages.isEmpty()) {
            item { Text("No messages recorded yet.", style = MaterialTheme.typography.bodySmall) }
        }

        items(messages) { msg ->
            val isInbound = msg.direction == "INBOUND"
            val bgColor = if (isInbound) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFDCF8C6)
            val alignment = if (isInbound) Alignment.Start else Alignment.End

            Box(modifier = Modifier.fillMaxWidth()) {
                Card(
                    modifier = Modifier.widthIn(max = 280.dp).align(if (isInbound) Alignment.CenterStart else Alignment.CenterEnd),
                    colors = CardDefaults.cardColors(containerColor = bgColor)
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text(msg.messageText ?: "[Media]", style = MaterialTheme.typography.bodySmall)
                        Text(
                            "${if (isInbound) "👤 Client" else "🤖 Bot"} • ${msg.createdAt?.takeLast(8) ?: ""}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
