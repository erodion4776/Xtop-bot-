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
                NavHost(navController = navController, startDestination = "dashboard") {
                    composable("dashboard") {
                        DashboardScreen(navController)
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
                    composable("bot_activity") {
                        BotActivityScreen(navController)
                    }
                    composable("courses") {
                        CourseListScreen(navController)
                    }
                    composable("course_editor/{courseId}") { backStack ->
                        val courseId = backStack.arguments?.getString("courseId") ?: "new"
                        CourseEditorScreen(navController, courseId)
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
                    composable("students") {
                        StudentListScreen(navController)
                    }
                    composable("analytics") {
                        AnalyticsScreen(navController)
                    }
                    composable("settings") {
                        SettingsScreen(navController)
                    }
                }
            }
        }
    }
}
