export interface Course {
  id: string;
  course_code: string;
  course_name: string;
  term: string | null;
  description: string | null;
  status: "OPEN" | "BLOCKED";
  test_price: number;
  show_answers: boolean;
}

export interface CourseLesson {
  id: string;
  course_id: string;
  title: string;
  content: string;
  video_url: string | null;
  pdf_url: string | null;
  lesson_order: number;
  duration: string | null;
  status: string;
}

export interface Student {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
}

export interface StudentCourseAccess {
  id: string;
  student_id: string;
  course_id: string;
  status: "ACTIVE" | "SUSPENDED" | "COMPLETED";
  progress: {
    completed_lessons?: string[];
    last_lesson_order?: number;
  };
}

export interface ExamAttempt {
  id: string;
  student_id: string;
  course_id: string;
  score: number;
  total_questions: number;
  passed: boolean;
  answers_json: Array<{
    question_id: string;
    selected_option: string;
    correct_option: string;
    is_correct: boolean;
  }>;
  submitted_at: string;
}

// ═══════════════════════════════════════════════════════
// LEARNING CENTRE QUERIES
// ═══════════════════════════════════════════════════════

export async function getCourseByCode(
  courseCode: string
): Promise<Course | null> {
  const sb = getSupabaseClient();

  const normalizedCode = courseCode
    .toUpperCase()
    .replace(/[\s-]/g, "");

  const { data, error } = await sb
    .from("courses")
    .select("*")
    .eq("course_code", normalizedCode)
    .maybeSingle();

  if (error) {
    safeErrorLog("getCourseByCode", error);
    return null;
  }

  return data as Course | null;
}

export async function getOrCreateStudent(
  phone: string,
  name?: string | null
): Promise<Student> {
  const sb = getSupabaseClient();

  const { data: existing, error: fe } = await sb
    .from("students")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (fe) {
    safeErrorLog("getOrCreateStudent:fetch", fe);
    throw fe;
  }

  if (existing) {
    if (name && !existing.name) {
      await sb
        .from("students")
        .update({ name })
        .eq("id", existing.id);

      existing.name = name;
    }

    return existing as Student;
  }

  const { data: created, error: ce } = await sb
    .from("students")
    .insert({
      phone,
      name: name || null,
    })
    .select("*")
    .single();

  if (ce) {
    safeErrorLog("getOrCreateStudent:create", ce);
    throw ce;
  }

  return created as Student;
}

export async function getStudentCourseAccess(
  studentId: string,
  courseId: string
): Promise<StudentCourseAccess | null> {
  const sb = getSupabaseClient();

  const { data: existing, error } = await sb
    .from("student_courses")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    safeErrorLog("getStudentCourseAccess", error);
    return null;
  }

  if (existing) {
    return existing as StudentCourseAccess;
  }

  // Check that the course is actually open before auto-enrolling.
  const { data: course, error: courseError } = await sb
    .from("courses")
    .select("status")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) {
    safeErrorLog("getStudentCourseAccess:courseCheck", courseError);
    return null;
  }

  if (!course || course.status !== "OPEN") {
    return null;
  }

  const { data: created, error: ce } = await sb
    .from("student_courses")
    .insert({
      student_id: studentId,
      course_id: courseId,
      status: "ACTIVE",
      progress: {
        completed_lessons: [],
        last_lesson_order: 0,
      },
    })
    .select("*")
    .single();

  if (ce) {
    safeErrorLog("autoEnrollStudent", ce);
    return null;
  }

  return created as StudentCourseAccess;
}

export async function getCourseLessons(
  courseId: string
): Promise<CourseLesson[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("course_lessons")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "ACTIVE")
    .order("lesson_order", { ascending: true });

  if (error) {
    safeErrorLog("getCourseLessons", error);
    return [];
  }

  return (data || []) as CourseLesson[];
}

export async function markLessonComplete(
  studentCourseId: string,
  lessonId: string,
  lessonOrder: number,
  existingProgress?: {
    completed_lessons?: string[];
    last_lesson_order?: number;
  }
): Promise<void> {
  const sb = getSupabaseClient();

  const completed = new Set(
    existingProgress?.completed_lessons || []
  );

  completed.add(lessonId);

  const updatedProgress = {
    completed_lessons: Array.from(completed),
    last_lesson_order: lessonOrder,
  };

  const { error } = await sb
    .from("student_courses")
    .update({
      progress: updatedProgress,
    })
    .eq("id", studentCourseId);

  if (error) {
    safeErrorLog("markLessonComplete", error);
  }
}

export async function getStudentExamAttempts(
  studentId: string,
  courseId: string
): Promise<ExamAttempt[]> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from("exam_attempts")
    .select("*")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .order("submitted_at", {
      ascending: false,
    });

  if (error) {
    safeErrorLog("getStudentExamAttempts", error);
    return [];
  }

  return (data || []) as ExamAttempt[];
}
