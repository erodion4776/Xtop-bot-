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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Send
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class MessageLog(
    val body: String,
    val direction: String,
    val createdAt: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientChatScreen(navController: NavController, phone: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var messages by remember { mutableStateOf<List<MessageLog>>(emptyList()) }
    var inputText by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun loadMessages() {
        scope.launch {
            try {
                val url = URL("https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard?action=chat&phone=${Uri.encode(phone)}")
                withContext(Dispatchers.IO) {
                    val conn = url.openConnection() as HttpURLConnection
                    val response = conn.inputStream.bufferedReader().readText()
                    val data = JSONObject(response).optJSONArray("data") ?: JSONArray()
                    val list = mutableListOf<MessageLog>()
                    for (i in 0 until data.length()) {
                        val m = data.getJSONObject(i)
                        list.add(
                            MessageLog(
                                body = m.optString("message_body"),
                                direction = m.optString("direction", "ADMIN_TO_CLIENT"),
                                createdAt = m.optString("created_at")
                            )
                        )
                    }
                    messages = list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    LaunchedEffect(Unit) {
        loadMessages()
    }

    fun sendMessage() {
        if (inputText.isBlank()) return
        val msg = inputText.trim()
        inputText = ""
        isSending = true

        scope.launch {
            try {
                val url = URL("https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard?action=send-message")
                withContext(Dispatchers.IO) {
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.doOutput = true
                    val payload = JSONObject().apply {
                        put("phone", phone)
                        put("message", msg)
                    }
                    conn.outputStream.write(payload.toString().toByteArray())
                    conn.inputStream.bufferedReader().readText()
                }
                loadMessages()
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to deliver message", Toast.LENGTH_SHORT).show()
            } finally {
                isSending = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(phone, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text("Chat as Sabi WhatsApp Assistant", color = Color(0xFF10B981), fontSize = 11.sp)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    // Click to Call from within the chat window
                    IconButton(onClick = {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                        context.startActivity(intent)
                    }) {
                        Icon(Icons.Default.Call, contentDescription = "Call Client", tint = Color(0xFF10B981))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF1E293B))
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Chat Stream
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages) { msg ->
                    val isAdmin = msg.direction == "ADMIN_TO_CLIENT"
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = if (isAdmin) Arrangement.End else Arrangement.Start
                    ) {
                        Surface(
                            color = if (isAdmin) Color(0xFF2563EB) else Color(0xFF334155),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                msg.body,
                                color = Color.White,
                                fontSize = 14.sp,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                    }
                }
            }

            // Input Bar
            Surface(
                color = Color(0xFF1E293B),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .padding(12.dp)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Reply to client as Sabi...", color = Color(0xFF94A3B8)) },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFF0F172A),
                            unfocusedContainerColor = Color(0xFF0F172A),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = Color(0xFF38BDF8),
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(24.dp),
                        modifier = Modifier.weight(1f)
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    IconButton(
                        onClick = { sendMessage() },
                        enabled = !isSending && inputText.isNotBlank(),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFF38BDF8))
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Send", tint = Color(0xFF0F172A))
                    }
                }
            }
        }
    }
}
