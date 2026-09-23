package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.*
import com.xtop.admin.data.remote.SqlExporter
import com.xtop.admin.data.remote.StorageService
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualCourseEditorScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var courseCode by remember { mutableStateOf("") }
    var courseName by remember { mutableStateOf("") }
    var term by remember { mutableStateOf("First Semester") }
    var description by remember { mutableStateOf("") }
    var lessonNumber by remember { mutableStateOf("1") }
    var lessonTitle by remember { mutableStateOf("") }
    var lessonContent by remember { mutableStateOf("") }

    var selectedImageUri by remember { mutableStateOf<Uri?>(null) }
    var uploadedImageUrl by remember { mutableStateOf<String?>(null) }
    var isUploadingImage by remember { mutableStateOf(false) }

    var questions by remember { mutableStateOf(listOf(CourseQuestion(question = "", optionA = "", optionB = "", optionC = "", optionD = "", correctAnswer = "A", explanation = ""))) }

    var isSaving by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            selectedImageUri = it
            scope.launch {
                try {
                    isUploadingImage = true
                    uploadedImageUrl = StorageService.uploadImage(context, it)
                    Toast.makeText(context, "Image Uploaded Successfully!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(context, "Upload Failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                } finally {
                    isUploadingImage = false
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Manual Course & Exam Creator") },
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("1. Course Information", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = courseCode,
                    onValueChange = { courseCode = it },
                    label = { Text("Course Code (e.g. ELA301)") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = lessonNumber,
                    onValueChange = { lessonNumber = it.filter { c -> c.isDigit() } },
                    label = { Text("Lesson #") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(0.6f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = courseName,
                onValueChange = { courseName = it },
                label = { Text("Course Name / Title") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Course Description") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            HorizontalDivider(Modifier.padding(vertical = 4.dp))

            Text("2. Lesson Content", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)

            OutlinedTextField(
                value = lessonTitle,
                onValueChange = { lessonTitle = it },
                label = { Text("Lesson Title (e.g. Starter Motor Operation)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = lessonContent,
                onValueChange = { lessonContent = it },
                label = { Text("Lesson Lecture Notes (Formatted for WhatsApp)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 5
            )

            // Image Upload Section
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = { imagePicker.launch("image/*") },
                    enabled = !isUploadingImage
                ) {
                    Icon(Icons.Default.Image, null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (isUploadingImage) "Uploading..." else "Upload Diagram Image")
                }
            }

            (uploadedImageUrl ?: selectedImageUri?.toString())?.let { img ->
                AsyncImage(
                    model = img,
                    contentDescription = "Lesson Diagram",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentScale = ContentScale.Crop
                )
            }

            HorizontalDivider(Modifier.padding(vertical = 4.dp))

            // CBT Questions Section
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("3. CBT Exam Questions (${questions.size})", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                IconButton(onClick = {
                    questions = questions + CourseQuestion(question = "", optionA = "", optionB = "", optionC = "", optionD = "", correctAnswer = "A")
                }) {
                    Icon(Icons.Default.AddCircle, "Add Question", tint = MaterialTheme.colorScheme.primary)
                }
            }

            questions.forEachIndexed { idx, q ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Question ${idx + 1}", style = MaterialTheme.typography.titleSmall)
                            if (questions.size > 1) {
                                IconButton(onClick = {
                                    questions = questions.toMutableList().apply { removeAt(idx) }
                                }) {
                                    Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }

                        OutlinedTextField(
                            value = q.question,
                            onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(question = text) } },
                            label = { Text("Question text") },
                            modifier = Modifier.fillMaxWidth()
                        )

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = q.optionA,
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(optionA = text) } },
                                label = { Text("Option A") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = q.optionB,
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(optionB = text) } },
                                label = { Text("Option B") },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = q.optionC,
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(optionC = text) } },
                                label = { Text("Option C") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = q.optionD,
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(optionD = text) } },
                                label = { Text("Option D") },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = q.correctAnswer,
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(correctAnswer = text.uppercase().take(1)) } },
                                label = { Text("Correct (A,B,C,D)") },
                                modifier = Modifier.width(140.dp)
                            )
                            OutlinedTextField(
                                value = q.explanation ?: "",
                                onValueChange = { text -> questions = questions.toMutableList().apply { this[idx] = this[idx].copy(explanation = text) } },
                                label = { Text("Explanation") },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            if (statusMessage != null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Text(statusMessage ?: "", modifier = Modifier.padding(12.dp))
                }
            }

            Spacer(Modifier.height(8.dp))

            // Action Buttons
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Export SQL Button
                OutlinedButton(
                    onClick = {
                        val lNum = lessonNumber.toIntOrNull() ?: 1
                        val sql = SqlExporter.generateSqlScript(
                            courseCode = courseCode,
                            courseName = courseName,
                            term = term,
                            description = description,
                            lessonNumber = lNum,
                            lessonTitle = lessonTitle,
                            lessonContent = lessonContent,
                            imageUrl = uploadedImageUrl,
                            questions = questions.filter { it.question.isNotBlank() }
                        )
                        SqlExporter.shareSqlFile(context, "${courseCode}_Lesson_$lNum", sql)
                    },
                    modifier = Modifier.weight(1f),
                    enabled = courseCode.isNotBlank() && lessonTitle.isNotBlank()
                ) {
                    Icon(Icons.Default.FileDownload, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Export .SQL")
                }

                // Publish to Database Button
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                isSaving = true
                                val db = SupabaseClient.postgrest

                                // 1. Course
                                val existing = db.from("courses").select {
                                    filter { eq("course_code", courseCode.trim()) }
                                }.decodeList<Course>()

                                val targetCourseId = if (existing.isNotEmpty() && !existing.first().id.isNullOrBlank()) {
                                    existing.first().id!!
                                } else {
                                    val created = db.from("courses").insert(
                                        Course(
                                            courseCode = courseCode.trim(),
                                            courseName = courseName.trim(),
                                            term = term,
                                            description = description,
                                            status = "OPEN",
                                            showAnswers = true
                                        )
                                    ) { select() }.decodeSingle<Course>()
                                    created.id ?: throw IllegalStateException("Course ID generation failed")
                                }

                                // 2. Module
                                val lNum = lessonNumber.toIntOrNull() ?: 1
                                val createdModule = db.from("course_modules").insert(
                                    CourseModule(
                                        courseId = targetCourseId,
                                        title = lessonTitle,
                                        description = description,
                                        moduleOrder = lNum,
                                        status = "ACTIVE"
                                    )
                                ) { select() }.decodeSingle<CourseModule>()

                                val targetModuleId = createdModule.id ?: throw IllegalStateException("Module ID generation failed")

                                // 3. Slide Notes
                                db.from("module_slides").insert(
                                    ModuleSlide(
                                        moduleId = targetModuleId,
                                        title = lessonTitle,
                                        content = lessonContent,
                                        imageUrl = uploadedImageUrl,
                                        slideOrder = 1,
                                        duration = "15 mins",
                                        status = "ACTIVE"
                                    )
                                )

                                // 4. Questions
                                val validQuestions = questions.filter { it.question.isNotBlank() }.mapIndexed { idx, q ->
                                    q.copy(courseId = targetCourseId, moduleId = targetModuleId, questionOrder = idx + 1)
                                }
                                if (validQuestions.isNotEmpty()) {
                                    db.from("course_questions").insert(validQuestions)
                                }

                                statusMessage = "✅ Successfully Published to WhatsApp Bot Database!"
                            } catch (e: Exception) {
                                statusMessage = "Save Error: ${e.localizedMessage}"
                            } finally {
                                isSaving = false
                            }
                        }
                    },
                    modifier = Modifier.weight(1.3f),
                    enabled = courseCode.isNotBlank() && lessonTitle.isNotBlank() && !isSaving
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Icon(Icons.Default.CloudUpload, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Publish")
                    }
                }
            }
        }
    }
}
