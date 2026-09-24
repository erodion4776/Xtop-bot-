package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.AuditLog
import com.xtop.admin.data.repository.AdminRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditLogScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    var logs by remember { mutableStateOf<List<AuditLog>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { try { logs = repo.getAuditLogs() } catch (_: Exception) {}; loading = false }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Audit Logs") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) }
    ) { padding ->
        if (loading) CircularProgressIndicator(modifier = Modifier.padding(padding).padding(16.dp))
        else if (logs.isEmpty()) Text("No audit logs yet.", modifier = Modifier.padding(padding).padding(16.dp))
        else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(logs) { log ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("${log.action} → ${log.entity}", style = MaterialTheme.typography.bodySmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                            Text("By: ${log.adminUser} • ${log.createdAt?.take(19) ?: ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            log.entityId?.let { Text("ID: $it", style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                }
            }
        }
    }
}
