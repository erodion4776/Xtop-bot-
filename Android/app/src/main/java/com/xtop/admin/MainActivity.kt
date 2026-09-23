package com.xtop.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.xtop.admin.ui.screens.*
import com.xtop.admin.ui.theme.XtopAdminTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            XtopAdminTheme {
                val navController = rememberNavController()
                NavHost(navController = navController, startDestination = "dashboard") {
                    composable("dashboard") { DashboardScreen(navController) }
                    composable("courses") { CourseListScreen(navController) }
                    composable("course_detail/{courseId}") { backStack ->
                        CourseDetailScreen(navController, backStack.arguments?.getString("courseId") ?: "")
                    }
                    composable("questions/{courseId}") { backStack ->
                        QuestionBankScreen(navController, backStack.arguments?.getString("courseId") ?: "")
                    }
                    composable("question_editor/{courseId}") { backStack ->
                        QuestionEditorScreen(navController, backStack.arguments?.getString("courseId") ?: "")
                    }
                    composable("exam_config/{courseId}") { backStack ->
                        ExamConfigScreen(navController, backStack.arguments?.getString("courseId") ?: "")
                    }
                    composable("students") { StudentListScreen(navController) }
                    composable("analytics") { AnalyticsScreen(navController) }
                }
            }
        }
    }
}
