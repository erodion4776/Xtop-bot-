package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.models.*
import com.xtop.admin.data.remote.StorageService
import com.xtop.admin.data.repository.CourseEditorRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualCourseEditorScreen(navController: NavController) {
    val context = LocalContext.current
    val repo = remember { CourseEditorRepository() }
    val scope = rememberCoroutineScope()

    // ── STATE ──
    var courses by remember { mutableStateOf<List<Course>>(emptyList()) }
    var selectedCourse by remember { mutableStateOf<Course?>(null) }
    var modules by remember { mutableStateOf<List<CourseModule>>(emptyList()) }
    var selectedModule by remember { mutableStateOf<CourseModule?>(null) }
    var lessons by remember { mutableStateOf<List<ModuleSlide>>(emptyList()) }
    var selectedLesson by remember { mutableStateOf<ModuleSlide?>(null) }
    var sections by remember { mutableStateOf<List<LessonSection>>(emptyList()) }
    var media by remember { mutableStateOf<List<LessonMedia>>(emptyList()) }
    var materials by remember { mutableStateOf<List<LessonMaterial>>(emptyList()) }
    var practiceQs by remember { mutableStateOf<List<LessonPracticeQuestion>>(emptyList()) }
    var revisions by remember { mutableStateOf<List<CourseRevision>>(emptyList()) }

    var loading by remember { mutableStateOf(true) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var showCreateCourse by remember { mutableStateOf(false) }
    var showAddModule by remember { mutableStateOf(false) }
    var showAddLesson by remember { mutableStateOf(false) }
    var showAddSection by remember { mutableStateOf(false) }
    var showAddPracticeQ by remember { mutableStateOf(false) }
    var showPreview by remember { mutableStateOf(false) }
    var showHistory by remember { mutableStateOf(false) }
    var uploadingImage by remember { mutableStateOf(false) }

    // ── LOAD COURSES ──
    LaunchedEffect(Unit) {
        try { courses = repo.getCourses() } catch (_: Exception) {}
        loading = false
    }

    fun loadModules(courseId: String) {
        scope.launch {
            try { modules = repo.getModules(courseId) } catch (_: Exception) {}
        }
    }

    fun loadLessons(moduleId: String) {
        scope.launch {
            try { lessons = repo.getLessons(moduleId) } catch (_: Exception) {}
        }
    }

    fun loadLessonDetail(lessonId: String) {
        scope.launch {
            try {
                sections = repo.getSections(lessonId)
                media = repo.getMedia(lessonId)
                materials = repo.getMaterials(lessonId)
                practiceQs = repo.getPracticeQuestions(lessonId)
            } catch (_: Exception) {}
        }
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            val lessonId = selectedLesson?.id ?: return@let
            scope.launch {
                try {
                    uploadingImage = true
                    val url = StorageService.uploadImage(context, it)
                    repo.createMedia(LessonMedia(lessonId = lessonId, fileUrl = url, caption = "Diagram", mediaType = "image"))
                    media = repo.getMedia(lessonId)
                    repo.logRevision("lesson", lessonId, "IMAGE_UPLOADED")
                    Toast.makeText(context, "Image uploaded!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(context, "Upload failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                } finally { uploadingImage = false }
            }
        }
    }

    // ── SCAFFOLD ──
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Manual Course Editor", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        selectedCourse?.let {
                            Text("${it.courseCode} — ${it.courseName}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedLesson != null) { selectedLesson = null; sections = emptyList(); media = emptyList(); materials = emptyList(); practiceQs = emptyList() }
                        else if (selectedModule != null) { selectedModule = null; lessons = emptyList() }
                        else if (selectedCourse != null) { selectedCourse = null; modules = emptyList() }
                        else navController.popBackStack()
                    }) { Icon(Icons.Default.ArrowBack, "Back") }
                },
                actions = {
                    if (selectedCourse != null) {
                        IconButton(onClick = { showHistory = !showHistory }) { Icon(Icons.Default.History, "History") }
                        IconButton(onClick = { showPreview = !showPreview }) { Icon(Icons.Default.Visibility, "Preview") }
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (showPreview && selectedLesson != null) {
                // ── PREVIEW MODE ──
                LessonPreviewContent(lesson = selectedLesson!!, sections = sections, media = media, practiceQs = practiceQs, onBack = { showPreview = false })
            } else if (showHistory && selectedCourse != null) {
                // ── REVISION HISTORY ──
                RevisionHistoryContent(revisions = revisions, courseId = selectedCourse!!.id ?: "", repo = repo, onBack = { showHistory = false })
            } else if (selectedLesson != null) {
                // ── LESSON EDITOR ──
                LessonEditorContent(
                    lesson = selectedLesson!!,
                    sections = sections, media = media, materials = materials, practiceQs = practiceQs,
                    showAddSection = showAddSection, showAddPracticeQ = showAddPracticeQ,
                    uploadingImage = uploadingImage,
                    onToggleSection = { showAddSection = !showAddSection },
                    onTogglePracticeQ = { showAddPracticeQ = !showAddPracticeQ },
                    onPickImage = { imagePicker.launch("image/*") },
                    onSaveSection = { title, content ->
                        scope.launch {
                            val lessonId = selectedLesson?.id ?: return@launch
                            repo.createSection(LessonSection(lessonId = lessonId, title = title, content = content, orderIndex = sections.size + 1))
                            sections = repo.getSections(lessonId)
                            showAddSection = false
                            repo.logRevision("lesson", lessonId, "SECTION_ADDED")
                        }
                    },
                    onSavePracticeQ = { q ->
                        scope.launch {
                            val lessonId = selectedLesson?.id ?: return@launch
                            repo.createPracticeQuestion(q.copy(lessonId = lessonId, orderIndex = practiceQs.size + 1))
                            practiceQs = repo.getPracticeQuestions(lessonId)
                            showAddPracticeQ = false
                            repo.logRevision("lesson", lessonId, "PRACTICE_Q_ADDED")
                        }
                    },
                    onDeleteSection = { sId ->
                        scope.launch {
                            repo.deleteSection(sId)
                            sections = repo.getSections(selectedLesson?.id ?: "")
                        }
                    },
                    onDeleteMedia = { mId ->
                        scope.launch {
                            repo.deleteMedia(mId)
                            media = repo.getMedia(selectedLesson?.id ?: "")
                        }
                    },
                    onDeletePracticeQ = { qId ->
                        scope.launch {
                            repo.deletePracticeQuestion(qId)
                            practiceQs = repo.getPracticeQuestions(selectedLesson?.id ?: "")
                        }
                    },
                    onPublish = {
                        scope.launch {
                            val lId = selectedLesson?.id ?: return@launch
                            repo.publishLesson(lId)
                            selectedLesson = selectedLesson?.copy(status = "ACTIVE", isDraft = false)
                            statusMsg = "✅ Lesson Published"
                            repo.logRevision("lesson", lId, "PUBLISHED")
                        }
                    },
                    onUnpublish = {
                        scope.launch {
                            val lId = selectedLesson?.id ?: return@launch
                            repo.unpublishLesson(lId)
                            selectedLesson = selectedLesson?.copy(status = "DRAFT", isDraft = true)
                            statusMsg = "Lesson set to Draft"
                        }
                    },
                    onSaveContent = { content ->
                        scope.launch {
                            val lId = selectedLesson?.id ?: return@launch
                            repo.updateLesson(lId, mapOf("content" to content))
                            selectedLesson = selectedLesson?.copy(content = content)
                            statusMsg = "💾 Saved"
                            repo.logRevision("lesson", lId, "CONTENT_UPDATED")
                        }
                    }
                )
            } else if (selectedModule != null) {
                // ── MODULE LESSONS LIST ──
                ModuleLessonsContent(
                    module = selectedModule!!, lessons = lessons, showAddLesson = showAddLesson,
                    onToggleAdd = { showAddLesson = !showAddLesson },
                    onCreateLesson = { title, number ->
                        scope.launch {
                            val mId = selectedModule?.id ?: return@launch
                            val l = repo.createLesson(ModuleSlide(moduleId = mId, title = title, lessonNumber = number, orderIndex = lessons.size + 1, status = "DRAFT", isDraft = true))
                            lessons = repo.getLessons(mId)
                            showAddLesson = false
                            repo.logRevision("module", mId, "LESSON_CREATED: ${l.title}")
                        }
                    },
                    onSelectLesson = { l ->
                        selectedLesson = l
                        loadLessonDetail(l.id ?: "")
                    },
                    onDeleteLesson = { lId ->
                        scope.launch {
                            repo.deleteLesson(lId)
                            lessons = repo.getLessons(selectedModule?.id ?: "")
                        }
                    },
                    onPublishModule = {
                        scope.launch {
                            val mId = selectedModule?.id ?: return@launch
                            repo.publishModule(mId)
                            selectedModule = selectedModule?.copy(status = "ACTIVE")
                            statusMsg = "✅ Module Published"
                        }
                    }
                )
            } else if (selectedCourse != null) {
                // ── COURSE MODULES LIST ──
                CourseModulesContent(
                    course = selectedCourse!!, modules = modules, showAddModule = showAddModule,
                    onToggleAdd = { showAddModule = !showAddModule },
                    onCreateModule = { title, desc ->
                        scope.launch {
                            val cId = selectedCourse?.id ?: return@launch
                            repo.createModule(CourseModule(courseId = cId, title = title, description = desc, moduleOrder = modules.size + 1, status = "DRAFT"))
                            modules = repo.getModules(cId)
                            showAddModule = false
                            repo.logRevision("course", cId, "MODULE_CREATED: $title")
                        }
                    },
                    onSelectModule = { m ->
                        selectedModule = m
                        loadLessons(m.id ?: "")
                    },
                    onDeleteModule = { mId ->
                        scope.launch {
                            repo.deleteModule(mId)
                            modules = repo.getModules(selectedCourse?.id ?: "")
                        }
                    },
                    onPublishCourse = {
                        scope.launch {
                            val cId = selectedCourse?.id ?: return@launch
                            repo.publishCourse(cId)
                            selectedCourse = selectedCourse?.copy(status = "OPEN")
                            statusMsg = "✅ Course Published to WhatsApp Bot!"
                        }
                    },
                    onUnpublishCourse = {
                        scope.launch {
                            val cId = selectedCourse?.id ?: return@launch
                            repo.unpublishCourse(cId)
                            selectedCourse = selectedCourse?.copy(status = "DRAFT")
                            statusMsg = "Course set to Draft"
                        }
                    }
                )
            } else {
                // ── COURSE LIST ──
                CourseListContent(
                    courses = courses, showCreate = showCreateCourse,
                    onToggleCreate = { showCreateCourse = !showCreateCourse },
                    onCreateCourse = { code, name, dept, lvl, sem, desc, obj ->
                        scope.launch {
                            try {
                                val c = repo.createCourse(Course(courseCode = code, courseName = name, department = dept, level = lvl, semester = sem, description = desc, objectives = obj, status = "DRAFT"))
                                courses = repo.getCourses()
                                showCreateCourse = false
                                repo.logRevision("course", c.id ?: "", "COURSE_CREATED: $code")
                                statusMsg = "✅ Course $code created as Draft"
                            } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                        }
                    },
                    onSelectCourse = { c ->
                        selectedCourse = c
                        loadModules(c.id ?: "")
                    },
                    onDeleteCourse = { cId ->
                        scope.launch {
                            repo.deleteCourse(cId)
                            courses = repo.getCourses()
                        }
                    }
                )
            }

            // Status message overlay
            statusMsg?.let { msg ->
                Snackbar(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    action = { TextButton(onClick = { statusMsg = null }) { Text("OK") } }
                ) { Text(msg) }
            }
        }
    }
}

