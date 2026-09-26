package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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

data class PhoneContact(
    val phone: String,
    val name: String,
    val totalMessages: Int,
    val lastSeen: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneLogScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var contacts by remember { mutableStateOf<List<PhoneContact>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        scope.launch {
            try {
                val url = URL("https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard?action=phones")
                withContext(Dispatchers.IO) {
                    val conn = url.openConnection() as HttpURLConnection
                    val response = conn.inputStream.bufferedReader().readText()
                    val data = JSONObject(response).optJSONArray("data") ?: JSONArray()
                    val list = mutableListOf<PhoneContact>()
                    for (i in 0 until data.length()) {
                        val item = data.getJSONObject(i)
                        list.add(
                            PhoneContact(
                                phone = item.optString("phone_number"),
                                name = item.optString("contact_name", "WhatsApp User"),
                                totalMessages = item.optInt("total_messages", 1),
                                lastSeen = item.optString("last_seen", "")
                            )
                        )
                    }
                    contacts = list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Phone Directory & Logs", color = Color(0xFF38BDF8), fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF1E293B))
            )
        },
        containerColor = Color(0xFF0F172A)
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Color(0xFF38BDF8))
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(contacts) { item ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text("📱 ${item.phone}", color = Color(0xFF94A3B8), fontSize = 13.sp)
                                    Text("${item.totalMessages} interactions logged", color = Color(0xFF64748B), fontSize = 11.sp)
                                }

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    IconButton(
                                        onClick = {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${item.phone}"))
                                            context.startActivity(intent)
                                        },
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        Icon(Icons.Default.Call, contentDescription = "Call", tint = Color(0xFF10B981))
                                    }

                                    IconButton(
                                        onClick = { navController.navigate("client_chat/${item.phone}") },
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        Icon(Icons.Default.Send, contentDescription = "Chat", tint = Color(0xFF38BDF8))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
