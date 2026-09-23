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
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            courses = repo.getCourses()
        } finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Courses") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
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
        if (loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(courses) { course ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "${course.courseCode} — ${course.courseName}",
                                    style = MaterialTheme.typography.titleSmall
                                )
                                Text(
                                    "${course.term} • ${course.status}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (course.status == "OPEN")
                                        MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.error
                                )
                            }
                            IconButton(onClick = {
                                scope.launch {
                                    repo.toggleCourseStatus(course.id, course.status)
                                    courses = repo.getCourses()
                                }
                            }) {
                                Icon(
                                    if (course.status == "OPEN") Icons.Default.Lock else Icons.Default.LockOpen,
                                    contentDescription = "Toggle"
                                )
                            }
                            IconButton(onClick = {
                                navController.navigate("course_detail/${course.id}")
                            }) {
                                Icon(Icons.Default.Edit, "Edit")
                            }
                        }
                    }
                }
            }
        }
    }
}
