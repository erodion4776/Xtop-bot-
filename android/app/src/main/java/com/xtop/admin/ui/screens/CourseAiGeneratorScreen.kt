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

    // Form inputs
    var isNewCourse by remember { mutableStateOf(true) }
    var existingCourses by remember { mutableStateOf<List<Course>>(emptyList()) }
    var selectedCourse by remember { mutableStateOf<Course?>(null) }
    var courseDropdownExpanded by remember { mutableStateOf(false) }

    var courseCode by remember { mutableStateOf("") }
    var courseName by remember { mutableStateOf("") }
    var term by remember { mutableStateOf("First Semester") }
    var lessonNumber by remember { mutableStateOf("1") }
    var questionCount by remember { mutableStateOf("5") }
    var topicPrompt by remember { mutableStateOf("") }

    // Generation state
    var isGenerating by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var generatedCourse by remember { mutableStateOf<GeneratedCourse?>(null) }
    var imageUrl by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var statusIsError by remember { mutableStateOf(false) }

    // Fetch existing courses on start
    LaunchedEffect(Unit) {
        try {
            val courses = SupabaseClient.postgrest.from("courses").select().decodeList<Course>()
            existingCourses = courses
        } catch (e: Exception) {
            // Ignore error if courses table is empty
        }
    }

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
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Generate Course & Exam with Pollinations AI",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "Configure the course details, lesson number, and question count below. The AI will generate classroom lecture notes, technical diagram schematic, and CBT questions ready for WhatsApp.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Course Mode Selection (New vs Existing)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = isNewCourse,
                    onClick = { isNewCourse = true },
                    label = { Text("Create New Course") },
                    leadingIcon = { if (isNewCourse) Icon(Icons.Default.Check, null) }
                )
                FilterChip(
                    selected = !isNewCourse,
                    onClick = { isNewCourse = false },
                    label = { Text("Add to Existing Course") },
                    leadingIcon = { if (!isNewCourse) Icon(Icons.Default.Check, null) }
                )
            }

            if (isNewCourse) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = courseCode,
                        onValueChange = { courseCode = it.uppercase() },
                        label = { Text("Course Code (e.g. ELA305)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = term,
                        onValueChange = { term = it },
                        label = { Text("Term / Semester") },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }

                OutlinedTextField(
                    value = courseName,
                    onValueChange = { courseName = it },
                    label = { Text("Course Name (e.g. Automotive Electronic Systems)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            } else {
                // Dropdown for existing courses
                ExposedDropdownMenuBox(
                    expanded = courseDropdownExpanded,
                    onExpandedChange = { courseDropdownExpanded = !courseDropdownExpanded },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = selectedCourse?.let { "${it.courseCode} - ${it.courseName}" } ?: "Select an existing course",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Select Course") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = courseDropdownExpanded) },
                        modifier = Modifier
                            .menuAnchor()
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = courseDropdownExpanded,
                        onDismissRequest = { courseDropdownExpanded = false }
                    ) {
                        if (existingCourses.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text("No existing courses found. Choose 'Create New Course'") },
                                onClick = { courseDropdownExpanded = false }
                            )
                        } else {
                            existingCourses.forEach { course ->
                                DropdownMenuItem(
                                    text = { Text("${course.courseCode}: ${course.courseName}") },
                                    onClick = {
                                        selectedCourse = course
                                        courseCode = course.courseCode
                                        courseName = course.courseName
                                        term = course.term ?: "First Semester"
                                        courseDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // Lesson Number & Question Count
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = lessonNumber,
                    onValueChange = { if (it.all { char -> char.isDigit() }) lessonNumber = it },
                    label = { Text("Lesson / Module #") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )

                OutlinedTextField(
                    value = questionCount,
                    onValueChange = { if (it.all { char -> char.isDigit() }) questionCount = it },
                    label = { Text("Question Count") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            // Topic / Syllabus Prompt
            OutlinedTextField(
                value = topicPrompt,
                onValueChange = { topicPrompt = it },
                label = { Text("Lesson Topic (e.g. Anti-Lock Braking System (ABS) Operation)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                minLines = 3
            )

            // Generate Button
            Button(
                onClick = {
                    scope.launch {
                        try {
                            isGenerating = true
                            statusMessage = null
                            statusIsError = false

                            val qCount = questionCount.toIntOrNull() ?: 5
                            val lNum = lessonNumber.toIntOrNull() ?: 1

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
                            statusIsError = true
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
                    Text("Generating Lesson & Diagram...")
                } else {
                    Icon(Icons.Default.AutoAwesome, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Generate with AI")
                }
            }

            // Status message
            statusMessage?.let { msg ->
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (statusIsError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = msg,
                        modifier = Modifier.padding(12.dp),
                        color = if (statusIsError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            // Preview Generated Course
            generatedCourse?.let { course ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            "${course.course_code}: ${course.course_name}",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Text(
                            "Semester: ${course.term} • ${course.description}",
                            style = MaterialTheme.typography.bodySmall
                        )

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
                                    .height(220.dp),
                                contentScale = ContentScale.Crop
                            )
                        }

                        HorizontalDivider(Modifier.padding(vertical = 4.dp))

                        Text("Generated Exam Questions (${course.questions.size}):", style = MaterialTheme.typography.titleSmall)
                        course.questions.forEachIndexed { i, q ->
                            Text("${i + 1}. ${q.question}", style = MaterialTheme.typography.bodySmall)
                            Text("   A: ${q.option_a}")
                            Text("   B: ${q.option_b}")
                            Text("   C: ${q.option_c}")
                            Text("   D: ${q.option_d}")
                            Text(
                                "   Correct Answer: ${q.correct_answer} (${q.explanation})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(4.dp))
                        }

                        Spacer(Modifier.height(12.dp))

                        Button(
                            onClick = {
                                scope.launch {
                                    try {
                                        isSaving = true
                                        statusMessage = null
                                        statusIsError = false
                                        val db = SupabaseClient.postgrest
                                        val lNum = lessonNumber.toIntOrNull() ?: 1

                                        // 1. Resolve or Create Course ID
                                        val targetCourseId = if (!isNewCourse && selectedCourse?.id != null) {
                                            selectedCourse!!.id!!
                                        } else {
                                            val insertedCourse = db.from("courses").insert(
                                                Course(
                                                    courseCode = if (courseCode.isNotBlank()) courseCode else course.course_code,
                                                    courseName = if (courseName.isNotBlank()) courseName else course.course_name,
                                                    term = if (term.isNotBlank()) term else course.term,
                                                    description = course.description,
                                                    status = "OPEN",
                                                    showAnswers = true
                                                )
                                            ) { select() }.decodeSingle<Course>()

                                            insertedCourse.id ?: throw IllegalStateException("Could not retrieve created course ID.")
                                        }

                                        // 2. Insert Module
                                        val insertedModule = db.from("course_modules").insert(
                                            CourseModule(
                                                courseId = targetCourseId,
                                                title = course.lesson_title,
                                                description = course.description,
                                                moduleOrder = lNum,
                                                status = "ACTIVE"
                                            )
                                        ) { select() }.decodeSingle<CourseModule>()

                                        val targetModuleId = insertedModule.id ?: throw IllegalStateException("Could not retrieve created module ID.")

                                        // 3. Insert Slide (Lesson content & Technical Image)
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

                                        // 4. Insert Exam Questions
                                        val questionsList = course.questions.mapIndexed { idx, q ->
                                            CourseQuestion(
                                                courseId = targetCourseId,
                                                moduleId = targetModuleId,
                                                question = q.question,
                                                optionA = q.option_a,
                                                optionB = q.option_b,
                                                optionC = q.option_c,
                                                optionD = q.option_d,
                                                correctAnswer = q.correct_answer.trim().uppercase().take(1).ifBlank { "A" },
                                                explanation = q.explanation,
                                                questionOrder = idx + 1,
                                                status = "ACTIVE"
                                            )
                                        }

                                        if (questionsList.isNotEmpty()) {
                                            db.from("course_questions").insert(questionsList)
                                        }

                                        statusMessage = "✅ Successfully Published to WhatsApp Bot Database!"
                                        statusIsError = false
                                        generatedCourse = null
                                    } catch (e: Exception) {
                                        statusMessage = "Save Error: ${e.localizedMessage}"
                                        statusIsError = true
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
