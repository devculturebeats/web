export const PARENT_SELECTED_STUDENT_COOKIE = "cb_parent_student_id";

export type ParentActionState = {
  error?: string;
  success?: boolean;
};

export type LinkedChild = {
  linkId: string;
  studentProfileId: string;
  fullName: string;
  email: string;
  lookupCode: string | null;
};

export type ParentLinkInvite = {
  id: string;
  initiator: string;
  message: string | null;
  createdAt: string;
  counterpartName: string;
  counterpartEmail: string | null;
};
