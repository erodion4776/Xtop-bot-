package com.xtop.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
                    composable("dashboard") { 
                        DashboardScreen(navController) 
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
                }
            }
        }
    }
}
