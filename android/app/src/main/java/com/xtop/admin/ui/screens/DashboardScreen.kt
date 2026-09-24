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
import androidx.navigation.NavController
import com.xtop.admin.data.models.AuditLog
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

data class StatCard(val label: String, val value: String, val icon: ImageVector, val color: androidx.compose.ui.graphics.Color)
data class NavItem(val title: String, val subtitle: String, val icon: ImageVector, val route: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()

    var stats by remember { mutableStateOf<List<StatCard>>(emptyList()) }
    var recentLogs by remember { mutableStateOf<List<AuditLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            try {
                val s = listOf(
                    StatCard("Students", repo.getStudentCount().toString(), Icons.Default.People, MaterialTheme.colorScheme.primary),
                    StatCard("Active Courses", repo.getActiveCourseCount().toString(), Icons.Default.MenuBook, MaterialTheme.colorScheme.secondary),
                    StatCard("Attendance Today", repo.getTodayAttendanceCount().toString(), Icons.Default.EventAvailable, MaterialTheme.colorScheme.tertiary),
                    StatCard("CBT Attempts", repo.getCbtAttemptCount().toString(), Icons.Default.Quiz, MaterialTheme.colorScheme.error),
                    StatCard("Avg CBT Score", "%.1f%%".format(repo.getAverageCbtScore()), Icons.Default.TrendingUp, MaterialTheme.colorScheme.primary),
                    StatCard("Pass Rate", "%.1f%%".format(repo.getPassRate()), Icons.Default.CheckCircle, MaterialTheme.colorScheme.secondary),
                    StatCard("Published Lessons", repo.getPublishedLessonCount().toString(), Icons.Default.AutoStories, MaterialTheme.colorScheme.tertiary),
                    StatCard("Active Access", repo.getActiveAccessCount().toString(), Icons.Default.Key, MaterialTheme.colorScheme.error)
                )
                stats = s
                recentLogs = repo.getRecentAuditLogs()
            } catch (_: Exception) {}
            loading = false
        }
    }

    val navItems = listOf(
        NavItem("Courses & Content", "Manage courses, modules, lessons & materials", Icons.Default.MenuBook, "courses"),
        NavItem("Students", "Student profiles, registration & history", Icons.Default.People, "students"),
        NavItem("Attendance", "Record & view daily attendance", Icons.Default.EventAvailable, "attendance"),
        NavItem("Course Access", "Grant, block & manage student access", Icons.Default.Key, "course_access"),
        NavItem("Exams & CBT", "Create exams, question bank & CBT settings", Icons.Default.Quiz, "exams"),
        NavItem("Results", "View scores, calculate & release results", Icons.Default.Assessment, "results"),
        NavItem("AI Generator", "Generate lessons & CBT with AI (draft mode)", Icons.Default.AutoAwesome, "ai_generator"),
        NavItem("Manual Editor", "Create courses manually with image upload", Icons.Default.EditNote, "manual_course_editor"),
        NavItem("CSV Import", "Bulk import students, courses & questions", Icons.Default.UploadFile, "csv_import"),
        NavItem("Media Library", "Upload & manage images, PDFs & materials", Icons.Default.PhotoLibrary, "media_library"),
        NavItem("Bot Activity", "WhatsApp bot event logs & interactions", Icons.Default.SmartToy, "bot_activity"),
        NavItem("Analytics", "Academic performance & engagement stats", Icons.Default.BarChart, "analytics"),
        NavItem("Admin Users", "Manage admin roles & permissions", Icons.Default.AdminPanelSettings, "admin_users"),
        NavItem("Audit Logs", "Track all administrative actions", Icons.Default.ReceiptLong, "audit_logs"),
        NavItem("Settings", "System, WhatsApp, database & security", Icons.Default.Settings, "settings")
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Bot Admin", fontWeight = FontWeight.Bold)
                        Text("Engr. Ero E-Learning Hub", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Stats Grid
            item {
                Text("Dashboard Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            if (loading) {
                item { CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally)) }
            } else {
                items(stats.chunked(2)) { row ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { stat ->
                            Card(modifier = Modifier.weight(1f)) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Icon(stat.icon, null, tint = stat.color, modifier = Modifier.size(24.dp))
                                    Spacer(Modifier.height(4.dp))
                                    Text(stat.value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                    Text(stat.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            // Recent Activity
            item {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Text("Recent Activity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }

            if (recentLogs.isEmpty()) {
                item { Text("No recent activity yet.", style = MaterialTheme.typography.bodySmall) }
            } else {
                items(recentLogs) { log ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.History, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("${log.action} — ${log.entity}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                Text("by ${log.adminUser} • ${log.createdAt?.take(16) ?: ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            // Navigation Grid
            item {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Text("Modules", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
