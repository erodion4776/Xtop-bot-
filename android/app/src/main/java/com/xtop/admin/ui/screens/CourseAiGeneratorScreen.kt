package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.Course
import com.xtop.admin.data.models.CourseModule
import com.xtop.admin.data.models.CourseQuestion
import com.xtop.admin.data.models.ModuleSlide
import com.xtop.admin.data.remote.GeneratedCourse
import com.xtop.admin.data.remote.PollinationsService
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseAiGeneratorScreen(navController: NavController) {
    val scope = rememberCoroutineScope()

    var courseCode by remember { mutableStateOf("ELA301") }
    var courseName by remember { mutableStateOf("Automotive Engineering") }
    var lessonNumber by remember { mutableStateOf("1") }
    var topicPrompt by remember { mutableStateOf("") }
    var questionCount by remember { mutableStateOf("5") }

    var isGenerating by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var generatedCourse by remember { mutableStateOf<GeneratedCourse?>(null) }
    var imageUrl by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI Course & Exam Generator") },
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
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                "Generate Interactive Lessons & Exams",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "Provide the course info, lesson topic, and CBT question count. Pollinations AI will generate complete lecture notes, technical blueprints, and CBT questions ready for WhatsApp.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Course Code & Lesson Number
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = courseCode,
                    onValueChange = { courseCode = it },
                    label = { Text("Course Code") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = lessonNumber,
                    onValueChange = { lessonNumber = it.filter { ch -> ch.isDigit() } },
                    label = { Text("Lesson #") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(0.6f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = courseName,
                onValueChange = { courseName = it },
                label = { Text("Course Title / Subject") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // Topic prompt
            OutlinedTextField(
                value = topicPrompt,
                onValueChange = { topicPrompt = it },
                label = { Text("Lesson Topic (e.g. Brake Systems & ABS)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            // Number of questions
            OutlinedTextField(
                value = questionCount,
                onValueChange = { questionCount = it.filter { ch -> ch.isDigit() } },
                label = { Text("Number of Questions (e.g. 5, 10, 15)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Button(
                onClick = {
                    scope.launch {
                        try {
                            isGenerating = true
                            statusMessage = null
                            val lNum = lessonNumber.toIntOrNull() ?: 1
                            val qCount = questionCount.toIntOrNull() ?: 5
                            val res = PollinationsService.generateCourseWithAI(
                                topicPrompt = topicPrompt,
                                courseCode = courseCode,
                                courseName = courseName,
                                lessonNumber = lNum,
                                questionCount = qCount
                            )
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
                    Text("Generating Lesson & CBT...")
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

            // Preview Section
            generatedCourse?.let { course ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${course.course_code}: ${course.course_name}", style = MaterialTheme.typography.titleLarge)
                        Text("Term: ${course.term} • ${course.description}", style = MaterialTheme.typography.bodySmall)

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

                        Text("Generated CBT Exam Questions (${course.questions.size}):", style = MaterialTheme.typography.titleSmall)
                        course.questions.forEachIndexed { i, q ->
                            Text("${i + 1}. ${q.question}", style = MaterialTheme.typography.bodySmall)
                            Text("   A) ${q.option_a}  B) ${q.option_b}", style = MaterialTheme.typography.bodySmall)
                            Text("   C) ${q.option_c}  D) ${q.option_d}", style = MaterialTheme.typography.bodySmall)
                            Text("   Correct: Option ${q.correct_answer}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }

                        Spacer(Modifier.height(12.dp))

                        Button(
                            onClick = {
                                scope.launch {
                                    try {
                                        isSaving = true
                                        val db = SupabaseClient.postgrest

                                        // 1. Check or insert Course
                                        val existing = db.from("courses").select {
                                            filter { eq("course_code", course.course_code) }
                                        }.decodeList<Course>()

                                        val targetCourseId = if (existing.isNotEmpty() && !existing.first().id.isNullOrBlank()) {
                                            existing.first().id!!
                                        } else {
                                            val createdCourse = db.from("courses").insert(
                                                Course(
                                                    courseCode = course.course_code,
                                                    courseName = course.course_name,
                                                    term = course.term,
                                                    description = course.description,
                                                    status = "OPEN",
                                                    showAnswers = true
                                                )
                                            ) { select() }.decodeSingle<Course>()
                                            createdCourse.id ?: throw IllegalStateException("Course ID was not returned")
                                        }

                                        // 2. Insert Module
                                        val lNum = lessonNumber.toIntOrNull() ?: 1
                                        val createdModule = db.from("course_modules").insert(
                                            CourseModule(
                                                courseId = targetCourseId,
                                                title = course.lesson_title,
                                                description = course.description,
                                                moduleOrder = lNum,
                                                status = "ACTIVE"
                                            )
                                        ) { select() }.decodeSingle<CourseModule>()

                                        val targetModuleId = createdModule.id ?: throw IllegalStateException("Module ID was not returned")

                                        // 3. Insert Module Slide
                                        db.from("module_slides").insert(
                                            ModuleSlide(
                                                moduleId = targetModuleId,
                                                title = course.lesson_title,
                                                content = course.lesson_content,
                                                imageUrl = imageUrl,
                                                slideOrder = 1,
                                                duration = "15 mins",
                                                status = "ACTIVE"
                                            )
                                        )

                                        // 4. Insert CBT Questions
                                        if (course.questions.isNotEmpty()) {
                                            val questionsList = course.questions.mapIndexed { idx, q ->
                                                CourseQuestion(
                                                    courseId = targetCourseId,
                                                    moduleId = targetModuleId,
                                                    question = q.question,
                                                    optionA = q.option_a,
                                                    optionB = q.option_b,
                                                    optionC = q.option_c,
                                                    optionD = q.option_d,
                                                    correctAnswer = q.correct_answer,
                                                    explanation = q.explanation,
                                                    questionOrder = idx + 1,
                                                    status = "ACTIVE"
                                                )
                                            }
                                            db.from("course_questions").insert(questionsList)
                                        }

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
