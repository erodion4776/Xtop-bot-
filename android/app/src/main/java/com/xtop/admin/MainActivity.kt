package com.xtop.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.xtop.admin.data.SupabaseClient
import com.xtop.admin.ui.screens.*
import com.xtop.admin.ui.theme.XtopAdminTheme
import java.io.File
import java.util.Date

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ═══════════════════════════════════════════════════════
        // GLOBAL UNCAUGHT EXCEPTION HANDLER
        // Captures any unhandled crash and persists the full stack
        // trace to crash_log.txt so it can be viewed on device.
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

        // Initialize SharedPreferences credentials store for Supabase
        SupabaseClient.init(applicationContext)

        setContent {
            XtopAdminTheme {
                val navController = rememberNavController()
                NavHost(navController = navController, startDestination = "dashboard") {

                    // 1. DASHBOARD & CORE
                    composable("dashboard") {
                        DashboardScreen(navController)
                    }

                    // 2. COURSE GENERATION & CONTENT CREATION
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

                    // 3. COURSES & LESSON MANAGEMENT
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

                    // 4. QUESTIONS & CBT EXAM CONFIGURATION
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

                    // 5. ACADEMIC RECORDS & MANAGEMENT
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

                    // 6. LOGS, ANALYTICS & ADMIN CONTROLS
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
                }
            }
        }
    }
}
