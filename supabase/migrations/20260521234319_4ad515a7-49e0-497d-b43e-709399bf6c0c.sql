INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES ('a7132328-a310-4f7f-935d-22b37ea51909', '3b432a5c-7ea5-44aa-9533-f861600d6e4d', 'owner')
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';