package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.ActivityEvent
import com.xtop.admin.data.LeadRecord
import com.xtop.admin.data.TicketRecord
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.launch

data class NotificationItem(
    val id: String,
    val type: String,       // "LEAD", "TICKET", "AGENT_REQUEST", "ACTIVITY"
    val title: String,
    val body: String,
    val time: String,
    val priority: String,   // "HIGH", "NORMAL", "LOW"
    val isRead: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    navController: NavController,
    repo: CommandCentreRepository
) {
    val scope = rememberCoroutineScope()
    var notifications by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            val items = mutableListOf<NotificationItem>()

            // Gather leads as notifications
            val leads = repo.getLeads(limit = 20)
            leads.forEach { lead ->
                items.add(
                    NotificationItem(
                        id = lead.id,
                        type = "LEAD",
                        title = "🔥 New Lead: ${lead.business_name ?: "Unknown"}",
                        body = "Service: ${lead.service_type ?: "General"} | Budget: ${lead.budget_range ?: "TBD"}",
                        time = lead.created_at,
                        priority = if (lead.status == "QUALIFYING") "HIGH" else "NORMAL"
                    )
                )
            }

            // Gather tickets as notifications
            val tickets = repo.getTickets(limit = 20)
            tickets.filter { it.status == "NEW" }.forEach { ticket ->
                items.add(
                    NotificationItem(
                        id = ticket.id,
                        type = "TICKET",
                        title = "🎫 New Ticket: #${ticket.id.take(8).uppercase()}",
                        body = ticket.message.take(80),
                        time = ticket.created_at,
                        priority = ticket.priority
                    )
                )
            }

            // Gather agent requests
            val agentTickets = tickets.filter { it.request_type == "GENERAL_ENQUIRY" && it.status == "NEW" }
            agentTickets.forEach { ticket ->
                items.add(
                    NotificationItem(
                        id = "agent_${ticket.id}",
                        type = "AGENT_REQUEST",
                        title = "👨🏽‍💼 Agent Request",
                        body = ticket.message.take(80),
                        time = ticket.created_at,
                        priority = "HIGH"
                    )
                )
            }

            // Sort by time descending
            notifications = items.sortedByDescending { it.time }
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("🔔 Notifications", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            "${notifications.count { it.priority == "HIGH" }} high priority",
                            fontSize = 12.sp,
                            color = Color(0xFFEF4444)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
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
        } else if (notifications.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Notifications, null, tint = Color(0xFF334155), modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(12.dp))
                    Text("No notifications yet.", color = Color(0xFF64748B))
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(notifications) { notif ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = if (notif.priority == "HIGH") Color(0xFF1E293B) else Color(0xFF1A2332)
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Row(modifier = Modifier.weight(1f)) {
                                // Priority indicator
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape),
                                    color = when (notif.priority) {
                                        "HIGH" -> Color(0xFFEF4444)
                                        "NORMAL" -> Color(0xFFF59E0B)
                                        else -> Color(0xFF22C55E)
                                    }
                                )
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(
                                        notif.title,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        notif.body,
                                        color = Color(0xFF94A3B8),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                            Text(
                                notif.time.takeLast(8).take(5),
                                color = Color(0xFF64748B),
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
