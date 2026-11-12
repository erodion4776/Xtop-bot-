package com.xtop.admin.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.xtop.admin.data.SupabaseClient
import io.github.jan.supabase.gotrue.gotrue
import io.github.jan.supabase.gotrue.providers.builtin.Email
import io.github.jan.supabase.gotrue.user.SessionStatus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

@Composable
fun AdminLoginScreen(navController: NavController) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("eroeliza1234@gmail.com") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }

    suspend fun verifyAdminAndContinue() {
        val session = SupabaseClient.client.gotrue.currentSessionOrNull()
        val userId = session?.user?.id
        if (userId.isNullOrBlank()) {
            message = "Please sign in again."
            return
        }
        val memberships = SupabaseClient.postgrest.from("admin_memberships").select {
            filter { eq("user_id", userId) }
        }.decodeList<JsonObject>()
        if (memberships.isEmpty()) {
            SupabaseClient.client.gotrue.logout()
            message = "This account is not authorised as an XTOP administrator."
            return
        }
        navController.navigate("dashboard") {
            popUpTo("login") { inclusive = true }
            launchSingleTop = true
        }
    }

    LaunchedEffect(Unit) {
        SupabaseClient.client.gotrue.sessionStatus.collect { status ->
            if (status is SessionStatus.Authenticated) {
                runCatching { verifyAdminAndContinue() }
                    .onFailure { message = "Could not verify administrator access. Check your connection and try again." }
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("XTOP ADMIN", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text("Secure administrator sign in", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Admin email") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(18.dp))
            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) {
                        message = "Enter your email and password."
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        message = ""
                        try {
                            SupabaseClient.client.gotrue.loginWith(Email) {
                                this.email = email.trim()
                                this.password = password
                            }
                            password = ""
                        } catch (e: Exception) {
                            message = "Sign-in failed. Check your email, password and internet connection."
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (busy) CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp
                ) else Text("Sign in")
            }
            if (message.isNotBlank()) {
                Spacer(Modifier.height(14.dp))
                Text(message, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(18.dp))
            Text(
                "Access is limited to accounts explicitly authorised in Supabase.",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
