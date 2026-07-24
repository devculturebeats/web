-- RLS policies call these SECURITY DEFINER helpers as the querying role,
-- so authenticated must be able to EXECUTE them (not call them from the client).
grant execute on function private.can_access_class_request(uuid) to authenticated;
grant execute on function private.class_request_is_open(uuid) to authenticated;
grant execute on function private.can_access_teacher_link_request(uuid) to authenticated;
grant execute on function private.teacher_link_request_is_open(uuid) to authenticated;
