export const STUDENT_LOGIN_EMAIL_DOMAIN = "students.culturebeats.app";

export function isSyntheticStudentEmail(email: string | null | undefined) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${STUDENT_LOGIN_EMAIL_DOMAIN}`);
}

/** What schools/students should see — never the synthetic domain email. */
export function formatStudentContactLine(student: {
  email?: string | null;
  username?: string | null;
}) {
  if (student.username) return `Username: ${student.username}`;
  if (student.email && !isSyntheticStudentEmail(student.email)) {
    return student.email;
  }
  return "No login yet";
}
