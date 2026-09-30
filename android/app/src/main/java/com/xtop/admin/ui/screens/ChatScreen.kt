package com.xtop.admin.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.MessageRecord
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    navController: NavController,
    repo: CommandCentreRepository,
    contactId: String
) {
    val scope = rememberCoroutineScope()
    var messages by remember { mutableStateOf<List<MessageRecord>>(emptyList()) }
    var inputText by remember { mutableStateOf("") }
    var isAgentMode by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(contactId) {
        scope.launch { messages = repo.getMessages(contactId) }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Chat", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(
                            if (isAgentMode) "👨🏽‍💼 Agent Mode — Bot Paused" else "🤖 Bot Active",
                            fontSize = 11.sp,
                            color = if (isAgentMode) Color(0xFFF59E0B) else Color(0xFF22C55E)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                actions = {
                    TextButton(onClick = {
                        scope.launch {
                            if (isAgentMode) {
                                repo.returnToBot(contactId)
                                isAgentMode = false
                            } else {
                                repo.takeOverConversation(contactId, "")
                                isAgentMode = true
                            }
                        }
                    }) {
                        Text(
                            if (isAgentMode) "Return to Bot" else "Take Over",
                            color = if (isAgentMode) Color(0xFF22C55E) else Color(0xFFF59E0B),
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A), titleContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(messages) { msg ->
                    val isInbound = msg.direction == "INBOUND"
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (isInbound) Arrangement.Start else Arrangement.End
                    ) {
                        Surface(
                            color = if (isInbound) Color(0xFF1E293B) else Color(0xFF1E40AF),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.widthIn(max = 280.dp)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(msg.displayText, color = Color.White, fontSize = 13.sp)
                                Text(
                                    "${if (isInbound) "👤 Client" else "🤖 Bot"} • ${msg.created_at.takeLast(8).take(5)}",
                                    color = Color(0xFF94A3B8), fontSize = 10.sp
                                )
                            }
                        }
                    }
                }
            }

            // Input Bar
            Surface(color = Color(0xFF1E293B)) {
                Row(
                    modifier = Modifier.padding(12.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Type message...", color = Color(0xFF64748B)) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(24.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF38BDF8),
                            unfocusedBorderColor = Color(0xFF334155),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = {
                            if (inputText.isNotBlank()) {
                                scope.launch {
                                    sending = true
                                    repo.sendWhatsAppMessage("", inputText)
                                    inputText = ""
                                    sending = false
                                }
                            }
                        },
                        enabled = !sending && inputText.isNotBlank(),
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = Color(0xFF38BDF8)
                        )
                    ) {
                        Icon(Icons.Default.Send, "Send", tint = Color(0xFF0F172A))
                    }
                }
            }
        }
    }
}
