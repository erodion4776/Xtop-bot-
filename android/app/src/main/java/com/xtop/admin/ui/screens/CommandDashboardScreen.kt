package com.xtop.admin.ui.screens

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.ActivityEvent
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommandDashboardScreen(
    navController: NavController,
    repo: CommandCentreRepository
) {
    val scope = rememberCoroutineScope()
    var stats by remember { mutableStateOf(mapOf<String, Int>()) }
    var activity by remember { mutableStateOf<List<ActivityEvent>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            stats = repo.getDashboardStats()
            activity = repo.getRecentActivity(20)
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("XTOP Command Centre", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("Sales & Client Management", fontSize = 12.sp, color = Color.Gray)
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
                item {
                    Text("TODAY", color = Color(0xFF94A3B8), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatCard("Active Users", stats["activeUsers"] ?: 0, Icons.Default.People, Color(0xFF38BDF8), Modifier.weight(1f))
                        StatCard("Conversations", stats["conversations"] ?: 0, Icons.Default.Chat, Color(0xFFA855F7), Modifier.weight(1f))
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatCard("New Leads", stats["newLeads"] ?: 0, Icons.Default.TrendingUp, Color(0xFF22C55E), Modifier.weight(1f))
                        StatCard("New Tickets", stats["newTickets"] ?: 0, Icons.Default.Notifications, Color(0xFFF97316), Modifier.weight(1f))
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        QuickNavCard("💬 Inbox", "Customer messages", Modifier.weight(1f)) {
                            navController.navigate("inbox")
                        }
                        QuickNavCard("🎯 Leads", "Manage leads", Modifier.weight(1f)) {
                            navController.navigate("leads")
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        QuickNavCard("🎫 Tickets", "Support tickets", Modifier.weight(1f)) {
                            navController.navigate("tickets")
                        }
                        QuickNavCard("👥 Clients", "All clients", Modifier.weight(1f)) {
                            navController.navigate("clients")
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        QuickNavCard("🔴 Live Activity", "Real-time events", Modifier.weight(1f)) {
                            navController.navigate("live_activity")
                        }
                        QuickNavCard("🔔 Notifications", "Alerts", Modifier.weight(1f)) {
                            navController.navigate("notifications")
                        }
                    }
                }

                item {
                    Spacer(Modifier.height(8.dp))
                    Text("🔴 NEEDS ATTENTION", color = Color(0xFFEF4444), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }

                items(activity.filter { it.direction == "INBOUND" }.take(5)) { event ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                navController.navigate("client_profile/${event.phone_number}")
                            },
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .padding(14.dp)
                                .fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    event.contact_name ?: event.phone_number,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    event.message_body?.take(50) ?: event.module ?: "Activity",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                            }
                            Text(
                                event.created_at.takeLast(8).take(5),
                                color = Color(0xFF64748B),
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StatCard(title: String, value: Int, icon: ImageVector, color: Color, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(title, color = Color(0xFF94A3B8), fontSize = 11.sp)
            }
            Spacer(Modifier.height(6.dp))
            Text(value.toString(), color = color, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun QuickNavCard(title: String, subtitle: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(
        modifier = modifier.clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Color(0xFF64748B), fontSize = 11.sp)
        }
    }
}
