package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Student
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentListScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var students by remember { mutableStateOf<List<Student>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun loadStudents() {
        scope.launch {
            try {
                loading = true
                errorMessage = null
                students = SupabaseClient.postgrest.from("students")
                    .select {
                        order("created_at", Order.DESCENDING)
                    }.decodeList<Student>()
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Failed to load students"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadStudents()
    }

    val filteredStudents = students.filter { s ->
        val q = searchQuery.trim().lowercase()
        (s.name ?: "").lowercase().contains(q) ||
        (s.matricNumber ?: "").lowercase().contains(q) ||
        s.phone.contains(q) ||
        (s.department ?: "").lowercase().contains(q)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Students & Clients (${students.size})") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadStudents() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search by name, matric no, or phone") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            if (loading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (errorMessage != null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(errorMessage ?: "", color = MaterialTheme.colorScheme.error)
                }
            } else if (filteredStudents.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No students found.", style = MaterialTheme.typography.bodyMedium)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filteredStudents) { s ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = s.name ?: "Registered Student",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    AssistChip(
                                        onClick = {},
                                        label = { Text(s.status) }
                                    )
                                }

                                Text(
                                    text = "Matric: ${s.matricNumber ?: "N/A"} • ${s.department ?: "General"} (${s.level ?: "300"}L)",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                Text(
                                    text = "Phone: ${s.phone}",
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Medium
                                )

                                HorizontalDivider(Modifier.padding(vertical = 4.dp))

                                // Direct Outreach Action Buttons (Admin ➔ Student)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    // 1. WhatsApp Chat Button
                                    Button(
                                        onClick = {
                                            val cleanPhone = s.phone.replace("+", "").replace(" ", "")
                                            val url = "https://wa.me/$cleanPhone?text=Hello%20${Uri.encode(s.name ?: "Student")},%20this%20is%20Engr.%20Ero%20from%20Xtop%20Learning%20Hub."
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                            context.startActivity(intent)
                                        },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Default.Chat, null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("WhatsApp")
                                    }

                                    // 2. Phone Call Button
                                    OutlinedButton(
                                        onClick = {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${s.phone}"))
                                            context.startActivity(intent)
                                        },
                                        modifier = Modifier.weight(0.8f)
                                    ) {
                                        Icon(Icons.Default.Phone, null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Call")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
