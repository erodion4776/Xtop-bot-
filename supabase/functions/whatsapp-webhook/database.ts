// Add serial_number to the Student interface
export interface Student {
  id: string;
  phone: string;
  name: string | null;
  matric_number: string | null;
  department: string | null;
  level: string | null;
  email: string | null;
  serial_number: string | null; // Added
  created_at: string;
  updated_at: string | null;
}

// Update createStudentProfile to include serial_number
export async function createStudentProfile(
  phone: string, name: string, matricNumber: string,
  department: string, level: string, serialNumber: string
): Promise<Student | null> {
  const sb = getSupabaseClient();
  const names = name.trim().split(" ");
  const firstName = names[0] || "";
  const lastName = names.slice(1).join(" ") || "";

  const { data, error } = await sb.from("students").insert({
    phone,
    name: name.trim(),
    first_name: firstName,
    last_name: lastName,
    matric_number: matricNumber.trim().toUpperCase(),
    department: department.trim(),
    level: level.trim(),
    serial_number: serialNumber.trim(),
    status: "ACTIVE"
  }).select("*").single();
  
  if (error) { safeErrorLog("createStudentProfile", error); return null; }
  return data as Student;
}

// Update updateStudentProfile to include serial_number
export async function updateStudentProfile(
  studentId: string, fields: {
    name?: string; matric_number?: string;
    department?: string; level?: string;
    serial_number?: string;
  }
): Promise<Student | null> {
  const sb = getSupabaseClient();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (fields.name) {
    updatePayload.name = fields.name.trim();
    const names = fields.name.trim().split(" ");
    updatePayload.first_name = names[0] || "";
    updatePayload.last_name = names.slice(1).join(" ") || "";
  }
  if (fields.matric_number) updatePayload.matric_number = fields.matric_number.trim().toUpperCase();
  if (fields.department) updatePayload.department = fields.department.trim();
  if (fields.level) updatePayload.level = fields.level.trim();
  if (fields.serial_number) updatePayload.serial_number = fields.serial_number.trim();

  const { data, error } = await sb.from("students")
    .update(updatePayload).eq("id", studentId).select("*").single();
  if (error) { safeErrorLog("updateStudentProfile", error); return null; }
  return data as Student;
}
