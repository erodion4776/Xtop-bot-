package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.CourseQuestion
import com.xtop.admin.data.repository.QuestionRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionBankScreen(navController: NavController, courseId: String) {
    val repo = remember { QuestionRepository() }
    val scope = rememberCoroutineScope()
    var questions by remember { mutableStateOf<List<CourseQuestion>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun loadQuestions() {
        scope.launch {
            try {
                loading = true
                errorMessage = null
                questions = repo.getQuestions(courseId)
            } catch (e: Throwable) {
                errorMessage = e.localizedMessage ?: "Failed to load questions"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(courseId) {
        loadQuestions()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Questions (${questions.size})") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadQuestions() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate("question_editor/$courseId") }) {
                Icon(Icons.Default.Add, "Add Question")
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
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { loadQuestions() }) {
                            Text("Retry")
                        }
                    }
                }
                questions.isEmpty() -> {
                    Text(
                        text = "No questions in this course yet.\nTap + to add your first question.",
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
                        items(questions) { q ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(q.question, style = MaterialTheme.typography.titleSmall)
                                    Spacer(Modifier.height(4.dp))
                                    Text("A) ${q.optionA}", style = MaterialTheme.typography.bodySmall)
                                    Text("B) ${q.optionB}", style = MaterialTheme.typography.bodySmall)
                                    Text("C) ${q.optionC}", style = MaterialTheme.typography.bodySmall)
                                    Text("D) ${q.optionD}", style = MaterialTheme.typography.bodySmall)
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        text = "Correct: Option ${q.correctAnswer}",
                                        color = MaterialTheme.colorScheme.primary,
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                        IconButton(onClick = {
                                            val questionId = q.id ?: return@IconButton
                                            scope.launch {
                                                try {
                                                    repo.deleteQuestion(questionId)
                                                    loadQuestions()
                                                } catch (e: Exception) {
                                                    errorMessage = e.message
                                                }
                                            }
                                        }) {
                                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
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
}
