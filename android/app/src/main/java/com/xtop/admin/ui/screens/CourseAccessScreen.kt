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
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.StudentCourseAccess
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseAccessScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var records by remember { mutableStateOf<List<StudentCourseAccess>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showGrant by remember { mutableStateOf(false) }
    var studentId by remember { mutableStateOf("") }
    var courseId by remember { mutableStateOf("") }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { try { records = repo.getAccessRecords() } catch (_: Exception) {}; loading = false }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Course Access") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) },
        floatingActionButton = { FloatingActionButton(onClick = { showGrant = true }) { Icon(Icons.Default.Add, "Grant") } }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (showGrant) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Grant Course Access", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(value = studentId, onValueChange = { studentId = it }, label = { Text("Student ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = courseId, onValueChange = { courseId = it }, label = { Text("Course ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        repo.grantAccess(StudentCourseAccess(studentId = studentId, courseId = courseId, accessStatus = "ACTIVE", grantedBy = "admin"))
                                        records = repo.getAccessRecords()
                                        showGrant = false
                                        statusMsg = "✅ Access granted"
                                        repo.logAction("admin", "ACCESS_GRANTED", "student_course_access")
                                    } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                                }
                            }) { Text("Grant") }
                            OutlinedButton(onClick = { showGrant = false }) { Text("Cancel") }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            statusMsg?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }

            if (loading) CircularProgressIndicator()
            else if (records.isEmpty()) Text("No access records.", style = MaterialTheme.typography.bodyMedium)
            else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(records) { r ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    if (r.accessStatus == "ACTIVE") Icons.Default.CheckCircle else Icons.Default.Block,
                                    null,
                                    tint = if (r.accessStatus == "ACTIVE") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Student: ${r.studentId.take(8)}…", style = MaterialTheme.typography.bodySmall)
                                    Text("Course: ${r.courseId.take(8)}…", style = MaterialTheme.typography.labelSmall)
                                }
                                FilterChip(selected = r.accessStatus == "ACTIVE", onClick = {
                                    scope.launch {
                                        val newStatus = if (r.accessStatus == "ACTIVE") "BLOCKED" else "ACTIVE"
                                        r.id?.let { repo.updateAccessStatus(it, newStatus) }
                                        records = repo.getAccessRecords()
                                        repo.logAction("admin", "ACCESS_${newStatus}", "student_course_access", r.id)
                                    }
                                }, label = { Text(r.accessStatus) })
                            }
                        }
                    }
                }
            }
        }
    }
}
