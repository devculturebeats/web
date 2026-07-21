import type { AppRole } from "@/types/database";

export type { AppRole };

export function getDashboardPath(role: AppRole): string {
  switch (role) {
    case "teacher":
      return "/dashboard";
    case "student":
      return "/dashboard";
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

export function getNavLinks(role: AppRole): { href: string; label: string }[] {
  switch (role) {
    case "teacher":
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
        { href: "/admin/audit", label: "Audit" },
      ];
    case "school_admin":
      return [
        { href: "/school", label: "Request teacher" },
        { href: "/school/classes", label: "Scheduled classes" },
        { href: "/school/students", label: "Students" },
        { href: "/school/notify", label: "Notify" },
      ];
    case "academy_admin":
      return [{ href: "/academy", label: "Academy" }];
    case "student":
      return [
        { href: "/dashboard", label: "Home" },
        { href: "/student/courses", label: "My Courses" },
        { href: "/student/browse", label: "Browse classes" },
      ];
    default:
      return [{ href: "/dashboard", label: "Home" }];
  }
}
