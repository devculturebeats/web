import type { AppRole } from "@/types/database";

export type { AppRole };

export function getDashboardPath(role: AppRole): string {
  switch (role) {
    case "teacher":
      return "/dashboard";
    case "student":
      return "/dashboard";
    case "parent":
      return "/parent";
    case "school_admin":
      return "/school";
    case "academy_admin":
      return "/academy";
    case "superadmin":
      return "/admin";
    default:
      return "/dashboard";
  }
}

export function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "teacher":
      return "Teacher";
    case "student":
      return "Student";
    case "parent":
      return "Parent";
    case "school_admin":
      return "School Admin";
    case "academy_admin":
      return "Academy Admin";
    case "superadmin":
      return "Super Admin";
    default:
      return role;
  }
}

export function getNavLinks(
  role: AppRole,
  options?: { orgApproved?: boolean; teacherApproved?: boolean },
): { href: string; label: string }[] {
  const orgApproved = options?.orgApproved !== false;
  const teacherApproved = options?.teacherApproved !== false;

  switch (role) {
    case "teacher":
      if (!teacherApproved) {
        return [
          { href: "/dashboard", label: "Home" },
          { href: "/teacher/profile", label: "Profile" },
        ];
      }
      return [
        { href: "/dashboard", label: "Home" },
        { href: "/teacher/requests", label: "Requests" },
        { href: "/teacher/classes", label: "Personal classes" },
        { href: "/teacher/schedule", label: "Availability" },
        { href: "/teacher/profile", label: "Profile" },
      ];
    case "superadmin":
      return [
        { href: "/admin", label: "Approvals" },
        { href: "/admin/requests", label: "School requests" },
        { href: "/admin/audit", label: "Audit" },
      ];
    case "school_admin":
      if (!orgApproved) return [];
      return [
        { href: "/school", label: "Request teacher" },
        { href: "/school/classes", label: "Scheduled classes" },
        { href: "/school/students", label: "Students" },
        { href: "/school/notify", label: "Notify" },
      ];
    case "academy_admin":
      if (!orgApproved) return [];
      return [{ href: "/academy", label: "Academy" }];
    case "student":
      return [
        { href: "/dashboard", label: "Home" },
        { href: "/student/courses", label: "My Courses" },
        { href: "/student/browse", label: "Browse classes" },
      ];
    case "parent":
      return [
        { href: "/parent", label: "Home" },
        { href: "/parent/courses", label: "Classes" },
      ];
    default:
      return [{ href: "/dashboard", label: "Home" }];
  }
}
