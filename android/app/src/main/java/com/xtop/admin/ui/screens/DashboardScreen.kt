package com.xtop.admin.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class DashboardStats(
    val totalContacts: Int = 0,
    val todayMessages: Int = 0,
    val totalOrders: Int = 0,
    val openOrders: Int = 0
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val scope = rememberCoroutineScope()
    var stats by remember { mutableStateOf(DashboardStats()) }
    var isRefreshing by remember { mutableStateOf(false) }

    fun fetchStats() {
        scope.launch {
            isRefreshing = true
            try {
                val baseUrl = SupabaseClient.getSupabaseUrl().trimEnd('/')
                val apiKey = SupabaseClient.getSupabaseKey()
                val url = URL("$baseUrl/functions/v1/whatsapp-webhook?action=stats")

                withContext(Dispatchers.IO) {
                    val conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 7000
                    conn.readTimeout = 7000
                    conn.setRequestProperty("apikey", apiKey)
                    conn.setRequestProperty("Authorization", "Bearer $apiKey")

                    if (conn.responseCode == 200) {
                        val response = conn.inputStream.bufferedReader().readText()
                        val json = JSONObject(response).optJSONObject("data")
                        if (json != null) {
                            stats = DashboardStats(
                                totalContacts = json.optInt("totalContacts", 0),
                                todayMessages = json.optInt("todayMessages", 0),
                                totalOrders = json.optInt("totalOrders", 0),
                                openOrders = json.optInt("openOrders", 0)
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isRefreshing = false
            }
        }
    }

    LaunchedEffect(Unit) {
        fetchStats()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(Color(0xFF10B981), shape = CircleShape)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                "XTOP Command Centre",
                                color = Color(0xFF38BDF8),
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Text(
                            "Sabi Assistant & Enterprise CRM",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { fetchStats() }) {
                        if (isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color(0xFF38BDF8),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Refresh",
                                tint = Color(0xFF38BDF8)
                            )
                        }
                    }
                    IconButton(onClick = { navController.navigate("notifications") }) {
                        Icon(
                            Icons.Default.Notifications,
                            contentDescription = "Notifications",
                            tint = Color(0xFFFBBF24)
                        )
                    }
                    IconButton(onClick = { navController.navigate("settings") }) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = "Settings",
                            tint = Color(0xFF94A3B8)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF1E293B))
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(modifier = Modifier.height(4.dp)) }

            // ══════════════════════════════════════════════════
            // 1. STATS METRICS GRID (CLICKABLE)
            // ══════════════════════════════════════════════════
            item {
                Text(
                    "REAL-TIME BOT METRICS",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    MetricCard(
                        title = "Today's Msgs",
                        value = stats.todayMessages.toString(),
                        sub = "Live Inbound + Outbound",
                        icon = Icons.Default.Send,
                        color = Color(0xFF38BDF8),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("live_activity") }
                    )
                    MetricCard(
                        title = "Open Tickets",
                        value = stats.openOrders.toString(),
                        sub = "Needs action",
                        icon = Icons.Default.Warning,
                        color = Color(0xFFFBBF24),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("tickets") }
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    MetricCard(
                        title = "Total Clients",
                        value = stats.totalContacts.toString(),
                        sub = "WhatsApp directory",
                        icon = Icons.Default.Person,
                        color = Color(0xFF10B981),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("clients") }
                    )
                    MetricCard(
                        title = "Active Leads",
                        value = stats.totalOrders.toString(),
                        sub = "Commercial pipeline",
                        icon = Icons.Default.TrendingUp,
                        color = Color(0xFFA855F7),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("leads") }
                    )
                }
            }

            // ══════════════════════════════════════════════════
            // 2. COMMAND CENTRE CORE WORKFLOWS
            // ══════════════════════════════════════════════════
            item {
                Text(
                    "COMMAND CENTRE CORE WORKFLOWS",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                // Highlight Card: Direct CRM & Sabi Chat Console
                HighlightActionCard(
                    title = "Retail CRM & Sabi Live Chat",
                    subtitle = "Manage clients, send WhatsApp replies as Sabi & toggle Agent Handoff",
                    badge = if (stats.openOrders > 0) "${stats.openOrders} PENDING" else "ACTIVE",
                    badgeColor = if (stats.openOrders > 0) Color(0xFFF59E0B) else Color(0xFF10B981),
                    gradient = listOf(Color(0xFF1E3A8A), Color(0xFF1E293B)),
                    icon = Icons.Default.Chat,
                    onClick = { navController.navigate("retail_dashboard") }
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Highlight Card: Live Activity Stream
                HighlightActionCard(
                    title = "Live Customer Activity Stream",
                    subtitle = "Real-time log of customer menu selections, bot queries & events",
                    badge = "LIVE STREAM",
                    badgeColor = Color(0xFF38BDF8),
                    gradient = listOf(Color(0xFF0C4A6E), Color(0xFF1E293B)),
                    icon = Icons.Default.Search,
                    onClick = { navController.navigate("live_activity") }
                )
            }

            // ══════════════════════════════════════════════════
            // 3. SALES, CLIENTS & SUPPORT TICKETS
            // ══════════════════════════════════════════════════
            item {
                Text(
                    "SALES, LEADS & TICKETS",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    QuickNavButton(
                        title = "Sales Leads",
                        subtitle = "Pipeline & budgets",
                        icon = Icons.Default.TrendingUp,
                        iconTint = Color(0xFF22C55E),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("leads") }
                    )
                    QuickNavButton(
                        title = "Support Tickets",
                        subtitle = "Inbound requests",
                        icon = Icons.Default.Notifications,
                        iconTint = Color(0xFFF97316),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("tickets") }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    QuickNavButton(
                        title = "Clients Directory",
                        subtitle = "Profiles & call log",
                        icon = Icons.Default.People,
                        iconTint = Color(0xFF38BDF8),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("clients") }
                    )
                    QuickNavButton(
                        title = "Customer Inbox",
                        subtitle = "Chat conversations",
                        icon = Icons.Default.MailOutline,
                        iconTint = Color(0xFFA855F7),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("inbox") }
                    )
                }
            }

            // ══════════════════════════════════════════════════
            // 4. XTOPEDU ACADEMIC MANAGEMENT
            // ══════════════════════════════════════════════════
            item {
                Text(
                    "XTOPEDU SCHOOL SYSTEM",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    QuickNavButton(
                        title = "Courses & Slides",
                        subtitle = "Lesson modules",
                        icon = Icons.Default.Star,
                        iconTint = Color(0xFFFBBF24),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("courses") }
                    )
                    QuickNavButton(
                        title = "CBT Exams",
                        subtitle = "Online questions",
                        icon = Icons.Default.CheckCircle,
                        iconTint = Color(0xFF4ADE80),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("exams") }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    QuickNavButton(
                        title = "Students",
                        subtitle = "Records & levels",
                        icon = Icons.Default.Person,
                        iconTint = Color(0xFF60A5FA),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("students") }
                    )
                    QuickNavButton(
                        title = "Attendance",
                        subtitle = "Daily serial check",
                        icon = Icons.Default.DateRange,
                        iconTint = Color(0xFFC084FC),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("attendance") }
                    )
                }
            }

            // ══════════════════════════════════════════════════
            // 5. SYSTEM & AUDIT
            // ══════════════════════════════════════════════════
            item {
                Text(
                    "SYSTEM & ADMINISTRATION",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    QuickNavButton(
                        title = "Audit Logs",
                        subtitle = "Security records",
                        icon = Icons.Default.Lock,
                        iconTint = Color(0xFF94A3B8),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("audit_logs") }
                    )
                    QuickNavButton(
                        title = "Admin Users",
                        subtitle = "Team access",
                        icon = Icons.Default.AccountCircle,
                        iconTint = Color(0xFF94A3B8),
                        modifier = Modifier.weight(1f),
                        onClick = { navController.navigate("admin_users") }
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(24.dp)) }
        }
    }
}

