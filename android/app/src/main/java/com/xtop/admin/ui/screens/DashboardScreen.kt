package com.xtop.admin.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.BuildConfig
import java.io.File

data class DashboardItem(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val route: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(navController: NavController) {
    val context = LocalContext.current
    var crashLogContent by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (BuildConfig.DEBUG) {
            try {
                val crashLogFile = File(context.getExternalFilesDir(null), "crash_log.txt")
                if (crashLogFile.exists() && crashLogFile.length() > 0) {
                    crashLogContent = crashLogFile.readText()
                }
            } catch (e: Exception) {
                // Ignore reading errors
            }
        }
    }

    val menuItems = listOf(
        DashboardItem(
            title = "AI Course & Image Creator",
            subtitle = "Generate lessons, diagrams & questions with Pollinations AI",
            icon = Icons.Default.AutoAwesome,
            route = "ai_generator"
        ),
        DashboardItem(
            title = "Live WhatsApp Activity",
            subtitle = "See live student chats and bot responses",
            icon = Icons.Default.Chat,
            route = "bot_activity"
        ),
        DashboardItem(
            title = "Courses",
            subtitle = "Manage courses, question banks & exam settings",
            icon = Icons.Default.School,
            route = "courses"
        ),
        DashboardItem(
            title = "Students",
            subtitle = "View registered students & attendance",
            icon = Icons.Default.People,
            route = "students"
        ),
        DashboardItem(
            title = "Analytics",
            subtitle = "System overview & reports",
            icon = Icons.Default.Analytics,
            route = "analytics"
        ),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Xtop Admin") },
                actions = {
                    IconButton(onClick = { navController.navigate("settings") }) {
                        Icon(Icons.Default.Settings, contentDescription = "Database Settings")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(
                    text = "Engr. Ero Learning Centre",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Admin Control Panel & AI Studio",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            items(menuItems) { item ->
                Card(
                    onClick = { navController.navigate(item.route) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(32.dp)
                        )
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(text = item.title, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = item.subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // On-device crash log viewer for debugging
            if (BuildConfig.DEBUG && !crashLogContent.isNullOrBlank()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2B1010))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = "⚠️ LAST CRASH STACK TRACE", color = Color(0xFFFF5252))
                                TextButton(
                                    onClick = {
                                        try {
                                            File(context.getExternalFilesDir(null), "crash_log.txt").delete()
                                            crashLogContent = null
                                        } catch (e: Exception) {
                                            // Ignore
                                        }
                                    }
                                ) {
                                    Text(text = "Dismiss", color = Color(0xFFFF8A80))
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .heightIn(max = 200.dp)
                                    .horizontalScroll(rememberScrollState())
                            ) {
                                Text(
                                    text = crashLogContent ?: "",
                                    color = Color(0xFFFFCDD2),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
