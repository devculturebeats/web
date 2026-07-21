export type JoinableOrg = {
  id: string;
  name: string;
  type: string;
  city: string | null;
};

export type LinkedInstitution = {
  id: string;
  orgName: string;
  orgType: string;
  batchName: string | null;
};

export type EnrolledClass = {
  id: string;
  title: string;
  skill: string | null;
  source: string;
  orgName: string | null;
  teacherName: string | null;
  status: string;
  isHomeStudio: boolean;
  canLeave: boolean;
  locationLabel: string | null;
  locationNote: string | null;
  nextMeetingAt: string | null;
  nextMeetingNote: string | null;
};

export type MarketplaceClass = {
  id: string;
  title: string;
  skill: string | null;
  description: string | null;
  orgName: string | null;
  orgType: string | null;
  teacherName: string | null;
  isHomeStudio: boolean;
  rateLabel: string | null;
  locationLabel: string | null;
  locationNote: string | null;
  spotsLeft: number | null;
  startsAt: string | null;
};

export type UpcomingSession = {
  id: string;
  classId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  classTitle: string;
  orgName: string | null;
};

export type AttendanceHistoryItem = {
  sessionId: string;
  startsAt: string;
  classTitle: string;
  present: boolean;
  source: string;
};

export type StudentNotification = {
  recipientId: string;
  title: string;
  body: string;
  orgName: string | null;
  createdAt: string;
  readAt: string | null;
};
