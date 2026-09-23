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
import com.xtop.admin.data.models.CourseQuestion
import com.xtop.admin.data.repository.QuestionRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionEditorScreen(
    navController: NavController,
    courseId: String
) {
    val repo = remember { QuestionRepository() }
    val scope = rememberCoroutineScope()

    var question by remember { mutableStateOf("") }
    var optionA by remember { mutableStateOf("") }
    var optionB by remember { mutableStateOf("") }
    var optionC by remember { mutableStateOf("") }
    var optionD by remember { mutableStateOf("") }
    var correctAnswer by remember { mutableStateOf("A") }
    var explanation by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add Question") },
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
                                    repo.createQuestion(
                                        CourseQuestion(
                                            courseId = courseId,
                                            question = question.trim(),
                                            optionA = optionA.trim(),
                                            optionB = optionB.trim(),
                                            optionC = optionC.trim(),
                                            optionD = optionD.trim(),
                                            correctAnswer = correctAnswer,
                                            explanation = explanation.trim().ifBlank { null }
                                        )
                                    )
                                    navController.popBackStack()
                                } catch (e: Exception) {
                                    errorMessage = e.message ?: "Failed to save question"
                                } finally {
                                    saving = false
                                }
                            }
                        },
                        enabled = question.isNotBlank() && optionA.isNotBlank() && optionB.isNotBlank() && !saving
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
                value = question,
                onValueChange = { question = it },
                label = { Text("Question Text") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            OutlinedTextField(
                value = optionA,
                onValueChange = { optionA = it },
                label = { Text("Option A") },
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = optionB,
                onValueChange = { optionB = it },
                label = { Text("Option B") },
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = optionC,
                onValueChange = { optionC = it },
                label = { Text("Option C") },
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = optionD,
                onValueChange = { optionD = it },
                label = { Text("Option D") },
                modifier = Modifier.fillMaxWidth()
            )

            Text("Select Correct Option:", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("A", "B", "C", "D").forEach { opt ->
                    FilterChip(
                        selected = correctAnswer == opt,
                        onClick = { correctAnswer = opt },
                        label = { Text("Option $opt") }
                    )
                }
            }

            OutlinedTextField(
                value = explanation,
                onValueChange = { explanation = it },
                label = { Text("Explanation (Optional for review)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            if (saving) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
