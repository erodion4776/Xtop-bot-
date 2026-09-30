package com.xtop.admin.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.ActivityEvent
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveActivityScreen(navController: NavController, repo: CommandCentreRepository) {
    val scope = rememberCoroutineScope()
    var events by remember { mutableStateOf<List<ActivityEvent>>(emptyList()) }

    LaunchedEffect(Unit) {
        while (true) {
            events = repo.getRecentActivity(50L)
            delay(5000) // Refresh every 5 seconds
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Color(0xFFEF4444), CircleShape)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("LIVE ACTIVITY", fontWeight = FontWeight.Bold, color = Color(0xFFEF4444))
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A), titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            items(events) { event ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                event.contact_name ?: event.phone_number,
                                color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp
                            )
                            Text(
                                event.message_body?.take(60) ?: event.module ?: "Activity",
                                color = Color(0xFF94A3B8), fontSize = 11.sp
                            )
                        }
                        Text(
                            event.created_at.takeLast(8).take(5),
                            color = Color(0xFF64748B), fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }
}