// ══════════════════════════════════════════════════════
// COMPONENT: METRIC CARD (CLICKABLE)
// ══════════════════════════════════════════════════════
@Composable
fun MetricCard(
    title: String,
    value: String,
    sub: String,
    icon: ImageVector,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {}
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.clickable { onClick() }
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    title,
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
                Icon(
                    icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                value,
                color = color,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Text(
                sub,
                color = Color(0xFF64748B),
                fontSize = 10.sp
            )
        }
    }
}

// ══════════════════════════════════════════════════════
// COMPONENT: HIGHLIGHT ACTION CARD
// ══════════════════════════════════════════════════════
@Composable
fun HighlightActionCard(
    title: String,
    subtitle: String,
    badge: String,
    badgeColor: Color,
    gradient: List<Color>,
    icon: ImageVector,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .background(Brush.horizontalGradient(gradient))
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        color = Color(0x33FFFFFF),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.size(44.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            title,
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            subtitle,
                            color = Color(0xFFCBD5E1),
                            fontSize = 12.sp,
                            lineHeight = 16.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                Surface(
                    color = badgeColor,
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Text(
                        badge,
                        color = Color.Black,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}

// ══════════════════════════════════════════════════════
// COMPONENT: QUICK NAV BUTTON
// ══════════════════════════════════════════════════════
@Composable
fun QuickNavButton(
    title: String,
    subtitle: String,
    icon: ImageVector,
    iconTint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.clickable { onClick() }
    ) {
        Row(
            modifier = Modifier
                .padding(14.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(22.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    title,
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    subtitle,
                    color = Color(0xFF64748B),
                    fontSize = 11.sp
                )
            }
        }
    }
}
