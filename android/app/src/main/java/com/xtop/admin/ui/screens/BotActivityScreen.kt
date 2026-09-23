package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoggedMessage(
    val id: String = "",
    val direction: String = "INBOUND",
    @SerialName("message_text") val messageText: String? = null,
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("created_at") val createdAt: String? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BotActivityScreen(navController: NavController) {
    val scope = rememberCoroutineScope()
    var messages by remember { mutableStateOf<List<LoggedMessage>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    fun refreshLogs() {
        scope.launch {
            try {
                loading = true
                errorMsg = null
                messages = SupabaseClient.postgrest.from("messages")
                    .select {
                        order("created_at", Order.DESCENDING)
                        limit(40)
                    }
                    .decodeList<LoggedMessage>()
            } catch (e: Exception) {
                errorMsg = e.localizedMessage
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshLogs()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Live Bot Activity") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { refreshLogs() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                errorMsg != null -> {
                    Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(errorMsg ?: "", color = MaterialTheme.colorScheme.error)
                        Button(onClick = { refreshLogs() }) { Text("Retry") }
                    }
                }
                messages.isEmpty() -> Text("No recent messages logged.", Modifier.align(Alignment.Center))
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(messages) { msg ->
                            val isInbound = msg.direction == "INBOUND"
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isInbound) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primaryContainer
                                )
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = if (isInbound) "👤 USER / STUDENT" else "🤖 SABI BOT",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (isInbound) MaterialTheme.colorScheme.primary else Color(0xFF2E7D32)
                                        )
                                        Text(
                                            text = msg.createdAt?.take(16)?.replace("T", " ") ?: "",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = msg.messageText ?: "(Non-text selection)",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
