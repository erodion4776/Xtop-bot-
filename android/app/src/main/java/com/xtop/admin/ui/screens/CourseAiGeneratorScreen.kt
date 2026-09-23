package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.models.CourseLesson
import com.xtop.admin.data.models.CourseQuestion
import com.xtop.admin.data.remote.GeneratedCourse
import com.xtop.admin.data.remote.PollinationsService
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseAiGeneratorScreen(navController: NavController) {
    val scope = rememberCoroutineScope()
    var topicPrompt by remember { mutableStateOf("") }
    var isGenerating by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var generatedCourse by remember { mutableStateOf<GeneratedCourse?>(null) }
    var imageUrl by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI Course & Image Generator") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
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
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Generate Course Content with Pollinations AI",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "Enter an engineering or business topic below. AI will create the course syllabus, classroom lecture notes, technical diagram image, and 5 CBT exam questions.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            OutlinedTextField(
                value = topicPrompt,
                onValueChange = { topicPrompt = it },
                label = { Text("Course Topic (e.g. Brake Systems & ABS)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                minLines = 2
            )

            Button(
                onClick = {
                    scope.launch {
                        try {
                            isGenerating = true
                            statusMessage = null
                            val res = PollinationsService.generateCourseWithAI(topicPrompt)
                            generatedCourse = res
                            imageUrl = PollinationsService.getImageUrl(res.image_prompt)
                        } catch (e: Exception) {
                            statusMessage = "AI Generation Failed: ${e.localizedMessage}"
                        } finally {
                            isGenerating = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = topicPrompt.isNotBlank() && !isGenerating
            ) {
                if (isGenerating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                    Spacer(Modifier.width(8.dp))
                    Text("Generating Course & Diagram...")
                } else {
                    Icon(Icons.Default.AutoAwesome, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Generate with AI")
                }
            }

            if (statusMessage != null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Text(statusMessage ?: "", modifier = Modifier.padding(12.dp))
                }
            }

            // Preview Generated Course
            generatedCourse?.let { course ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${course.course_code}: ${course.course_name}", style = MaterialTheme.typography.titleLarge)
                        Text("Semester: ${course.term} • ${course.description}", style = MaterialTheme.typography.bodySmall)

                        HorizontalDivider(Modifier.padding(vertical = 4.dp))

                        Text(course.lesson_title, style = MaterialTheme.typography.titleMedium)
                        Text(course.lesson_content, style = MaterialTheme.typography.bodyMedium)

                        imageUrl?.let { url ->
                            Spacer(Modifier.height(8.dp))
                            Text("Generated Technical Diagram:", style = MaterialTheme.typography.labelMedium)
                            AsyncImage(
                                model = url,
                                contentDescription = "AI Generated Diagram",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(200.dp),
                                contentScale = ContentScale.Crop
                            )
                        }

                        HorizontalDivider(Modifier.padding(vertical = 4.dp))

                        Text("Generated Exam Questions (${course.questions.size}):", style = MaterialTheme.typography.titleSmall)
                        course.questions.forEachIndexed { i, q ->
                            Text("${i + 1}. ${q.question}", style = MaterialTheme.typography.bodySmall)
                            Text("   Correct Answer: Option ${q.correct_answer}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }

                        Spacer(Modifier.height(12.dp))

                        Button(
                            onClick = {
                                scope.launch {
                                    try {
                                        isSaving = true
                                        val db = SupabaseClient.postgrest

                                        // 1. Insert Course
                                        val insertedCourse = db.from("courses").insert(
                                            Course(
                                                courseCode = course.course_code,
                                                courseName = course.course_name,
                                                term = course.term,
                                                description = course.description,
                                                status = "OPEN",
                                                showAnswers = true
                                            )
                                        ) { select() }.decodeSingle<Course>()

                                        // 2. Insert Lesson & Image
                                        db.from("course_lessons").insert(
                                            CourseLesson(
                                                courseId = insertedCourse.id,
                                                title = course.lesson_title,
                                                content = course.lesson_content,
                                                videoUrl = imageUrl, // Stores the AI image URL
                                                lessonOrder = 1,
                                                duration = "15 mins"
                                            )
                                        )

                                        // 3. Insert Exam Questions
                                        val questionsList = course.questions.mapIndexed { idx, q ->
                                            CourseQuestion(
                                                courseId = insertedCourse.id,
                                                question = q.question,
                                                optionA = q.option_a,
                                                optionB = q.option_b,
                                                optionC = q.option_c,
                                                optionD = q.option_d,
                                                correctAnswer = q.correct_answer,
                                                explanation = q.explanation,
                                                questionOrder = idx + 1
                                            )
                                        }
                                        db.from("course_questions").insert(questionsList)

                                        statusMessage = "✅ Successfully Published to WhatsApp Bot!"
                                        generatedCourse = null
                                    } catch (e: Exception) {
                                        statusMessage = "Save Error: ${e.localizedMessage}"
                                    } finally {
                                        isSaving = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isSaving
                        ) {
                            if (isSaving) {
                                CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                                Spacer(Modifier.width(8.dp))
                                Text("Saving to Supabase...")
                            } else {
                                Icon(Icons.Default.CloudUpload, null)
                                Spacer(Modifier.width(8.dp))
                                Text("Publish to WhatsApp Bot")
                            }
                        }
                    }
                }
            }
        }
    }
}
