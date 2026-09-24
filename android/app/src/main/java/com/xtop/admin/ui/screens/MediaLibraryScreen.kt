package com.xtop.admin.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.xtop.admin.data.models.CourseMaterial
import com.xtop.admin.data.remote.StorageService
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaLibraryScreen(navController: NavController) {
    val context = LocalContext.current
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var materials by remember { mutableStateOf<List<CourseMaterial>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var uploading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { try { materials = repo.getMaterials() } catch (_: Exception) {}; loading = false }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            scope.launch {
                try {
                    uploading = true
                    val url = StorageService.uploadImage(context, it)
                    val mat = repo.uploadMaterial(CourseMaterial(fileName = "upload_${System.currentTimeMillis()}", fileType = "image", fileUrl = url, uploadedBy = "admin"))
                    materials = listOf(mat) + materials
                    repo.logAction("admin", "MATERIAL_UPLOADED", "course_materials", mat.id)
                    Toast.makeText(context, "Uploaded!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) { Toast.makeText(context, "Failed: ${e.localizedMessage}", Toast.LENGTH_SHORT).show() }
                uploading = false
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Media Library") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) },
        floatingActionButton = { FloatingActionButton(onClick = { filePicker.launch("image/*") }, enabled = !uploading) { Icon(Icons.Default.CloudUpload, "Upload") } }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (uploading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            if (loading) CircularProgressIndicator()
            else if (materials.isEmpty()) Text("No media files uploaded yet.", style = MaterialTheme.typography.bodyMedium)
            else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(materials) { m ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                AsyncImage(model = m.fileUrl, contentDescription = m.fileName, modifier = Modifier.fillMaxWidth().height(150.dp), contentScale = ContentScale.Crop)
                                Spacer(Modifier.height(4.dp))
                                Text(m.fileName, style = MaterialTheme.typography.bodySmall)
                                Text(m.fileType.uppercase() + " • " + (m.createdAt?.take(10) ?: ""), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
