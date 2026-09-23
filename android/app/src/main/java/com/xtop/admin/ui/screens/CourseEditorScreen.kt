package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.repository.CourseRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseEditorScreen(
    navController: NavController,
    courseId: String
) {
    val repo = remember { CourseRepository() }
    val scope = rememberCoroutineScope()

    var courseCode by remember { mutableStateOf("") }
    var courseName by remember { mutableStateOf("") }
    var term by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var showAnswers by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val isNew = courseId == "new"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isNew) "Add New Course" else "Edit Course") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            scope.launch {
                                try {
                                    saving = true
                                    errorMessage = null
                                    if (isNew) {
                                        repo.createCourse(
                                            Course(
                                                courseCode = courseCode.trim().uppercase(),
                                                courseName = courseName.trim(),
                                                term = term.trim().ifBlank { null },
                                                description = description.trim().ifBlank { null },
                                                showAnswers = showAnswers,
                                                status = "OPEN"
                                            )
                                        )
                                    }
                                    navController.popBackStack()
                                } catch (e: Exception) {
                                    errorMessage = e.message ?: "Failed to save course"
                                } finally {
                                    saving = false
                                }
                            }
                        },
                        enabled = courseCode.isNotBlank() && courseName.isNotBlank() && !saving
                    ) {
                        Icon(Icons.Default.Save, "Save")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (errorMessage != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            OutlinedTextField(
                value = courseCode,
                onValueChange = { courseCode = it },
                label = { Text("Course Code (e.g. ELA301)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = courseName,
                onValueChange = { courseName = it },
                label = { Text("Course Title (e.g. Auto Shop)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = term,
                onValueChange = { term = it },
                label = { Text("Semester / Term (e.g. First Semester)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Allow Students to Review Answers")
                Switch(checked = showAnswers, onCheckedChange = { showAnswers = it })
            }

            if (saving) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
