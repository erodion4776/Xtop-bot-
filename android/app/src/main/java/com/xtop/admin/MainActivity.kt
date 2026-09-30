package com.xtop.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.data.repository.CommandCentreRepository
import com.xtop.admin.ui.screens.*
import com.xtop.admin.ui.theme.XtopAdminTheme
import java.io.File
import java.util.Date

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ═══════════════════════════════════════════════════════
        // GLOBAL UNCAUGHT EXCEPTION HANDLER
        // ═══════════════════════════════════════════════════════
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val crashLogFile = File(applicationContext.getExternalFilesDir(null), "crash_log.txt")
                crashLogFile.writeText(
                    "Timestamp: ${Date()}\n" +
                    "Thread: ${thread.name} (id: ${thread.id})\n" +
                    "Exception: ${throwable.javaClass.name}\n" +
                    "Message: ${throwable.message}\n\n" +
                    "=== FULL STACK TRACE ===\n" +
                    throwable.stackTraceToString()
                )
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }

        SupabaseClient.init(applicationContext)

        setContent {
            XtopAdminTheme {
                val navController = rememberNavController()
                val repo = remember { CommandCentreRepository(SupabaseClient.client) }

                NavHost(navController = navController, startDestination = "dashboard") {

                    // ══════════════════════════════════════════
                    // EXISTING ROUTES (DO NOT MODIFY)
                    // ══════════════════════════════════════════

                    composable("dashboard") {
                        DashboardScreen(navController)
                    }

                    composable("retail_dashboard") {
                        RetailDashboardScreen(navController)
                    }

                    composable("ai_generator") {
                        CourseAiGeneratorScreen(navController)
                    }
                    composable("manual_course_editor") {
                        ManualCourseEditorScreen(navController)
                    }
                    composable("csv_import") {
                        CsvImportScreen(navController)
                    }
                    composable("media_library") {
                        MediaLibraryScreen(navController)
                    }

                    composable("courses") {
                        CourseListScreen(navController)
                    }
                    composable("course_editor") {
                        CourseEditorScreen(navController)
                    }
                    composable("course_editor/{courseId}") {
                        CourseEditorScreen(navController)
                    }
                    composable("course_detail/{courseId}") { backStack ->
                        val courseId = backStack.arguments?.getString("courseId") ?: ""
                        CourseDetailScreen(navController, courseId)
                    }

                    composable("questions/{courseId}") { backStack ->
                        val courseId = backStack.arguments?.getString("courseId") ?: ""
                        QuestionBankScreen(navController, courseId)
                    }
                    composable("question_editor/{courseId}") { backStack ->
                        val courseId = backStack.arguments?.getString("courseId") ?: ""
                        QuestionEditorScreen(navController, courseId)
                    }
                    composable("exam_config/{courseId}") { backStack ->
                        val courseId = backStack.arguments?.getString("courseId") ?: ""
                        ExamConfigScreen(navController, courseId)
                    }
                    composable("exams") {
                        ExamsScreen(navController)
                    }

                    composable("students") {
                        StudentListScreen(navController)
                    }
                    composable("attendance") {
                        AttendanceScreen(navController)
                    }
                    composable("course_access") {
                        CourseAccessScreen(navController)
                    }
                    composable("results") {
                        ResultsScreen(navController)
                    }

                    composable("bot_activity") {
                        BotActivityScreen(navController)
                    }
                    composable("analytics") {
                        AnalyticsScreen(navController)
                    }
                    composable("admin_users") {
                        AdminUsersScreen(navController)
                    }
                    composable("audit_logs") {
                        AuditLogScreen(navController)
                    }
                    composable("settings") {
                        SettingsScreen(navController)
                    }

                    // ══════════════════════════════════════════
                    // COMMAND CENTRE ROUTES
                    // ══════════════════════════════════════════

                    composable("command_dashboard") {
                        CommandDashboardScreen(navController, repo)
                    }

                    composable("inbox") {
                        InboxScreen(navController, repo)
                    }

                    composable("chat/{contactId}") { backStack ->
                        val contactId = backStack.arguments?.getString("contactId") ?: ""
                        ChatScreen(navController, repo, contactId)
                    }

                    composable("leads") {
                        LeadsScreen(navController, repo)
                    }

                    composable("tickets") {
                        TicketsScreen(navController, repo)
                    }

                    composable("clients") {
                        ClientsScreen(navController, repo)
                    }

                    composable("client_profile/{contactId}") { backStack ->
                        val contactId = backStack.arguments?.getString("contactId") ?: ""
                        ClientProfileScreen(navController, repo, contactId)
                    }

                    composable("live_activity") {
                        LiveActivityScreen(navController, repo)
                    }

                    composable("notifications") {
                        NotificationsScreen(navController, repo)
                    }
                }
            }
        }
    }
}
