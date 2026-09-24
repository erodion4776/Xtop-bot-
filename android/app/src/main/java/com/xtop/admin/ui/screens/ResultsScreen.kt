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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.Result
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultsScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var results by remember { mutableStateOf<List<Result>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { try { results = repo.getResults() } catch (_: Exception) {}; loading = false }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Results") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (loading) CircularProgressIndicator()
            else if (results.isEmpty()) Text("No results yet. Calculate results after CBT exams.", style = MaterialTheme.typography.bodyMedium)
            else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(results) { r ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    if (r.percentage >= 50) Icons.Default.CheckCircle else Icons.Default.Cancel,
                                    null,
                                    tint = if (r.percentage >= 50) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Student: ${r.studentId.take(8)}…", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                    Text("CBT: ${r.cbtScore}% • Total: ${r.totalScore}%", style = MaterialTheme.typography.labelSmall)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("%.1f%%".format(r.percentage), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Text(r.status, style = MaterialTheme.typography.labelSmall, color = if (r.status == "RELEASED") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
