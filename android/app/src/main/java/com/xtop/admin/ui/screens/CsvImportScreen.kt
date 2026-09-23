package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.models.*
import com.xtop.admin.data.remote.SqlExporter
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CsvImportScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var csvText by remember { mutableStateOf("") }
    var parsedCount by remember { mutableStateOf(0) }
    var isSaving by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val csvFilePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            try {
                val stream = context.contentResolver.openInputStream(it)
                csvText = stream?.bufferedReader()?.use { reader -> reader.readText() } ?: ""
                Toast.makeText(context, "CSV File Loaded!", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(context, "Read Failed: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("CSV Bulk Course Import") },
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
            Text("Bulk Upload Courses & Questions via CSV", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text(
                "Pick a .csv file from your phone or paste the CSV rows directly into the text area below.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { csvFilePicker.launch("text/*") }) {
                    Icon(Icons.Default.UploadFile, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Pick CSV File")
                }

                OutlinedButton(onClick = {
                    csvText = """
course_code,course_name,term,lesson_number,lesson_title,lesson_content,question,option_a,option_b,option_c,option_d,correct_answer,explanation
ELA301,Braking Systems,First Semester,1,ABS Fundamentals,*Anti-Lock Braking System* operates by...,What prevents wheel lockup?,ABS,ECU,TCS,EBD,A,ABS modulates pressure
                    """.trimIndent()
                }) {
                    Text("Load Sample CSV")
                }
            }

            OutlinedTextField(
                value = csvText,
                onValueChange = { csvText = it },
                label = { Text("Paste CSV Content Here") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                singleLine = false
            )

            if (statusMessage != null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Text(statusMessage ?: "", modifier = Modifier.padding(12.dp))
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Export SQL
                OutlinedButton(
                    onClick = {
                        val lines = csvText.lines().filter { it.isNotBlank() }
                        if (lines.size > 1) {
                            val sql = buildString {
                                appendLine("-- Bulk CSV Import SQL")
                                lines.drop(1).forEach { row ->
                                    val cols = row.split(",")
                                    if (cols.size >= 7) {
                                        appendLine("INSERT INTO public.courses (course_code, course_name, term) VALUES ('${cols[0].trim()}', '${cols[1].trim()}', '${cols[2].trim()}') ON CONFLICT DO NOTHING;")
                                    }
                                }
                            }
                            SqlExporter.shareSqlFile(context, "Bulk_Import", sql)
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = csvText.isNotBlank()
                ) {
                    Icon(Icons.Default.FileDownload, null)
                    Spacer(Modifier.width(6.dp))
                    Text("Export SQL")
                }

                // Import to Database
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                isSaving = true
                                val lines = csvText.lines().filter { it.isNotBlank() }
                                if (lines.size < 2) {
                                    statusMessage = "CSV contains no data rows."
                                    return@launch
                                }

                                val db = SupabaseClient.postgrest
                                var imported = 0

                                lines.drop(1).forEach { line ->
                                    val cols = line.split(",").map { it.trim().removeSurrounding("\"") }
                                    if (cols.size >= 7) {
                                        val code = cols.getOrNull(0) ?: "ELA301"
                                        val name = cols.getOrNull(1) ?: "Course"
                                        val term = cols.getOrNull(2) ?: "First Semester"
                                        val lNum = cols.getOrNull(3)?.toIntOrNull() ?: 1
                                        val lTitle = cols.getOrNull(4) ?: "Lesson $lNum"
                                        val lContent = cols.getOrNull(5) ?: ""
                                        val qText = cols.getOrNull(6) ?: ""
                                        val opA = cols.getOrNull(7) ?: ""
                                        val opB = cols.getOrNull(8) ?: ""
                                        val opC = cols.getOrNull(9) ?: ""
                                        val opD = cols.getOrNull(10) ?: ""
                                        val ans = cols.getOrNull(11) ?: "A"
                                        val exp = cols.getOrNull(12) ?: ""

                                        // 1. Course
                                        val existing = db.from("courses").select {
                                            filter { eq("course_code", code) }
                                        }.decodeList<Course>()

                                        val cId = if (existing.isNotEmpty()) existing.first().id!!
                                        else db.from("courses").insert(
                                            Course(courseCode = code, courseName = name, term = term, status = "OPEN", showAnswers = true)
                                        ) { select(Columns.ALL) }.decodeSingle<Course>().id!!

                                        // 2. Module
                                        val mId = db.from("course_modules").insert(
                                            CourseModule(courseId = cId, title = lTitle, moduleOrder = lNum, status = "ACTIVE")
                                        ) { select(Columns.ALL) }.decodeSingle<CourseModule>().id!!

                                        // 3. Slide
                                        db.from("module_slides").insert(
                                            ModuleSlide(moduleId = mId, title = lTitle, content = lContent, slideOrder = 1, status = "ACTIVE")
                                        )

                                        // 4. Question
                                        if (qText.isNotBlank()) {
                                            db.from("course_questions").insert(
                                                CourseQuestion(courseId = cId, moduleId = mId, question = qText, optionA = opA, optionB = opB, optionC = opC, optionD = opD, correctAnswer = ans, explanation = exp)
                                            )
                                        }
                                        imported++
                                    }
                                }

                                statusMessage = "✅ Successfully imported $imported records to WhatsApp bot!"
                            } catch (e: Exception) {
                                statusMessage = "Import error: ${e.localizedMessage}"
                            } finally {
                                isSaving = false
                            }
                        }
                    },
                    modifier = Modifier.weight(1.3f),
                    enabled = csvText.isNotBlank() && !isSaving
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Icon(Icons.Default.CloudUpload, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Import CSV")
                    }
                }
            }
        }
    }
}
