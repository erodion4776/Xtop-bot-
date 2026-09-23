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
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.repository.CourseRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseListScreen(navController: NavController) {
    val repo = remember { CourseRepository() }
    var courses by remember { mutableStateOf<List<Course>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun loadCourses() {
        scope.launch {
            try {
                loading = true
                errorMessage = null
                courses = repo.getCourses()
            } catch (e: Exception) {
                errorMessage = e.message ?: "Failed to connect to database"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadCourses()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Courses") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadCourses() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate("course_editor/new") }) {
                Icon(Icons.Default.Add, "Add Course")
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                errorMessage != null -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { loadCourses() }) {
                            Text("Retry")
                        }
                    }
                }
                courses.isEmpty() -> {
                    Text(
                        text = "No courses found. Tap + to add one.",
                        modifier = Modifier.align(Alignment.Center),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(courses) { course ->
                            Card(
                                onClick = { navController.navigate("course_detail/${course.id}") },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "${course.courseCode} — ${course.courseName}",
                                            style = MaterialTheme.typography.titleMedium
                                        )
                                        Text(
                                            text = "${course.term ?: "General"} • Status: ${course.status}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = if (course.status == "OPEN")
                                                MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.error
                                        )
                                    }
                                    IconButton(onClick = {
                                        scope.launch {
                                            try {
                                                repo.toggleCourseStatus(course.id, course.status)
                                                loadCourses()
                                            } catch (e: Exception) {
                                                errorMessage = e.message
                                            }
                                        }
                                    }) {
                                        Icon(
                                            imageVector = if (course.status == "OPEN") Icons.Default.Lock else Icons.Default.LockOpen,
                                            contentDescription = "Toggle Status"
                                        )
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
