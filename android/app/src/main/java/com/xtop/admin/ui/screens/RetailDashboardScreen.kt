package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
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
import com.xtop.admin.data.repository.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RetailDashboardScreen(navController: NavController) {
    val context = LocalContext.current
    val repo = remember { RetailRepository() }
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableIntStateOf(0) }
    var contacts by remember { mutableStateOf<List<RetailContact>>(emptyList()) }
    var chatMessages by remember { mutableStateOf<List<RetailMessage>>(emptyList()) }
    var selectedContact by remember { mutableStateOf<RetailContact?>(null) }

    var statContacts by remember { mutableIntStateOf(0) }
    var statLeads by remember { mutableIntStateOf(0) }
    var statQuotations by remember { mutableIntStateOf(0) }
    var statRequests by remember { mutableIntStateOf(0) }
    
    var loading by remember { mutableStateOf(true) }
    var isSending by remember { mutableStateOf(false) }

    fun refreshData() {
        scope.launch {
            loading = true
            try {
                statContacts = repo.getTotalContactCount()
                statLeads = repo.getActiveLeadCount()
                statQuotations = repo.getPresentedQuotationCount()
                statRequests = repo.getNewRequestCount()
                contacts = repo.getContacts()
                if (selectedContact != null) {
                    chatMessages = repo.getMessages(selectedContact?.id ?: "")
                }
            } catch (_: Exception) {}
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refreshData()
    }

    // Condensed tabs (Removed Leads, Quotes, and Tickets as requested)
    val tabs = listOf("Overview", "Clients", "Chat")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Retail CRM", fontWeight = FontWeight.Bold)
                        Text("Live Bot Assistant Console", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index, 
                        onClick = { selectedTab = index }, 
                        text = { Text(title, fontWeight = FontWeight.Bold) }
                    )
                }
            }

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                when (selectedTab) {
                    0 -> OverviewTab(statContacts, statRequests)
                    1 -> ClientsTab(contacts, context) { contact ->
                        selectedContact = contact
                        scope.launch {
                            chatMessages = repo.getMessages(contact.id ?: "")
                        }
                        selectedTab = 2 // Move directly to active Chat tab
                    }
                    2 -> ChatTab(
                        contact = selectedContact,
                        messages = chatMessages,
                        context = context,
                        isSending = isSending,
                        onSendMessage = { messageText ->
                            val phone = selectedContact?.phone ?: return@ChatTab
                            scope.launch {
                                isSending = true
                                val success = withContext(Dispatchers.IO) {
                                    try {
                                        val url = URL("https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard?action=send-message")
                                        val conn = url.openConnection() as HttpURLConnection
                                        conn.requestMethod = "POST"
                                        conn.setRequestProperty("Content-Type", "application/json")
                                        conn.doOutput = true
                                        
                                        val payload = JSONObject().apply {
                                            put("phone", phone)
                                            put("message", messageText)
                                        }
                                        
                                        conn.outputStream.write(payload.toString().toByteArray())
                                        conn.responseCode == 200
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                        false
                                    }
                                }
                                if (success) {
                                    chatMessages = repo.getMessages(selectedContact?.id ?: "")
                                } else {
                                    Toast.makeText(context, "Delivery failed", Toast.LENGTH_SHORT).show()
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

@Composable
fun OverviewTab(contacts: Int, requests: Int) {
    val stats = listOf(
        Triple("Total Clients", "$contacts", Icons.Default.People),
        Triple("Inbound Tickets", "$requests", Icons.Default.Notifications)
    )

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Dashboard Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
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
                        }, modifier = Modifier.weight(1.2f)) {
                            Icon(Icons.Default.Chat, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Direct WA", fontSize = 11.sp)
                        }
                        OutlinedButton(onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${c.phone}")))
                        }, modifier = Modifier.weight(0.8f)) {
                            Icon(Icons.Default.Phone, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Call", fontSize = 11.sp)
                        }
                        OutlinedButton(onClick = { onViewChat(c) }, modifier = Modifier.weight(0.9f)) {
                            Icon(Icons.Default.Forum, null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Sabi Chat", fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatTab(
    contact: RetailContact?, 
    messages: List<RetailMessage>, 
    context: android.content.Context,
    isSending: Boolean,
    onSendMessage: (String) -> Unit
) {
    if (contact == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Select a client from the Clients tab to start a direct chat.", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    var replyText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Auto Scroll to Bottom on Message updates
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Chat Target Summary Header
        Card(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(contact.name ?: "WhatsApp User", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(contact.phone, style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.phone}")))
                }) {
                    Icon(Icons.Default.Phone, "Call Client", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }

        // Live Chat Stream
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            items(messages) { msg ->
                val isInbound = msg.direction == "INBOUND"
                val bgColor = if (isInbound) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFDCF8C6)
                val textColor = if (isInbound) MaterialTheme.colorScheme.onSurfaceVariant else Color.Black
                val alignment = if (isInbound) Alignment.CenterStart else Alignment.CenterEnd

                Box(modifier = Modifier.fillMaxWidth()) {
                    Card(
                        modifier = Modifier.widthIn(max = 280.dp).align(alignment),
                        colors = CardDefaults.cardColors(containerColor = bgColor)
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(msg.messageText ?: "[Media/Action]", style = MaterialTheme.typography.bodySmall, color = textColor)
                            Text(
                                "${if (isInbound) "👤 Client" else "🤖 Sabi Bot"} • ${msg.createdAt?.takeLast(8) ?: ""}",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isInbound) MaterialTheme.colorScheme.onSurfaceVariant else Color.DarkGray
                            )
                        }
                    }
                }
            }
        }

        // Active Message Input Bar
        Surface(
            tonalElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(12.dp).fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = replyText,
                    onValueChange = { replyText = it },
                    placeholder = { Text("Reply to client as Sabi...") },
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
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp), 
                            color = MaterialTheme.colorScheme.onPrimary, 
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Send, contentDescription = "Send")
                    }
                }
            }
        }
    }
}
