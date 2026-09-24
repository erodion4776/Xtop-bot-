package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.*
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CsvImportScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var csvText by remember { mutableStateOf("") }
    var importAsDraft by remember { mutableStateOf(true) }
    var isImporting by remember { mutableStateOf(false) }
    var importResult by remember { mutableStateOf<String?>(null) }

    val csvFilePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            try {
                val stream = context.contentResolver.openInputStream(it)
                csvText = stream?.bufferedReader()?.use { reader -> reader.readText() } ?: ""
                scope.launch { snackbarHostState.showSnackbar("CSV File loaded successfully!") }
            } catch (e: Exception) {
                scope.launch { snackbarHostState.showSnackbar("Read failed: ${e.localizedMessage}") }
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("CSV Bulk Course & Content Import") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(
                    "Bulk Upload Courses, Lessons & Practice Questions",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    "Imported content will automatically show up in the Manual Course Editor where you can review, add diagram images, edit sections, and publish to WhatsApp.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { csvFilePicker.launch("text/*") }) {
                        Icon(Icons.Default.UploadFile, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Pick CSV File")
                    }

                    OutlinedButton(onClick = {
                        csvText = """course_code,course_name,department,level,semester,description,module_title,lesson_number,lesson_title,lesson_content,question,option_a,option_b,option_c,option_d,correct_answer,explanation
ELA301,Automobile Workshop I,Automobile Workshop,300,First Semester,"Workshop safety and vehicle maintenance",Introduction to Automobile Workshop,1,Workshop Safety,"*Workshop Safety Rules*:\n1. Always wear PPE\n2. Keep pathways clear of oil spills",What is the primary function of PPE?,To look professional,To protect workers from hazards,To increase speed,To reduce fuel consumption,B,"PPE protects workers from physical and chemical hazards."
ELA301,Automobile Workshop I,Automobile Workshop,300,First Semester,"Workshop safety and vehicle maintenance",Introduction to Automobile Workshop,2,Workshop Hand Tools,"*Common Workshop Tools*:\n• Spanners (Open, Ring, Combination)\n• Sockets and Ratchets\n• Pliers and Screwdrivers",Which tool is best for loosening high-torque bolts?,Pliers,Open-ended spanner,Socket with breaker bar,Adjustable wrench,C,"Sockets provide full grip around the fastener."
""".trimIndent()
                    }) {
                        Text("Load Sample CSV")
                    }
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = importAsDraft,
                        onCheckedChange = { importAsDraft = it }
                    )
                    Text("Import as Draft (Recommended: allows review in Manual Editor before publishing)")
                }
            }

            item {
                OutlinedTextField(
                    value = csvText,
                    onValueChange = { csvText = it },
                    label = { Text("Paste CSV Content Here") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    singleLine = false
                )
            }

            importResult?.let { result ->
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(result, style = MaterialTheme.typography.bodyMedium)
                            Button(onClick = { navController.navigate("manual_course_editor") }) {
                                Icon(Icons.Default.EditNote, null)
                                Spacer(Modifier.width(6.dp))
                                Text("Open in Manual Course Editor")
                            }
                        }
                    }
                }
            }

            item {
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                isImporting = true
                                val lines = csvText.lines().filter { it.trim().isNotBlank() }
                                if (lines.size < 2) {
                                    importResult = "CSV contains no data rows."
                                    return@launch
                                }

                                val db = SupabaseClient.postgrest
                                val courseStatus = if (importAsDraft) "DRAFT" else "OPEN"
                                val itemStatus = if (importAsDraft) "DRAFT" else "ACTIVE"
                                val isDraft = importAsDraft

                                var importedCourses = 0
                                var importedLessons = 0
                                var importedQuestions = 0

                                // Parse data rows (skipping header)
                                for (i in 1 until lines.size) {
                                    val row = parseCsvLine(lines[i])
                                    if (row.size >= 10) {
                                        val cCode = row.getOrNull(0)?.trim()?.uppercase() ?: continue
                                        val cName = row.getOrNull(1)?.trim() ?: cCode
                                        val cDept = row.getOrNull(2)?.trim() ?: "Automobile Workshop"
                                        val cLevel = row.getOrNull(3)?.trim() ?: "300"
                                        val cSem = row.getOrNull(4)?.trim() ?: "First Semester"
                                        val cDesc = row.getOrNull(5)?.trim() ?: ""
                                        val mTitle = row.getOrNull(6)?.trim() ?: "Module 1"
                                        val lNum = row.getOrNull(7)?.trim()?.toIntOrNull() ?: 1
                                        val lTitle = row.getOrNull(8)?.trim() ?: "Lesson $lNum"
                                        val lContent = row.getOrNull(9)?.trim() ?: ""

                                        // Optional practice question fields
                                        val pqText = row.getOrNull(10)?.trim() ?: ""
                                        val pqA = row.getOrNull(11)?.trim() ?: ""
                                        val pqB = row.getOrNull(12)?.trim() ?: ""
                                        val pqC = row.getOrNull(13)?.trim() ?: ""
                                        val pqD = row.getOrNull(14)?.trim() ?: ""
                                        val pqAns = row.getOrNull(15)?.trim()?.uppercase()?.take(1) ?: "A"
                                        val pqExp = row.getOrNull(16)?.trim() ?: ""

                                        // 1. Course
                                        val existingCourses = db.from("courses").select {
                                            filter { eq("course_code", cCode) }
                                        }.decodeList<Course>()

                                        val targetCourseId = if (existingCourses.isNotEmpty() && !existingCourses.first().id.isNullOrBlank()) {
                                            existingCourses.first().id!!
                                        } else {
                                            val created = db.from("courses").insert(
                                                Course(
                                                    courseCode = cCode,
                                                    courseName = cName,
                                                    department = cDept,
                                                    level = cLevel,
                                                    semester = cSem,
                                                    description = cDesc,
                                                    status = courseStatus
                                                )
                                            ) { select() }.decodeSingle<Course>()
                                            importedCourses++
                                            created.id!!
                                        }

                                        // 2. Module
                                        val existingModules = db.from("course_modules").select {
                                            filter {
                                                eq("course_id", targetCourseId)
                                                eq("title", mTitle)
                                            }
                                        }.decodeList<CourseModule>()

                                        val targetModuleId = if (existingModules.isNotEmpty() && !existingModules.first().id.isNullOrBlank()) {
                                            existingModules.first().id!!
                                        } else {
                                            val createdMod = db.from("course_modules").insert(
                                                CourseModule(
                                                    courseId = targetCourseId,
                                                    title = mTitle,
                                                    moduleOrder = 1,
                                                    status = itemStatus
                                                )
                                            ) { select() }.decodeSingle<CourseModule>()
                                            createdMod.id!!
                                        }

                                        // 3. Slide / Lesson
                                        val createdLesson = db.from("module_slides").insert(
                                            ModuleSlide(
                                                moduleId = targetModuleId,
                                                title = lTitle,
                                                content = lContent,
                                                lessonNumber = lNum,
                                                orderIndex = lNum,
                                                slideOrder = lNum,
                                                status = itemStatus,
                                                isDraft = isDraft
                                            )
                                        ) { select() }.decodeSingle<ModuleSlide>()
                                        importedLessons++

                                        // 4. Practice Question
                                        if (pqText.isNotBlank() && !createdLesson.id.isNullOrBlank()) {
                                            db.from("lesson_practice_questions").insert(
                                                LessonPracticeQuestion(
                                                    lessonId = createdLesson.id!!,
                                                    question = pqText,
                                                    optionA = pqA,
                                                    optionB = pqB,
                                                    optionC = pqC,
                                                    optionD = pqD,
                                                    correctAnswer = pqAns,
                                                    explanation = pqExp,
                                                    status = "ACTIVE"
                                                )
                                            )
                                            importedQuestions++
                                        }
                                    }
                                }

                                importResult = "✅ Successfully imported $importedLessons lesson(s) and $importedQuestions practice question(s). You can now open and edit them in the Manual Course Editor."
                            } catch (e: Exception) {
                                importResult = "Import Error: ${e.localizedMessage}"
                            } finally {
                                isImporting = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = csvText.isNotBlank() && !isImporting
                ) {
                    if (isImporting) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(8.dp))
                        Text("Importing to Database...")
                    } else {
                        Icon(Icons.Default.CloudUpload, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Import CSV to Learning Hub")
                    }
                }
            }
        }
    }
}

/**
 * Parses a CSV line respecting quoted strings with embedded commas.
 */
private fun parseCsvLine(line: String): List<String> {
    val tokens = mutableListOf<String>()
    var inQuotes = false
    val sb = StringBuilder()

    for (i in line.indices) {
        val c = line[i]
        if (c == '\"') {
            inQuotes = !inQuotes
        } else if (c == ',' && !inQuotes) {
            tokens.add(cleanToken(sb.toString()))
            sb.clear()
        } else {
            sb.append(c)
        }
    }
    tokens.add(cleanToken(sb.toString()))
    return tokens
}

private fun cleanToken(token: String): String {
    return token.trim().removePrefix("\"").removeSuffix("\"").replace("\\n", "\n")
}
