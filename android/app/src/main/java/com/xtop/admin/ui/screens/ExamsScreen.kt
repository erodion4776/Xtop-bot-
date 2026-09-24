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
import com.xtop.admin.data.models.Exam
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamsScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var exams by remember { mutableStateOf<List<Exam>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showCreate by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf("") }
    var courseId by remember { mutableStateOf("") }
    var qCount by remember { mutableStateOf("10") }
    var duration by remember { mutableStateOf("30") }
    var passMark by remember { mutableStateOf("50") }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { try { exams = repo.getExams() } catch (_: Exception) {}; loading = false }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Exams & CBT") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) },
        floatingActionButton = { FloatingActionButton(onClick = { showCreate = true }) { Icon(Icons.Default.Add, "Create Exam") } }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (showCreate) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Create Exam", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Exam Title") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(value = courseId, onValueChange = { courseId = it }, label = { Text("Course ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = qCount, onValueChange = { qCount = it.filter { c -> c.isDigit() } }, label = { Text("Questions") }, modifier = Modifier.weight(1f), singleLine = true)
                            OutlinedTextField(value = duration, onValueChange = { duration = it.filter { c -> c.isDigit() } }, label = { Text("Minutes") }, modifier = Modifier.weight(1f), singleLine = true)
                            OutlinedTextField(value = passMark, onValueChange = { passMark = it.filter { c -> c.isDigit() } }, label = { Text("Pass %") }, modifier = Modifier.weight(1f), singleLine = true)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        repo.createExam(Exam(examTitle = title, courseId = courseId, questionCount = qCount.toIntOrNull() ?: 10, durationMinutes = duration.toIntOrNull() ?: 30, passMarkPercent = passMark.toIntOrNull() ?: 50))
                                        exams = repo.getExams()
                                        showCreate = false
                                        statusMsg = "✅ Exam created as DRAFT"
                                        repo.logAction("admin", "EXAM_CREATED", "exams")
                                    } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                                }
                            }) { Text("Create Draft") }
                            OutlinedButton(onClick = { showCreate = false }) { Text("Cancel") }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            statusMsg?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }

            if (loading) CircularProgressIndicator()
            else if (exams.isEmpty()) Text("No exams created yet.", style = MaterialTheme.typography.bodyMedium)
            else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(exams) { exam ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Quiz, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(exam.examTitle, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                                    Text("${exam.questionCount} Qs • ${exam.durationMinutes} min • Pass: ${exam.passMarkPercent}%", style = MaterialTheme.typography.labelSmall)
                                }
                                AssistChip(onClick = {
                                    scope.launch {
                                        val newStatus = if (exam.status == "PUBLISHED") "DRAFT" else "PUBLISHED"
                                        exam.id?.let { repo.updateExamStatus(it, newStatus) }
                                        exams = repo.getExams()
                                        repo.logAction("admin", "EXAM_${newStatus}", "exams", exam.id)
                                    }
                                }, label = { Text(exam.status) })
                            }
                        }
                    }
                }
            }
        }
    }
}
