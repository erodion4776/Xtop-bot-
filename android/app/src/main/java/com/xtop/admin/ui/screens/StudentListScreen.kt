package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.Student
import com.xtop.admin.data.repository.StudentRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentListScreen(navController: NavController) {
    val repo = remember { StudentRepository() }
    var students by remember { mutableStateOf<List<Student>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            students = repo.getStudents()
        } finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Registered Students (${students.size})") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(students) { s ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(s.name ?: "Unknown Name", style = MaterialTheme.typography.titleMedium)
                            Text("Matric: ${s.matricNumber ?: "N/A"}", style = MaterialTheme.typography.bodySmall)
                            Text("Dept: ${s.department ?: "N/A"} • Level: ${s.level ?: "N/A"}", style = MaterialTheme.typography.bodySmall)
                            Text("Phone: ${s.phone}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}
