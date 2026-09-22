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
import com.xtop.admin.data.models.ExamConfig
import com.xtop.admin.data.repository.QuestionRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamConfigScreen(navController: NavController, courseId: String) {
    val repo = remember { QuestionRepository() }
    val scope = rememberCoroutineScope()

    var questionCount by remember { mutableIntStateOf(10) }
    var passMark by remember { mutableIntStateOf(50) }
    var randomize by remember { mutableStateOf(true) }
    var showAnswers by remember { mutableStateOf(true) }
    var allowRetake by remember { mutableStateOf(true) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(courseId) {
        val config = repo.getExamConfig(courseId)
        if (config != null) {
            questionCount = config.questionCount
            passMark = config.passMarkPercent
            randomize = config.randomizeQuestions
            showAnswers = config.showAnswers
            allowRetake = config.allowRetake
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Exam Configuration") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            repo.saveExamConfig(
                                ExamConfig(
                                    courseId = courseId,
                                    questionCount = questionCount,
                                    passMarkPercent = passMark,
                                    randomizeQuestions = randomize,
                                    showAnswers = showAnswers,
                                    allowRetake = allowRetake
                                )
                            )
                            navController.popBackStack()
                        }
                    }) { Icon(Icons.Default.Save, "Save") }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Questions per Exam", style = MaterialTheme.typography.titleMedium)
                Slider(
                    value = questionCount.toFloat(),
                    onValueChange = { questionCount = it.toInt() },
                    valueRange = 5f..100f,
                    steps = 18
                )
                Text("Count: $questionCount", style = MaterialTheme.typography.headlineSmall)

                Text("Pass Mark", style = MaterialTheme.typography.titleMedium)
                Slider(
                    value = passMark.toFloat(),
                    onValueChange = { passMark = it.toInt() },
                    valueRange = 0f..100f,
                    steps = 19
                )
                Text("$passMark%", style = MaterialTheme.typography.headlineSmall)

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Randomize Questions")
                    Switch(checked = randomize, onCheckedChange = { randomize = it })
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Show Answers After Exam")
                    Switch(checked = showAnswers, onCheckedChange = { showAnswers = it })
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Allow Retakes")
                    Switch(checked = allowRetake, onCheckedChange = { allowRetake = it })
                }
            }
        }
    }
}
