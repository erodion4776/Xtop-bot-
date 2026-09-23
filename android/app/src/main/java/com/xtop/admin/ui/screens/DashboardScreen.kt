package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

data class DashboardMenuItem(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val route: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val menuItems = listOf(
        DashboardMenuItem(
            title = "AI Generator",
            subtitle = "Generate syllabus, diagrams & CBT with AI",
            icon = Icons.Default.AutoAwesome,
            route = "ai_generator"
        ),
        DashboardMenuItem(
            title = "Manual Course Editor",
            subtitle = "Create lessons, upload images & CBT questions",
            icon = Icons.Default.EditNote,
            route = "manual_course_editor"
        ),
        DashboardMenuItem(
            title = "CSV Bulk Import",
            subtitle = "Import courses & questions from CSV files",
            icon = Icons.Default.UploadFile,
            route = "csv_import"
        ),
        DashboardMenuItem(
            title = "Courses",
            subtitle = "Manage existing courses, modules & slides",
            icon = Icons.Default.MenuBook,
            route = "courses"
        ),
        DashboardMenuItem(
            title = "Bot Activity",
            subtitle = "Live logs & WhatsApp message interactions",
            icon = Icons.Default.SmartToy,
            route = "bot_activity"
        ),
        DashboardMenuItem(
            title = "Students",
            subtitle = "Registered students, matric numbers & scores",
            icon = Icons.Default.People,
            route = "students"
        ),
        DashboardMenuItem(
            title = "Analytics",
            subtitle = "CBT performance, exam statistics & passes",
            icon = Icons.Default.BarChart,
            route = "analytics"
        ),
        DashboardMenuItem(
            title = "Settings",
            subtitle = "Configure Supabase URL & WhatsApp API keys",
            icon = Icons.Default.Settings,
            route = "settings"
        )
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Xtop Bot Admin", fontWeight = FontWeight.Bold)
                        Text(
                            "E-Learning & WhatsApp Bot Dashboard",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { navController.navigate("settings") }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                }
            )
        }
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 160.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(menuItems) { item ->
                Card(
                    onClick = { navController.navigate(item.route) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = item.title,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(32.dp)
                        )
                        Text(
                            text = item.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = item.subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
