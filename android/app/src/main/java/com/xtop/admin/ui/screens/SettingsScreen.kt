package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: NavController) {
    var url by remember { mutableStateOf(SupabaseClient.getSupabaseUrl()) }
    var key by remember { mutableStateOf(SupabaseClient.getSupabaseKey()) }
    var savedMessage by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Database Credentials") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            SupabaseClient.saveCredentials(url, key)
                            savedMessage = true
                        },
                        enabled = url.isNotBlank() && key.isNotBlank()
                    ) {
                        Icon(Icons.Default.Save, "Save")
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
                "Supabase Connection",
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                "If database requests fail, paste your Supabase Project URL and public anon key from Supabase Dashboard -> Settings -> API.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (savedMessage) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Text(
                        "Credentials saved successfully!",
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            OutlinedTextField(
                value = url,
                onValueChange = { url = it; savedMessage = false },
                label = { Text("Supabase Project URL") },
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = key,
                onValueChange = { key = it; savedMessage = false },
                label = { Text("Supabase Anon Key (eyJ...)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Button(
                onClick = {
                    SupabaseClient.saveCredentials(url, key)
                    savedMessage = true
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save Credentials")
            }
        }
    }
}