// ════════════════════════════════════════════════════════════
// SUB-COMPOSABLES
// ════════════════════════════════════════════════════════════

@Composable
fun CourseListContent(
    courses: List<Course>, showCreate: Boolean,
    onToggleCreate: () -> Unit, onCreateCourse: (String, String, String, String, String, String, String) -> Unit,
    onSelectCourse: (Course) -> Unit, onDeleteCourse: (String) -> Unit
) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var dept by remember { mutableStateOf("Automobile Workshop") }
    var lvl by remember { mutableStateOf("300") }
    var sem by remember { mutableStateOf("First Semester") }
    var desc by remember { mutableStateOf("") }
    var obj by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("All Courses (${courses.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Button(onClick = onToggleCreate) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(4.dp)); Text("Create") }
            }
        }

        if (showCreate) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Create New Course", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        OutlinedTextField(value = code, onValueChange = { code = it.uppercase() }, label = { Text("Course Code *") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Course Title *") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = dept, onValueChange = { dept = it }, label = { Text("Department") }, modifier = Modifier.weight(1f), singleLine = true)
                            OutlinedTextField(value = lvl, onValueChange = { lvl = it }, label = { Text("Level") }, modifier = Modifier.weight(0.5f), singleLine = true)
                        }
                        OutlinedTextField(value = sem, onValueChange = { sem = it }, label = { Text("Semester") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = desc, onValueChange = { desc = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                        OutlinedTextField(value = obj, onValueChange = { obj = it }, label = { Text("Objectives") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { if (code.isNotBlank() && name.isNotBlank()) onCreateCourse(code, name, dept, lvl, sem, desc, obj) }, enabled = code.isNotBlank() && name.isNotBlank()) { Text("Save as Draft") }
                            OutlinedButton(onClick = onToggleCreate) { Text("Cancel") }
                        }
                    }
                }
            }
        }

        if (courses.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.MenuBook, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(8.dp))
                        Text("No courses yet.", style = MaterialTheme.typography.bodyMedium)
                        Text("Create your first course to begin.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        items(courses) { c ->
            Card(onClick = { onSelectCourse(c) }, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${c.courseCode} — ${c.courseName}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Text("${c.department ?: ""} • ${c.level ?: ""}L • ${c.semester ?: ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        val statusColor = when (c.status) { "OPEN" -> Color(0xFF4CAF50); "DRAFT" -> Color(0xFFFF9800); else -> Color.Gray }
                        Text(c.status, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        IconButton(onClick = { c.id?.let { onDeleteCourse(it) } }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CourseModulesContent(
    course: Course, modules: List<CourseModule>, showAddModule: Boolean,
    onToggleAdd: () -> Unit, onCreateModule: (String, String) -> Unit,
    onSelectModule: (CourseModule) -> Unit, onDeleteModule: (String) -> Unit,
    onPublishCourse: () -> Unit, onUnpublishCourse: () -> Unit
) {
    var mTitle by remember { mutableStateOf("") }
    var mDesc by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("${course.courseCode}: ${course.courseName}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("${course.department} • ${course.level}L • ${course.semester} • ${course.duration}", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(4.dp))
                    Text("Modules: ${modules.size} • Status: ${course.status}", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (course.status == "OPEN") OutlinedButton(onClick = onUnpublishCourse) { Text("Unpublish") }
                        else Button(onClick = onPublishCourse) { Text("Publish Course") }
                    }
                }
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Modules", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Button(onClick = onToggleAdd) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(4.dp)); Text("Module") }
            }
        }

        if (showAddModule) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Add Module", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(value = mTitle, onValueChange = { mTitle = it }, label = { Text("Module Title *") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(value = mDesc, onValueChange = { mDesc = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { if (mTitle.isNotBlank()) onCreateModule(mTitle, mDesc) }, enabled = mTitle.isNotBlank()) { Text("Create") }
                            OutlinedButton(onClick = onToggleAdd) { Text("Cancel") }
                        }
                    }
                }
            }
        }

        if (modules.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No modules yet.", style = MaterialTheme.typography.bodyMedium)
                        Text("Start building your course by adding your first module.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        itemsIndexed(modules) { idx, m ->
            Card(onClick = { onSelectModule(m) }, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("M${idx + 1}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(32.dp))
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(m.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                        Text(m.description ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(m.status, style = MaterialTheme.typography.labelSmall, color = if (m.status == "ACTIVE") Color(0xFF4CAF50) else Color(0xFFFF9800))
                    IconButton(onClick = { m.id?.let { onDeleteModule(it) } }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun ModuleLessonsContent(
    module: CourseModule, lessons: List<ModuleSlide>, showAddLesson: Boolean,
    onToggleAdd: () -> Unit, onCreateLesson: (String, Int) -> Unit,
    onSelectLesson: (ModuleSlide) -> Unit, onDeleteLesson: (String) -> Unit,
    onPublishModule: () -> Unit
) {
    var lTitle by remember { mutableStateOf("") }
    var lNum by remember { mutableStateOf("${lessons.size + 1}") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(module.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text("Lessons: ${lessons.size} • Status: ${module.status}", style = MaterialTheme.typography.labelSmall)
                    }
                    if (module.status != "ACTIVE") Button(onClick = onPublishModule) { Text("Publish") }
                }
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Lessons", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Button(onClick = onToggleAdd) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(4.dp)); Text("Lesson") }
            }
        }

        if (showAddLesson) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Add Lesson", style = MaterialTheme.typography.titleSmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = lNum, onValueChange = { lNum = it.filter { c -> c.isDigit() } }, label = { Text("#") }, modifier = Modifier.width(80.dp), singleLine = true)
                            OutlinedTextField(value = lTitle, onValueChange = { lTitle = it }, label = { Text("Lesson Title *") }, modifier = Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { if (lTitle.isNotBlank()) onCreateLesson(lTitle, lNum.toIntOrNull() ?: 1) }, enabled = lTitle.isNotBlank()) { Text("Create") }
                            OutlinedButton(onClick = onToggleAdd) { Text("Cancel") }
                        }
                    }
                }
            }
        }

        if (lessons.isEmpty()) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No lessons in this module.", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        itemsIndexed(lessons) { idx, l ->
            Card(onClick = { onSelectLesson(l) }, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("L${idx + 1}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.width(28.dp))
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(l.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text("${l.estimatedMinutes} min • ${l.status}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val isPublished = l.status == "ACTIVE"
                    Icon(if (isPublished) Icons.Default.CheckCircle else Icons.Default.Edit, null, tint = if (isPublished) Color(0xFF4CAF50) else Color(0xFFFF9800), modifier = Modifier.size(18.dp))
                    IconButton(onClick = { l.id?.let { onDeleteLesson(it) } }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun LessonEditorContent(
    lesson: ModuleSlide, sections: List<LessonSection>, media: List<LessonMedia>,
    materials: List<LessonMaterial>, practiceQs: List<LessonPracticeQuestion>,
    showAddSection: Boolean, showAddPracticeQ: Boolean, uploadingImage: Boolean,
    onToggleSection: () -> Unit, onTogglePracticeQ: () -> Unit, onPickImage: () -> Unit,
    onSaveSection: (String, String) -> Unit, onSavePracticeQ: (LessonPracticeQuestion) -> Unit,
    onDeleteSection: (String) -> Unit, onDeleteMedia: (String) -> Unit, onDeletePracticeQ: (String) -> Unit,
    onPublish: () -> Unit, onUnpublish: () -> Unit, onSaveContent: (String) -> Unit
) {
    var content by remember(lesson.id) { mutableStateOf(lesson.content ?: "") }
    var secTitle by remember { mutableStateOf("") }
    var secContent by remember { mutableStateOf("") }
    var pqQuestion by remember { mutableStateOf("") }
    var pqA by remember { mutableStateOf("") }
    var pqB by remember { mutableStateOf("") }
    var pqC by remember { mutableStateOf("") }
    var pqD by remember { mutableStateOf("") }
    var pqAns by remember { mutableStateOf("A") }
    var pqExp by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Header
        item {
            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(lesson.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("Lesson ${lesson.lessonNumber} • ${lesson.estimatedMinutes} min • ${lesson.status}", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (lesson.status == "ACTIVE") OutlinedButton(onClick = onUnpublish) { Text("Unpublish") }
                        else Button(onClick = onPublish) { Text("Publish Lesson") }
                        OutlinedButton(onClick = { onSaveContent(content) }) { Icon(Icons.Default.Save, null); Spacer(Modifier.width(4.dp)); Text("Save") }
                    }
                }
            }
        }

        // Content Editor
        item {
            Text("Lesson Content", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = content, onValueChange = { content = it },
                label = { Text("Write lesson content (WhatsApp formatted)") },
                modifier = Modifier.fillMaxWidth().height(200.dp),
                singleLine = false
            )
        }

        // Sections
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Sections (${sections.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = onToggleSection) { Text(if (showAddSection) "Cancel" else "+ Add Section") }
            }
        }

        if (showAddSection) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = secTitle, onValueChange = { secTitle = it }, label = { Text("Section Title") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = secContent, onValueChange = { secContent = it }, label = { Text("Section Content") }, modifier = Modifier.fillMaxWidth().height(100.dp))
                        Button(onClick = { if (secTitle.isNotBlank()) { onSaveSection(secTitle, secContent); secTitle = ""; secContent = "" } }, enabled = secTitle.isNotBlank()) { Text("Save Section") }
                    }
                }
            }
        }

        items(sections) { s ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(s.title, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        Text(s.content ?: "", style = MaterialTheme.typography.labelSmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(onClick = { s.id?.let { onDeleteSection(it) } }, modifier = Modifier.size(24.dp)) { Icon(Icons.Default.Close, "Remove", modifier = Modifier.size(16.dp)) }
                }
            }
        }

        // Images
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Images & Diagrams (${media.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = onPickImage) { Text(if (uploadingImage) "Uploading..." else "+ Add Image") }
            }
        }

        items(media) { m ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(8.dp)) {
                    AsyncImage(model = m.fileUrl, contentDescription = m.caption, modifier = Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(m.caption ?: "Image", style = MaterialTheme.typography.labelSmall)
                        IconButton(onClick = { m.id?.let { onDeleteMedia(it) } }, modifier = Modifier.size(24.dp)) { Icon(Icons.Default.Close, "Remove", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }

        // Practice Questions
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Practice Questions (${practiceQs.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                TextButton(onClick = onTogglePracticeQ) { Text(if (showAddPracticeQ) "Cancel" else "+ Add Question") }
            }
        }

        if (showAddPracticeQ) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = pqQuestion, onValueChange = { pqQuestion = it }, label = { Text("Question") }, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            OutlinedTextField(value = pqA, onValueChange = { pqA = it }, label = { Text("A") }, modifier = Modifier.weight(1f))
                            OutlinedTextField(value = pqB, onValueChange = { pqB = it }, label = { Text("B") }, modifier = Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            OutlinedTextField(value = pqC, onValueChange = { pqC = it }, label = { Text("C") }, modifier = Modifier.weight(1f))
                            OutlinedTextField(value = pqD, onValueChange = { pqD = it }, label = { Text("D") }, modifier = Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(value = pqAns, onValueChange = { pqAns = it.uppercase().take(1) }, label = { Text("Answer") }, modifier = Modifier.width(90.dp), singleLine = true)
                            OutlinedTextField(value = pqExp, onValueChange = { pqExp = it }, label = { Text("Explanation") }, modifier = Modifier.weight(1f))
                        }
                        Button(onClick = {
                            if (pqQuestion.isNotBlank()) {
                                onSavePracticeQ(LessonPracticeQuestion(question = pqQuestion, optionA = pqA, optionB = pqB, optionC = pqC, optionD = pqD, correctAnswer = pqAns, explanation = pqExp))
                                pqQuestion = ""; pqA = ""; pqB = ""; pqC = ""; pqD = ""; pqAns = "A"; pqExp = ""
                            }
                        }, enabled = pqQuestion.isNotBlank()) { Text("Save Question") }
                    }
                }
            }
        }

        items(practiceQs) { q ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(q.question, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        Text("A) ${q.optionA}  B) ${q.optionB}", style = MaterialTheme.typography.labelSmall)
                        Text("C) ${q.optionC}  D) ${q.optionD}", style = MaterialTheme.typography.labelSmall)
                        Text("Answer: ${q.correctAnswer}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = { q.id?.let { onDeletePracticeQ(it) } }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.Close, "Remove", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // CBT Connection Info
        item {
            HorizontalDivider(Modifier.padding(vertical = 4.dp))
            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("CBT Connection", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("Final CBT questions are managed in the Question Bank module.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Practice questions above are for lesson reinforcement only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    TextButton(onClick = { /* Navigate to question bank */ }) {
                        Icon(Icons.Default.Quiz, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Manage Question Bank")
                    }
                }
            }
        }

        // Bottom spacer
        item { Spacer(Modifier.height(80.dp)) }
    }
}

// ════════════════════════════════════════════════════════════
// LESSON PREVIEW (Student View + WhatsApp View)
// ════════════════════════════════════════════════════════════

@Composable
fun LessonPreviewContent(
    lesson: ModuleSlide,
    sections: List<LessonSection>,
    media: List<LessonMedia>,
    practiceQs: List<LessonPracticeQuestion>,
    onBack: () -> Unit
) {
    var showWhatsAppView by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (showWhatsAppView) "WhatsApp Preview" else "Student Preview",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                FilterChip(
                    selected = !showWhatsAppView,
                    onClick = { showWhatsAppView = false },
                    label = { Text("Student") }
                )
                FilterChip(
                    selected = showWhatsAppView,
                    onClick = { showWhatsAppView = true },
                    label = { Text("WhatsApp") }
                )
                IconButton(onClick = onBack) { Icon(Icons.Default.Close, "Close Preview") }
            }
        }

        HorizontalDivider()

        if (showWhatsAppView) {
            // WhatsApp-style preview
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFDCF8C6))
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "*${lesson.title}*",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        lesson.content ?: "_No content yet._",
                        style = MaterialTheme.typography.bodySmall
                    )

                    sections.forEachIndexed { idx, s ->
                        HorizontalDivider(Modifier.padding(vertical = 2.dp))
                        Text("*${idx + 1}. ${s.title}*", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        Text(s.content ?: "", style = MaterialTheme.typography.bodySmall)
                    }

                    media.forEach { m ->
                        Spacer(Modifier.height(4.dp))
                        AsyncImage(
                            model = m.fileUrl,
                            contentDescription = m.caption,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp)
                                .clip(RoundedCornerShape(8.dp)),
                            contentScale = ContentScale.Crop
                        )
                        Text("_${m.caption ?: "Image"}_", style = MaterialTheme.typography.labelSmall)
                    }

                    if (practiceQs.isNotEmpty()) {
                        HorizontalDivider(Modifier.padding(vertical = 4.dp))
                        Text("*Practice Questions:*", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        practiceQs.forEachIndexed { idx, q ->
                            Text("${idx + 1}. ${q.question}", style = MaterialTheme.typography.bodySmall)
                            Text("A) ${q.optionA}  B) ${q.optionB}", style = MaterialTheme.typography.labelSmall)
                            Text("C) ${q.optionC}  D) ${q.optionD}", style = MaterialTheme.typography.labelSmall)
                        }
                    }

                    Spacer(Modifier.height(4.dp))
                    Text(
                        "_Reply with your answer or type NEXT to continue._",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF666666)
                    )
                }
            }
        } else {
            // Student view preview
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(lesson.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Lesson ${lesson.lessonNumber} • ${lesson.estimatedMinutes} min", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    lesson.objectives?.let { obj ->
                        HorizontalDivider()
                        Text("Learning Objectives", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(obj, style = MaterialTheme.typography.bodySmall)
                    }

                    HorizontalDivider()
                    Text("Lesson Content", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(lesson.content ?: "No content yet.", style = MaterialTheme.typography.bodyMedium)

                    sections.forEachIndexed { idx, s ->
                        HorizontalDivider(Modifier.padding(vertical = 2.dp))
                        Text("${idx + 1}. ${s.title}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(s.content ?: "", style = MaterialTheme.typography.bodySmall)
                    }

                    media.forEach { m ->
                        Spacer(Modifier.height(8.dp))
                        AsyncImage(
                            model = m.fileUrl,
                            contentDescription = m.caption,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(180.dp)
                                .clip(RoundedCornerShape(8.dp)),
                            contentScale = ContentScale.Crop
                        )
                        Text(m.caption ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    if (practiceQs.isNotEmpty()) {
                        HorizontalDivider(Modifier.padding(vertical = 8.dp))
                        Text("Practice Questions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        practiceQs.forEachIndexed { idx, q ->
                            Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text("${idx + 1}. ${q.question}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                    Text("A) ${q.optionA}", style = MaterialTheme.typography.labelSmall)
                                    Text("B) ${q.optionB}", style = MaterialTheme.typography.labelSmall)
                                    Text("C) ${q.optionC}", style = MaterialTheme.typography.labelSmall)
                                    Text("D) ${q.optionD}", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(40.dp))
    }
}

// ════════════════════════════════════════════════════════════
// REVISION HISTORY
// ════════════════════════════════════════════════════════════

@Composable
fun RevisionHistoryContent(
    revisions: List<CourseRevision>,
    courseId: String,
    repo: CourseEditorRepository,
    onBack: () -> Unit
) {
    var loadedRevisions by remember { mutableStateOf(revisions) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(courseId) {
        try {
            loadedRevisions = repo.getRevisions("course", courseId)
        } catch (_: Exception) {}
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Revision History", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            IconButton(onClick = onBack) { Icon(Icons.Default.Close, "Close") }
        }

        HorizontalDivider(Modifier.padding(vertical = 8.dp))

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (loadedRevisions.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.History, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text("No revision history yet.", style = MaterialTheme.typography.bodyMedium)
                    Text("Changes will appear here as you edit.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(loadedRevisions) { r ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                            Icon(
                                when {
                                    r.action.contains("PUBLISH") -> Icons.Default.CheckCircle
                                    r.action.contains("CREATE") -> Icons.Default.Add
                                    r.action.contains("DELETE") -> Icons.Default.Delete
                                    r.action.contains("UPLOAD") -> Icons.Default.CloudUpload
                                    else -> Icons.Default.Edit
                                },
                                null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp).padding(top = 2.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(r.action, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                Text(
                                    "by ${r.changedBy} • ${r.createdAt?.take(16) ?: ""}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
