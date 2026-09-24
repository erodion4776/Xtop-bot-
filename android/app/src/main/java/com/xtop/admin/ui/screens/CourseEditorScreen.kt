package com.xtop.admin.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.*
import com.xtop.admin.data.repository.CourseEditorRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseEditorScreen(navController: NavController) {
    val repo = remember { CourseEditorRepository() }
    val scope = rememberCoroutineScope()

    var courses by remember { mutableStateOf<List<Course>>(emptyList()) }
    var selectedCourse by remember { mutableStateOf<Course?>(null) }
    var modules by remember { mutableStateOf<List<CourseModule>>(emptyList()) }
    var lessons by remember { mutableStateOf<Map<String, List<ModuleSlide>>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    // Dialogs
    var showCreateCourse by remember { mutableStateOf(false) }
    var showCreateModule by remember { mutableStateOf(false) }
    var showCreateLesson by remember { mutableStateOf(false) }
    var activeModuleId by remember { mutableStateOf("") }

    fun loadAll() {
        scope.launch {
            try {
                courses = repo.getCourses()
                selectedCourse?.let { c ->
                    c.id?.let { cid ->
                        val mods = repo.getModules(cid)
                        modules = mods
                        val lMap = mutableMapOf<String, List<ModuleSlide>>()
                        mods.forEach { m -> m.id?.let { mid -> lMap[mid] = repo.getLessons(mid) } }
                        lessons = lMap
                    }
                }
            } catch (_: Exception) {}
            loading = false
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (selectedCourse != null) "Course Editor" else "Learning Hub Courses") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedCourse != null) { selectedCourse = null; modules = emptyList(); lessons = emptyMap() }
                        else navController.popBackStack()
                    }) { Icon(Icons.Default.ArrowBack, "Back") }
                },
                actions = {
                    if (selectedCourse != null) {
                        IconButton(onClick = { navController.navigate("course_preview/${selectedCourse?.id}") }) {
                            Icon(Icons.Default.Preview, "Preview")
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                if (selectedCourse != null) showCreateModule = true
                else showCreateCourse = true
            }) {
                Icon(Icons.Default.Add, "Add")
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp)) {
            statusMsg?.let {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
                    Text(it, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(8.dp))
            }

            if (loading) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            } else if (selectedCourse == null) {
                // ── COURSE LIST VIEW ──
                Text("All Courses (${courses.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                if (courses.isEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.MenuBook, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            Text("No courses yet.", style = MaterialTheme.typography.bodyMedium)
                            Text("Tap + to create your first course.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(courses) { c ->
                            Card(
                                onClick = {
                                    selectedCourse = c
                                    scope.launch {
                                        c.id?.let { cid ->
                                            val mods = repo.getModules(cid)
                                            modules = mods
                                            val lMap = mutableMapOf<String, List<ModuleSlide>>()
                                            mods.forEach { m -> m.id?.let { mid -> lMap[mid] = repo.getLessons(mid) } }
                                            lessons = lMap
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("${c.courseCode} — ${c.courseName}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                        Text("${c.department ?: ""} • ${c.level ?: ""}L • ${c.semester ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("Status: ${c.status}", style = MaterialTheme.typography.labelSmall, color = if (c.status == "OPEN") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                                    }
                                    Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            } else {
                // ── COURSE EDITOR VIEW ──
                val course = selectedCourse!!
                val totalLessons = lessons.values.sumOf { it.size }
                val publishedLessons = lessons.values.sumOf { list -> list.count { !it.isDraft } }

                // Course Dashboard Header
                Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("${course.courseCode} — ${course.courseName}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("${course.department ?: ""} • ${course.level ?: ""}L • ${course.semester ?: ""} • ${course.duration ?: ""}", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StatChip("Modules", "${modules.size}")
                            StatChip("Lessons", "$totalLessons")
                            StatChip("Published", "$publishedLessons/$totalLessons")
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            val newStatus = if (course.status == "OPEN") "DRAFT" else "OPEN"
                            FilterChip(selected = course.status == "OPEN", onClick = {
                                scope.launch {
                                    course.id?.let { repo.updateCourse(it, mapOf("status" to newStatus)) }
                                    repo.logRevision("course", course.id ?: "", "STATUS_$newStatus")
                                    loadAll()
                                    statusMsg = "Course ${if (newStatus == "OPEN") "Published" else "Unpublished"}"
                                }
                            }, label = { Text(if (course.status == "OPEN") "Published" else "Draft") })
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                Text("Course Structure", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))

                if (modules.isEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("No modules yet.", style = MaterialTheme.typography.bodySmall)
                            Text("Tap + to add your first module.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                        items(modules) { mod ->
                            val modLessons = lessons[mod.id] ?: emptyList()
                            var expanded by remember { mutableStateOf(true) }
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { expanded = !expanded }) {
                                        Icon(if (expanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight, null, modifier = Modifier.size(20.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(mod.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                                            Text("${modLessons.size} lessons • ${mod.status}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        IconButton(onClick = {
                                            activeModuleId = mod.id ?: ""
                                            showCreateLesson = true
                                        }) { Icon(Icons.Default.Add, "Add Lesson", modifier = Modifier.size(20.dp)) }
                                        IconButton(onClick = {
                                            scope.launch {
                                                mod.id?.let { repo.deleteModule(it) }
                                                repo.logRevision("module", mod.id ?: "", "DELETED")
                                                loadAll()
                                            }
                                        }) { Icon(Icons.Default.Delete, "Delete", modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.error) }
                                    }
                                    if (expanded) {
                                        Spacer(Modifier.height(4.dp))
                                        modLessons.forEach { lesson ->
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(start = 24.dp, top = 4.dp, bottom = 4.dp)
                                                    .clickable { navController.navigate("lesson_builder/${lesson.id}") },
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Icon(
                                                    if (lesson.isDraft) Icons.Default.Edit else Icons.Default.CheckCircle,
                                                    null, modifier = Modifier.size(16.dp),
                                                    tint = if (lesson.isDraft) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary
                                                )
                                                Spacer(Modifier.width(6.dp))
                                                Text(lesson.title, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                                                Text(if (lesson.isDraft) "Draft" else "Published", style = MaterialTheme.typography.labelSmall, color = if (lesson.isDraft) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                                            }
                                        }
                                        if (modLessons.isEmpty()) {
                                            Text("No lessons. Tap + to add.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 24.dp))
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

    // ── CREATE COURSE DIALOG ──
    if (showCreateCourse) {
        var code by remember { mutableStateOf("") }
        var name by remember { mutableStateOf("") }
        var dept by remember { mutableStateOf("Automobile Workshop") }
        var level by remember { mutableStateOf("300") }
        var sem by remember { mutableStateOf("First Semester") }
        var desc by remember { mutableStateOf("") }
        var duration by remember { mutableStateOf("2 hours") }
        var instructor by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showCreateCourse = false },
            title = { Text("Create New Course") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                    OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Course Code *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Course Title *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = dept, onValueChange = { dept = it }, label = { Text("Department") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(value = level, onValueChange = { level = it }, label = { Text("Level") }, modifier = Modifier.weight(1f), singleLine = true)
                        OutlinedTextField(value = sem, onValueChange = { sem = it }, label = { Text("Semester") }, modifier = Modifier.weight(1f), singleLine = true)
                    }
                    OutlinedTextField(value = desc, onValueChange = { desc = it }, label = { Text("Description") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = duration, onValueChange = { duration = it }, label = { Text("Duration") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = instructor, onValueChange = { instructor = it }, label = { Text("Instructor") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (code.isBlank() || name.isBlank()) { statusMsg = "Course Code and Title are required."; return@Button }
                        scope.launch {
                            try {
                                val c = repo.createCourse(Course(courseCode = code.trim(), courseName = name.trim(), department = dept, level = level, semester = sem, description = desc, duration = duration, instructor = instructor, status = "DRAFT"))
                                repo.logRevision("course", c.id ?: "", "CREATED")
                                showCreateCourse = false
                                loadAll()
                                statusMsg = "Course created as Draft"
                            } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                        }
                    },
                    enabled = code.isNotBlank() && name.isNotBlank()
                ) { Text("Create Draft") }
            },
            dismissButton = { TextButton(onClick = { showCreateCourse = false }) { Text("Cancel") } }
        )
    }

    // ── CREATE MODULE DIALOG ──
    if (showCreateModule) {
        var title by remember { mutableStateOf("") }
        var desc by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateModule = false },
            title = { Text("Add Module") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Module Title *") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = desc, onValueChange = { desc = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (title.isBlank()) return@Button
                    scope.launch {
                        try {
                            val cId = selectedCourse?.id ?: return@launch
                            val m = repo.createModule(CourseModule(courseId = cId, title = title.trim(), description = desc, moduleOrder = modules.size + 1, status = "DRAFT"))
                            repo.logRevision("module", m.id ?: "", "CREATED")
                            showCreateModule = false
                            loadAll()
                            statusMsg = "Module added"
                        } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                    }
                }, enabled = title.isNotBlank()) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { showCreateModule = false }) { Text("Cancel") } }
        )
    }

    // ── CREATE LESSON DIALOG ──
    if (showCreateLesson) {
        var title by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateLesson = false },
            title = { Text("Add Lesson") },
            text = {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Lesson Title *") }, modifier = Modifier.fillMaxWidth())
            },
            confirmButton = {
                Button(onClick = {
                    if (title.isBlank()) return@Button
                    scope.launch {
                        try {
                            val existing = lessons[activeModuleId] ?: emptyList()
                            val l = repo.createLesson(ModuleSlide(moduleId = activeModuleId, title = title.trim(), slideOrder = existing.size + 1, isDraft = true, status = "DRAFT"))
                            repo.logRevision("lesson", l.id ?: "", "CREATED")
                            showCreateLesson = false
                            loadAll()
                            statusMsg = "Lesson added as Draft"
                        } catch (e: Exception) { statusMsg = "Error: ${e.localizedMessage}" }
                    }
                }, enabled = title.isNotBlank()) { Text("Add Draft") }
            },
            dismissButton = { TextButton(onClick = { showCreateLesson = false }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun StatChip(label: String, value: String) {
    Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.surface) {
        Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
