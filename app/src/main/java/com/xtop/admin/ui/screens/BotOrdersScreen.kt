package com.xtop.admin.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
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

data class BotOrder(
    val id: String,
    val phone: String,
    val clientName: String,
    val businessName: String,
    val orderType: String,
    val description: String,
    val budget: String,
    val status: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BotOrdersScreen(navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<BotOrder>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    fun fetchOrders() {
        scope.launch {
            isLoading = true
            try {
                val url = URL("https://mldywarnnwjitfvqpgis.supabase.co/functions/v1/xtop-dashboard?action=orders")
                withContext(Dispatchers.IO) {
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    val response = conn.inputStream.bufferedReader().readText()
                    val json = JSONObject(response)
                    val data = json.optJSONArray("data") ?: JSONArray()
                    val list = mutableListOf<BotOrder>()
                    for (i in 0 until data.length()) {
                        val item = data.getJSONObject(i)
                        list.add(
                            BotOrder(
                                id = item.optString("id"),
                                phone = item.optString("phone_number"),
                                clientName = item.optString("client_name", "Client"),
                                businessName = item.optString("business_name", "N/A"),
                                orderType = item.optString("order_type", "BOT"),
                                description = item.optString("description", "No description"),
                                budget = item.optString("budget", "TBD"),
                                status = item.optString("status", "NEW")
                            )
                        )
                    }
                    orders = list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        fetchOrders()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bot Orders & Build Tickets", color = Color(0xFF38BDF8), fontWeight = FontWeight.Bold) },
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
            } else if (orders.isEmpty()) {
                Text(
                    "No bot build tickets created yet.",
                    color = Color(0xFF94A3B8),
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(orders) { order ->
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        order.businessName.ifEmpty { order.clientName },
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp
                                    )
                                    Surface(
                                        color = if (order.status == "NEW") Color(0xFF1E40AF) else Color(0xFF065F46),
                                        shape = RoundedCornerShape(16.dp)
                                    ) {
                                        Text(
                                            order.status,
                                            color = Color.White,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(4.dp))
                                Text("Type: ${order.orderType} • Budget: ${order.budget}", color = Color(0xFF38BDF8), fontSize = 13.sp)
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(order.description, color = Color(0xFFCBD5E1), fontSize = 13.sp)
                                Spacer(modifier = Modifier.height(12.dp))

                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    // 1. Direct Phone Call Button
                                    Button(
                                        onClick = {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${order.phone}"))
                                            context.startActivity(intent)
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.Call, contentDescription = "Call", modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Call Client")
                                    }

                                    // 2. Chat with Client via WhatsApp Bot
                                    Button(
                                        onClick = {
                                            navController.navigate("client_chat/${order.phone}")
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.Send, contentDescription = "Chat", modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Chat as Sabi")
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
