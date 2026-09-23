package com.xtop.admin.data.remote

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.xtop.admin.data.models.CourseQuestion
import java.io.File

object SqlExporter {

    fun generateSqlScript(
        courseCode: String,
        courseName: String,
        term: String = "First Semester",
        description: String = "",
        lessonNumber: Int = 1,
        lessonTitle: String,
        lessonContent: String,
        imageUrl: String? = null,
        questions: List<CourseQuestion>
    ): String {
        val cleanCode = courseCode.replace("'", "''")
        val cleanName = courseName.replace("'", "''")
        val cleanDesc = description.replace("'", "''")
        val cleanLessonTitle = lessonTitle.replace("'", "''")
        val cleanLessonContent = lessonContent.replace("'", "''")
        val cleanImg = imageUrl?.replace("'", "''") ?: ""

        val sb = StringBuilder()
        sb.appendLine("-- ==========================================================")
        sb.appendLine("-- XTOP BOT COURSE IMPORT SCRIPT: $courseCode")
        sb.appendLine("-- Generated on: ${java.util.Date()}")
        sb.appendLine("-- ==========================================================\n")

        sb.appendLine("DO $$")
        sb.appendLine("DECLARE")
        sb.appendLine("    v_course_id uuid;")
        sb.appendLine("    v_module_id uuid;")
        sb.appendLine("BEGIN")

        // 1. Course
        sb.appendLine("    -- 1. Insert or get Course")
        sb.appendLine("    SELECT id INTO v_course_id FROM public.courses WHERE course_code = '$cleanCode' LIMIT 1;")
        sb.appendLine("    IF v_course_id IS NULL THEN")
        sb.appendLine("        INSERT INTO public.courses (course_code, course_name, term, description, status, show_answers)")
        sb.appendLine("        VALUES ('$cleanCode', '$cleanName', '$term', '$cleanDesc', 'OPEN', true)")
        sb.appendLine("        RETURNING id INTO v_course_id;")
        sb.appendLine("    END IF;\n")

        // 2. Module
        sb.appendLine("    -- 2. Insert Course Module / Lesson")
        sb.appendLine("    INSERT INTO public.course_modules (course_id, title, description, module_order, status)")
        sb.appendLine("    VALUES (v_course_id, '$cleanLessonTitle', '$cleanDesc', $lessonNumber, 'ACTIVE')")
        sb.appendLine("    RETURNING id INTO v_module_id;\n")

        // 3. Module Slide
        sb.appendLine("    -- 3. Insert Slide Notes & Image")
        val imgValue = if (cleanImg.isNotBlank()) "'$cleanImg'" else "NULL"
        sb.appendLine("    INSERT INTO public.module_slides (module_id, title, content, image_url, slide_order, duration, status)")
        sb.appendLine("    VALUES (v_module_id, '$cleanLessonTitle', '$cleanLessonContent', $imgValue, 1, '15 mins', 'ACTIVE');\n")

        // 4. Questions
        if (questions.isNotEmpty()) {
            sb.appendLine("    -- 4. Insert CBT Questions")
            questions.forEachIndexed { i, q ->
                val qText = q.question.replace("'", "''")
                val opA = q.optionA.replace("'", "''")
                val opB = q.optionB.replace("'", "''")
                val opC = q.optionC.replace("'", "''")
                val opD = q.optionD.replace("'", "''")
                val exp = (q.explanation ?: "").replace("'", "''")
                val ans = q.correctAnswer.uppercase()

                sb.appendLine("    INSERT INTO public.course_questions (course_id, module_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation, questionOrder, status)")
                sb.appendLine("    VALUES (v_course_id, v_module_id, '$qText', '$opA', '$opB', '$opC', '$opD', '$ans', '$exp', ${i + 1}, 'ACTIVE');")
            }
        }

        sb.appendLine("\n    RAISE NOTICE 'Successfully imported $cleanCode - $cleanLessonTitle';")
        sb.appendLine("END $$;")

        return sb.toString()
    }

    fun shareSqlFile(context: Context, fileName: String, sqlContent: String) {
        val file = File(context.cacheDir, "$fileName.sql")
        file.writeText(sqlContent)

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "$fileName.sql")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share/Save SQL File"))
    }
}
