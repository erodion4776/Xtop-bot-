package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.*
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientProfileScreen(
    navController: NavController,
    repo: CommandCentreRepository,
    contactId: String
) {
    val scope = rememberCoroutineScope()
    var client by remember { mutableStateOf<ClientProfile?>(null) }
    var conversation by remember { mutableStateOf<ConversationRecord?>(null) }
    var messages by remember { mutableStateOf<List<MessageRecord>>(emptyList()) }
    var leads by remember { mutableStateOf<List<LeadRecord>>(emptyList()) }
    var tickets by remember { mutableStateOf<List<TicketRecord>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var isAgentMode by remember { mutableStateOf(false) }

    LaunchedEffect(contactId) {
        scope.launch {
            client = repo.getClientById(contactId)
            conversation = repo.getConversationByContact(contactId)
            messages = repo.getMessages(contactId, 50)
            leads = repo.getLeads()
            tickets = repo.getTickets()
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            client?.name ?: "Client Profile",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                        Text(
                            client?.phone ?: contactId,
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                actions = {
                    TextButton(onClick = {
                        scope.launch {
                            val convId = conversation?.id ?: return@launch
                            if (isAgentMode) {
                                repo.returnToBot(convId)
                                isAgentMode = false
                            } else {
                                repo.takeOverConversation(convId, client?.phone ?: "")
                                isAgentMode = true
                            }
                        }
                    }) {
                        Text(
                            if (isAgentMode) "🤖 Return to Bot" else "👨🏽‍💼 Take Over",
                            color = if (isAgentMode) Color(0xFF22C55E) else Color(0xFFF59E0B),
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A),
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF38BDF8))
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // ── Client Info Card ──
                item {
                    Text(
                        "CUSTOMER INFORMATION",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            ProfileRow("Full Name", client?.name ?: "Unknown")
                            ProfileRow("WhatsApp", client?.phone ?: "—")
                            ProfileRow("Business", client?.business_name ?: "—")
                            ProfileRow("Email", client?.email ?: "—")
                            ProfileRow("Joined", client?.created_at?.take(10) ?: "—")
                            ProfileRow("Last Active", client?.updated_at?.take(10) ?: "—")
                            ProfileRow(
                                "Bot Status",
                                if (isAgentMode) "🔴 Paused (Agent Active)" else "🟢 Active"
                            )
                            ProfileRow(
                                "Module",
                                conversation?.current_module ?: "MAIN_MENU"
                            )
                            ProfileRow(
                                "State",
                                conversation?.current_state ?: "IDLE"
                            )
                        }
                    }
                }

                // ── Quick Actions ──
                item {
                    Text(
                        "QUICK ACTIONS",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ActionButton("💬 Open Chat", Modifier.weight(1f)) {
                            navController.navigate("chat/$contactId")
                        }
                        ActionButton("🎯 View Lead", Modifier.weight(1f)) {
                            navController.navigate("leads")
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ActionButton("🎫 Create Ticket", Modifier.weight(1f)) {
                            navController.navigate("tickets")
                        }
                        ActionButton("📞 Call Client", Modifier.weight(1f)) {
                            // Opens phone dialer via intent
                        }
                    }
                }

                // ── Related Leads ──
                item {
                    Text(
                        "RELATED LEADS",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                val clientLeads = leads.filter { it.contact_id == contactId }
                if (clientLeads.isEmpty()) {
                    item {
                        Text("No leads found for this client.", color = Color(0xFF64748B), fontSize = 12.sp)
                    }
                } else {
                    items(clientLeads) { lead ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        "LD-${lead.id.take(8).uppercase()}",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Surface(
                                        color = when (lead.status) {
                                            "QUALIFYING" -> Color(0xFF3B82F6)
                                            "QUOTED" -> Color(0xFF22C55E)
                                            "PACKAGE_SELECTED" -> Color(0xFF8B5CF6)
                                            else -> Color(0xFF6B7280)
                                        },
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            lead.status ?: "NEW",
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                                Text(
                                    "Service: ${lead.service_type ?: "General"}",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                                Text(
                                    "Budget: ${lead.budget_range ?: "TBD"}",
                                    color = Color(0xFF38BDF8),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                // ── Related Tickets ──
                item {
                    Text(
                        "RELATED TICKETS",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                val clientTickets = tickets.filter { it.contact_id == contactId }
                if (clientTickets.isEmpty()) {
                    item {
                        Text("No tickets found for this client.", color = Color(0xFF64748B), fontSize = 12.sp)
                    }
                } else {
                    items(clientTickets) { ticket ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        "TK-${ticket.id.take(8).uppercase()}",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Surface(
                                        color = when (ticket.priority) {
                                            "HIGH" -> Color(0xFFEF4444)
                                            "NORMAL" -> Color(0xFFF59E0B)
                                            else -> Color(0xFF6B7280)
                                        },
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            ticket.priority,
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                                Text(
                                    ticket.message.take(60),
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                                Text(
                                    "Status: ${ticket.status}",
                                    color = Color(0xFF38BDF8),
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                // ── Activity History ──
                item {
                    Text(
                        "ACTIVITY HISTORY",
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                if (messages.isEmpty()) {
                    item {
                        Text("No message history.", color = Color(0xFF64748B), fontSize = 12.sp)
                    }
                } else {
                    items(messages.takeLast(20).reversed()) { msg ->
                        val isInbound = msg.direction == "INBOUND"
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = if (isInbound) Color(0xFF1E293B) else Color(0xFF1E3A5F)
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(
                                    if (isInbound) "👤 Client" else "🤖 Bot",
                                    color = if (isInbound) Color(0xFF38BDF8) else Color(0xFFA855F7),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    msg.displayText.take(120),
                                    color = Color.White,
                                    fontSize = 12.sp
                                )
                                Text(
                                    msg.created_at.take(16),
                                    color = Color(0xFF64748B),
                                    fontSize = 10.sp
                                )
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
fun ProfileRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color(0xFF94A3B8), fontSize = 12.sp)
        Text(value, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun ActionButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
        shape = RoundedCornerShape(10.dp)
    ) {
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}
