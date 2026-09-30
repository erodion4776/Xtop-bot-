package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.xtop.admin.data.ClientProfile
import com.xtop.admin.data.ConversationRecord
import com.xtop.admin.data.MessageRecord
import com.xtop.admin.data.repository.CommandCentreRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    navController: NavController,
    repo: CommandCentreRepository,
    contactId: String
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var client by remember { mutableStateOf<ClientProfile?>(null) }
    var conversation by remember { mutableStateOf<ConversationRecord?>(null) }
    var messages by remember { mutableStateOf<List<MessageRecord>>(emptyList()) }
    var inputText by remember { mutableStateOf("") }
    var isAgentMode by remember { mutableStateOf(false) }
    var isSending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun loadData() {
        scope.launch {
            client = repo.getClientById(contactId)
            conversation = repo.getConversationByContact(contactId)
            val ctx = conversation?.context_json
            isAgentMode = ctx?.get("agent_takeover")?.toString()?.contains("true") == true ||
                          ctx?.get("agent_mode")?.toString()?.contains("true") == true
            messages = repo.getMessages(contactId, 100)
        }
    }

    LaunchedEffect(contactId) {
        loadData()
        // Live poll every 2.5 seconds
        while (true) {
            delay(2500)
            try {
                val updated = repo.getMessages(contactId, 100)
                if (updated.size != messages.size) {
                    messages = updated
                }
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    fun sendMessage() {
        val phone = client?.phone ?: ""
        if (phone.isBlank()) {
            Toast.makeText(context, "⚠️ No phone number found for this contact", Toast.LENGTH_SHORT).show()
            return
        }
        if (inputText.isBlank()) return

        val msg = inputText.trim()
        inputText = ""
        isSending = true

        scope.launch {
            val result = repo.sendWhatsAppMessage(phone, contactId, msg)
            if (result.first) {
                // Instantly refresh message list
                messages = repo.getMessages(contactId, 100)
            } else {
                Toast.makeText(context, "⚠️ ${result.second}", Toast.LENGTH_LONG).show()
            }
            isSending = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            client?.name ?: client?.business_name ?: client?.phone ?: "Client Chat",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                        Text(
                            if (isAgentMode) "👨🏽‍💼 Agent Mode Active (Bot Paused)" else "🤖 Sabi Auto-Responding",
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
                    if (!client?.phone.isNullOrBlank()) {
                        IconButton(onClick = {
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${client?.phone}"))
                            context.startActivity(intent)
                        }) {
                            Icon(Icons.Default.Phone, "Call", tint = Color(0xFF10B981))
                        }
                    }

                    TextButton(onClick = {
                        scope.launch {
                            val phone = client?.phone ?: ""
                            if (isAgentMode) {
                                val ok = repo.returnToBot(contactId, phone)
                                if (ok) {
                                    isAgentMode = false
                                    Toast.makeText(context, "🤖 Bot resumed for this client", Toast.LENGTH_SHORT).show()
                                }
                            } else {
                                val ok = repo.takeOverConversation(contactId, phone)
                                if (ok) {
                                    isAgentMode = true
                                    Toast.makeText(context, "👨🏽‍💼 You took over. Bot paused for this client.", Toast.LENGTH_SHORT).show()
                                }
                            }
                            loadData()
                        }
                    }) {
                        Text(
                            if (isAgentMode) "Return to Bot" else "Take Over",
                            color = if (isAgentMode) Color(0xFF22C55E) else Color(0xFFF59E0B),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Live Message Stream
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages) { msg ->
                    val isInbound = msg.direction == "INBOUND"
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (isInbound) Arrangement.Start else Arrangement.End
                    ) {
                        Surface(
                            color = if (isInbound) Color(0xFF1E293B) else Color(0xFF2563EB),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.widthIn(max = 290.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    msg.displayText,
                                    color = Color.White,
                                    fontSize = 14.sp,
                                    lineHeight = 18.sp
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "${if (isInbound) "👤 Client" else "🤖 Sabi"} • ${msg.created_at.takeLast(8).take(5)}",
                                    color = if (isInbound) Color(0xFF94A3B8) else Color(0xFFDBEAFE),
                                    fontSize = 10.sp
                                )
                            }
                        }
                    }
                }
            }

            // Input Bar
            Surface(
                color = Color(0xFF1E293B),
                tonalElevation = 4.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .padding(12.dp)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Reply to client as Sabi...", color = Color(0xFF64748B)) },
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

                    Spacer(modifier = Modifier.width(8.dp))

                    IconButton(
                        onClick = { sendMessage() },
                        enabled = !isSending && inputText.isNotBlank(),
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = Color(0xFF38BDF8),
                            contentColor = Color(0xFF0F172A)
                        )
                    ) {
                        if (isSending) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color(0xFF0F172A),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Send, contentDescription = "Send")
                        }
                    }
                }
            }
        }
    }
}
