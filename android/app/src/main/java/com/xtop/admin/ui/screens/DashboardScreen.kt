package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.models.AuditLog
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

data class DashboardNavEntry(val title: String, val subtitle: String, val icon: ImageVector, val route: String)

data class DashboardRawStats(
    val studentCount: Int = 0,
    val activeCourseCount: Int = 0,
    val todayAttendanceCount: Int = 0,
    val cbtAttemptCount: Int = 0,
    val avgCbtScore: Double = 0.0,
    val passRate: Double = 0.0,
    val publishedLessonCount: Int = 0,
    val activeAccessCount: Int = 0
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()

    var rawStats by remember { mutableStateOf(DashboardRawStats()) }
    var recentLogs by remember { mutableStateOf<List<AuditLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    fun refreshDashboard() {
        scope.launch {
            loading = true
            try {
                val stats = DashboardRawStats(
                    studentCount = repo.getStudentCount(),
                    activeCourseCount = repo.getActiveCourseCount(),
                    todayAttendanceCount = repo.getTodayAttendanceCount(),
                    cbtAttemptCount = repo.getCbtAttemptCount(),
                    avgCbtScore = repo.getAverageCbtScore(),
                    passRate = repo.getPassRate(),
                    publishedLessonCount = repo.getPublishedLessonCount(),
                    activeAccessCount = repo.getActiveAccessCount()
                )
                rawStats = stats
                recentLogs = repo.getRecentAuditLogs()
            } catch (_: Exception) {}
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refreshDashboard()
    }

    val navItems = listOf(
        // RETAIL AUTOMATION / CRM
        DashboardNavEntry("Retail CRM", "Clients, leads, quotes & live help tickets", Icons.Default.Storefront, "retail_dashboard"),
        
        // CORE E-LEARNING
        DashboardNavEntry("Courses & Content", "Manage course modules, lessons & materials", Icons.Default.MenuBook, "courses"),
        DashboardNavEntry("Students", "Student academic profiles & history records", Icons.Default.People, "students"),
        DashboardNavEntry("Attendance", "Record, query & filter daily attendance", Icons.Default.EventAvailable, "attendance"),
        DashboardNavEntry("Course Access", "Grant, block & manage student access codes", Icons.Default.Key, "course_access"),
        DashboardNavEntry("Exams & CBT", "Exams, question banks & CBT configuration", Icons.Default.Quiz, "exams"),
        DashboardNavEntry("Results", "Calculate, lock & release official grades", Icons.Default.Assessment, "results"),
        
        // AUTHORING TOOLS
        DashboardNavEntry("AI Generator", "Draft course outlines, lessons & CBT with AI", Icons.Default.AutoAwesome, "ai_generator"),
        DashboardNavEntry("Manual Course Editor", "Create academic modules & lessons manually", Icons.Default.EditNote, "manual_course_editor"),
        DashboardNavEntry("CSV Bulk Import", "Import students, courses & questions from CSV", Icons.Default.UploadFile, "csv_import"),
        DashboardNavEntry("Media Library", "Upload & host diagrams, PDFs & slides", Icons.Default.PhotoLibrary, "media_library"),
        
        // SYSTEM LOGS & CONFIGURATIONS
        DashboardNavEntry("Bot Activity", "View live WhatsApp bot interaction logs", Icons.Default.SmartToy, "bot_activity"),
        DashboardNavEntry("Analytics", "Academic progress & CBT pass statistics", Icons.Default.BarChart, "analytics"),
        DashboardNavEntry("Admin Users", "Assign administrative roles & permissions", Icons.Default.AdminPanelSettings, "admin_users"),
        DashboardNavEntry("Audit Logs", "Immutable trail of all administrative actions", Icons.Default.ReceiptLong, "audit_logs"),
        DashboardNavEntry("Settings", "Configure API keys, WhatsApp, RLS & DB", Icons.Default.Settings, "settings")
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Bot Admin", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            "Engr. Ero E-Learning & Retail Hub",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { refreshDashboard() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text("E-Learning Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            if (loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            } else {
                val statCards = listOf(
                    Triple("Total Students", "${rawStats.studentCount}", Icons.Default.People),
                    Triple("Active Courses", "${rawStats.activeCourseCount}", Icons.Default.MenuBook),
                    Triple("Attendance Today", "${rawStats.todayAttendanceCount}", Icons.Default.EventAvailable),
                    Triple("CBT Attempts", "${rawStats.cbtAttemptCount}", Icons.Default.Quiz),
                    Triple("Avg CBT Score", "%.1f%%".format(rawStats.avgCbtScore), Icons.Default.TrendingUp),
                    Triple("Pass Rate", "%.1f%%".format(rawStats.passRate), Icons.Default.CheckCircle),
                    Triple("Published Lessons", "${rawStats.publishedLessonCount}", Icons.Default.AutoStories),
                    Triple("Active Access", "${rawStats.activeAccessCount}", Icons.Default.Key)
                )

                items(statCards.chunked(2)) { row ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (label, value, icon) ->
                            Card(modifier = Modifier.weight(1f)) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                                    Spacer(Modifier.height(4.dp))
                                    Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                    Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            item {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Text("Recent System Activity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            if (recentLogs.isEmpty()) {
                item { Text("No administrative action logs registered yet.", style = MaterialTheme.typography.bodySmall) }
            } else {
                items(recentLogs) { log ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.History, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("${log.action} — ${log.entity}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                Text(
                                    "by ${log.adminUser} • ${log.createdAt?.take(16) ?: ""}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            item {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Text("Admin Modules", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            items(navItems) { item ->
                Card(onClick = { navController.navigate(item.route) }, modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(item.icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
