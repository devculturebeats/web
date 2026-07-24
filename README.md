# CultureBeats

Connect cultural arts teachers with schools, academies, and students.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Env is already set in `.env.local` for project `devculturebeats`.

## Demo accounts

All passwords: `Test1234!`

| Email | Role | What to try |
|-------|------|-------------|
| `admin@culturebeats.test` | Superadmin | `/admin` approve pending teacher2 |
| `teacher1@culturebeats.test` | Approved teacher | Requests, Classes (post home studio), Schedule, Attendance |
| `teacher2@culturebeats.test` | Pending teacher | Wait for admin approval |
| `school@culturebeats.test` | School admin | Batches, request/match teachers, sessions |
| `academy@culturebeats.test` | Academy admin | Marketplace classes, enrollments |
| `student@culturebeats.test` | Student | Linked orgs, enroll, sessions, attendance |
| `parent@culturebeats.test` | Parent | Linked to Meera Student — schedule + classes (read-only) |

Seeded sample data includes: Horizon Public School, Nritya Studio Academy, a pending dance class request for teacher1, a self-enroll folk dance lab, and an assigned school music class with the demo student enrolled.

## Google OAuth (optional)

1. Supabase → Authentication → Providers → Google
2. Redirect URL: `http://localhost:3000/auth/callback`
3. Site URL: `http://localhost:3000`

## Stack

- Next.js 16 App Router + `proxy.ts` session refresh
- Supabase Auth + Postgres RLS (no separate backend)
- Tailwind CSS v4 + shadcn/ui
- Literata + Manrope

## Main flows

1. **Teacher** onboards → manages weekly availability → posts **home studio** classes students can join (with rate) → accepts/rejects school requests → runs sessions, reschedules, attendance
2. **School** onboards org (must be approved) → batches → match/request/assign teachers → schedule/cancel sessions & classes → **Notify** enrolled students
3. **Academy** marketplace classes (with rates) + notify students
4. **Student** joins institutions **or** enrolls in open home-studio / academy classes → sessions, attendance, notification inbox
5. **Superadmin** approves teachers and organizations

## Home studio classes

Approved teachers can post independent classes (no school/academy required) from **My classes**:
- Title, skill, description, location (home studio / online / venue)
- Rate (₹ per hour, session, or course) and max capacity
- Recurring sessions; students discover them under **Open classes** and self-enroll
- Students can leave self-enrolled classes; enrollment is blocked when full

Academies can also set rate, capacity, description, and location on marketplace classes.

## Notifications

School/academy **Notify** tab can push to:
- everyone enrolled in any of their classes, or
- students enrolled in selected classes only

Students see them on `/student` and can mark as read.

## Class detail & scheduling

- Open any class at `/classes/[id]` for sessions, roster, attendance, and notes
- Recurring edits support **this session only** vs **this and following in the series**
- Deleting/changing teacher availability warns if it overlaps accepted/scheduled classes

## Audit log

- Superadmin: `/admin/audit`
- School/academy: **Activity** tab on their portal
- Tracks approvals, cancellations, enrollments, session create/reschedule/cancel

## Password reset

Use **Forgot password?** on login (`/forgot-password`). Configure Supabase email templates redirect to `http://localhost:3000/auth/callback?next=/auth/update-password`.
