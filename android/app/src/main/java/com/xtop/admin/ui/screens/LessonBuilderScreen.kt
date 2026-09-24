package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.models.*
import com.xtop.admin.data.remote.StorageService
import com.xtop.admin.data.repository.CourseEditorRepository
import io.github.jan.supabase.postgrest.from
import com.xtop.admin.data.SupabaseClient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonBuilderScreen(navController: NavController, lessonId: String) {
    val context = LocalContext.current
    val repo = remember { CourseEditorRepository() }
    val scope = rememberCoroutineScope()

    var lesson by remember { mutableStateOf<ModuleSlide?>(null) }
    var sections by remember { mutableStateOf<List<LessonSection>>(emptyList()) }
    var media by remember { mutableStateOf<List<LessonMedia>>(emptyList()) }
    var materials by remember { mutableStateOf<List<LessonMaterial>>(emptyList()) }
    var practiceQs by remember { mutableStateOf<List<LessonPracticeQuestion>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    // Editable fields
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var objectives by remember { mutableStateOf("") }
    var duration by remember { mutableStateOf("15") }

    // Dialogs
    var showAddSection by remember { mutableStateOf(false) }
    var showAddQuestion by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            scope.launch {
                try {
                    val url = StorageService.uploadImage(context, it)
                    val m = repo.saveMedia(LessonMedia(lessonId = lessonId, fileUrl = url, caption = "Diagram", mediaType = "image", orderIndex = media.size + 1))
                    media = media + m
                    repo.logRevision("lesson", lessonId, "IMAGE_UPLOADED")
                } catch (e: Exception) { Toast.makeText(context, "Upload failed", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            scope.launch {
                try {
                    val url = StorageService.uploadImage(context, it)
                    val m = repo.saveMaterial(LessonMaterial(lessonId = lessonId, title = "Material ${materials.size + 1}", fileUrl = url, fileType = "pdf", orderIndex = materials.size + 1))
                    materials = materials + m
                    repo.logRevision("lesson", lessonId, "MATERIAL_UPLOADED")
                } catch (e: Exception) { Toast.makeText(context, "Upload failed", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    fun loadLesson() {
        scope.launch {
            try {
                val slides = SupabaseClient.postgrest.from("module_slides").select { filter { eq("id", lessonId) } }.decodeList<ModuleSlide>()
                val l = slides.firstOrNull() ?: return@launch
                lesson = l
                title = l.title
                content = l.content ?: ""
                objectives = l.objectives ?: ""
                duration = l.duration?.filter { it.isDigit() } ?: "15"
                sections = repo.getSections(lessonId)
                media = repo.getMedia(lessonId)
                materials = repo.getMaterials(lessonId)
                practiceQs = repo.getPracticeQuestions(lessonId)
            } catch (_: Exception) {}
            loading = false
        }
    }

    LaunchedEffect(Unit) { loadLesson() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Lesson Builder") },
                navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } },
                actions = {
                    if (lesson != null) {
                        val isPublished = !(lesson?.isDraft ?: true)
                        IconButton(onClick = {
                            scope.launch {
                                val newDraft = !isPublished
                                repo.updateLesson(lessonId, mapOf("is_draft" to newDraft.toString(), "status" to if (newDraft) "DRAFT" else "ACTIVE"))
                                repo.logRevision("lesson", lessonId, if (newDraft) "UNPUBLISHED" else "PUBLISHED")
                                loadLesson()
                                statusMsg = if (newDraft) "Lesson set to Draft" else "Lesson Published!"
                            }
                        }) {
                            Icon(if (isPublished) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Toggle Publish")
                        }
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Status banner
                item {
                    val isDraft = lesson?.isDraft ?: true
                    Card(colors = CardDefaults.cardColors(containerColor = if (isDraft) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (isDraft) Icons.Default.Edit else Icons.Default.CheckCircle, null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (isDraft) "DRAFT — Students cannot see this lesson" else "PUBLISHED — Visible to students via WhatsApp", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                statusMsg?.let { msg ->
                    item { Text(msg, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
                }

                // Basic Info
                item {
                    Text("Lesson Information", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                }
                item {
                    OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Lesson Title *") }, modifier = Modifier.fillMaxWidth())
                }
                item {
                    OutlinedTextField(value = objectives, onValueChange = { objectives = it }, label = { Text("Learning Objectives (one per line)") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                }
                item {
                    OutlinedTextField(value = duration, onValueChange = { duration = it.filter { c -> c.isDigit() } }, label = { Text("Duration (minutes)") }, modifier = Modifier.fillMaxWidth(0.4f), singleLine = true)
                }

                // Lesson Content
                item {
                    Text("Lesson Content", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("Write the full lecture notes. Use *bold*, _italic_, and line breaks for WhatsApp formatting.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item {
                    OutlinedTextField(value = content, onValueChange = { content = it }, label = { Text("Lecture Notes") }, modifier = Modifier.fillMaxWidth().height(250.dp), singleLine = false)
                }

                // Save Button
                item {
                    Button(
                        onClick = {
                            scope.launch {
                                saving = true
                                try {
                                    repo.updateLesson(lessonId, mapOf(
                                        "title" to title,
                                        "content" to content,
                                        "objectives" to objectives,
                                        "duration" to "$duration mins"
                                    ))
                                    repo.logRevision("lesson", lessonId, "CONTENT_UPDATED")
                                    statusMsg = "Saved successfully"
                                } catch (e: Exception) { statusMsg = "Save error: ${e.localizedMessage}" }
                                saving = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !saving && title.isNotBlank()
                    ) {
                        if (saving) CircularProgressIndicator(Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary)
                        else { Icon(Icons.Default.Save, null); Spacer(Modifier.width(6.dp)); Text("Save Lesson") }
                    }
                }

                item { HorizontalDivider(Modifier.padding(vertical = 4.dp)) }

                // Sections
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Lesson Sections (${sections.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { showAddSection = true }) { Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Text("Add") }
                    }
                }
                itemsIndexed(sections) { idx, sec ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top) {
                            Text("${idx + 1}.", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(24.dp))
                            Column(Modifier.weight(1f)) {
                                Text(sec.title, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                sec.content?.let { Text(it.take(80) + if (it.length > 80) "…" else "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            IconButton(onClick = { scope.launch { sec.id?.let { repo.deleteSection(it) }; loadLesson() } }) { Icon(Icons.Default.Delete, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error) }
                        }
                    }
                }

                item { HorizontalDivider(Modifier.padding(vertical = 4.dp)) }

                // Images
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Images & Diagrams (${media.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { imagePicker.launch("image/*") }) { Icon(Icons.Default.Image, null, Modifier.size(18.dp)); Text("Upload") }
                    }
                }
                items(media) { m ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            AsyncImage(model = m.fileUrl, contentDescription = m.caption, modifier = Modifier.fillMaxWidth().height(120.dp), contentScale = ContentScale.Crop)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(m.caption ?: "Image", style = MaterialTheme.typography.labelSmall)
                                IconButton(onClick = { scope.launch { m.id?.let { repo.deleteMedia(it) }; loadLesson() } }) { Icon(Icons.Default.Delete, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }

                item { HorizontalDivider(Modifier.padding(vertical = 4.dp)) }

                // Materials
                item {
                    
