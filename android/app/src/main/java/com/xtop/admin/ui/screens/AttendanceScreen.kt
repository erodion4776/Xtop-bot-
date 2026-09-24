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
import com.xtop.admin.data.models.Attendance
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.models.Student
import com.xtop.admin.data.repository.AdminRepository
import com.xtop.admin.data.repository.CourseRepository
import io.github.jan.supabase.postgrest.from
import com.xtop.admin.data.SupabaseClient
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var records by remember { mutableStateOf<List<Attendance>>(emptyList()) }
    var students by remember { mutableStateOf<List<Student>>(emptyList()) }
    var courses by remember { mutableStateOf<List<Course>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showAdd by remember { mutableStateOf(false) }
    var selectedStudent by remember { mutableStateOf("") }
    var selectedCourse by remember { mutableStateOf("") }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            records = repo.getAttendance()
            students = SupabaseClient.postgrest.from("students").select().decodeList<Student>()
            courses = SupabaseClient.postgrest.from("courses").select().decodeList<Course>()
        } catch (_: Exception) {}
        loading = false
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Attendance") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) },
        floatingActionButton = { FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Default.Add, "Record") } }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (showAdd) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Record Attendance", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(value = selectedStudent, onValueChange = { selectedStudent = it }, label = { Text("Student ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = selectedCourse, onValueChange = { selectedCourse = it }, label = { Text("Course ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                                        repo.recordAttendance(Attendance(studentId = selectedStudent, courseId = selectedCourse, sessionDate = today))
                                        records = repo.getAttendance()
                                        showAdd = false
                                        statusMsg = "✅ Attendance recorded"
                                        repo.logAction("admin", "ATTENDANCE_RECORDED", "attendance")
                                    } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                                }
                            }) { Text("Save") }
                            OutlinedButton(onClick = { showAdd = false }) { Text("Cancel") }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            statusMsg?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }

            if (loading) CircularProgressIndicator()
            else if (records.isEmpty()) Text("No attendance records yet.", style = MaterialTheme.typography.bodyMedium)
            else {
                Text("${records.size} records", style = MaterialTheme.typography.labelMedium)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(records) { r ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.EventAvailable, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Student: ${r.studentId.take(8)}…", style = MaterialTheme.typography.bodySmall, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                                    Text("Course: ${r.courseId.take(8)}… • ${r.sessionDate}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(r.sessionLabel, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}
