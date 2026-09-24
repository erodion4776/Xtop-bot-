package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.models.AdminUser
import com.xtop.admin.data.repository.AdminRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminUsersScreen(navController: NavController) {
    val repo = remember { AdminRepository() }
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<AdminUser>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showAdd by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("VIEWER") }

    LaunchedEffect(Unit) { try { users = repo.getAdminUsers() } catch (_: Exception) {}; loading = false }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Admin Users") }, navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { Icon(Icons.Default.ArrowBack, "Back") } }) },
        floatingActionButton = { FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Default.PersonAdd, "Add") } }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            if (showAdd) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Add Admin User", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(value = username, onValueChange = { username = it }, label = { Text("Username") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = fullName, onValueChange = { fullName = it }, label = { Text("Full Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(value = role, onValueChange = { role = it.uppercase() }, label = { Text("Role (SUPER_ADMIN, COURSE_ADMIN, EXAM_ADMIN, STUDENT_ADMIN, VIEWER)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                scope.launch {
                                    try {
                                        repo.createAdminUser(AdminUser(username = username, fullName = fullName, role = role))
                                        users = repo.getAdminUsers()
                                        showAdd = false
                                    } catch (_: Exception) {}
                                }
                            }) { Text("Create") }
                            OutlinedButton(onClick = { showAdd = false }) { Text("Cancel") }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            if (loading) CircularProgressIndicator()
            else if (users.isEmpty()) Text("No admin users configured.", style = MaterialTheme.typography.bodyMedium)
            else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(users) { u ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.AdminPanelSettings, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(u.fullName ?: u.username, style = MaterialTheme.typography.titleSmall)
                                    Text("@${u.username}", style = MaterialTheme.typography.labelSmall)
                                }
                                AssistChip(onClick = {}, label = { Text(u.role) })
                            }
                        }
                    }
                }
            }
        }
    }
}
