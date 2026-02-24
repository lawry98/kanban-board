-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read any profile, update only their own
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid()::text = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = id);

-- Board members: can see boards they belong to
CREATE POLICY "Members can view their board memberships" ON board_members FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
CREATE POLICY "Owners can manage board members" ON board_members FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = board_members.board_id AND bm.user_id = auth.uid()::text AND bm.role = 'OWNER')
);

-- Boards: visible to members
CREATE POLICY "Boards visible to members" ON boards FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = boards.id AND board_members.user_id = auth.uid()::text)
);
CREATE POLICY "Authenticated users can create boards" ON boards FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid()::text);
CREATE POLICY "Owners and editors can update boards" ON boards FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = boards.id AND board_members.user_id = auth.uid()::text AND board_members.role IN ('OWNER', 'EDITOR'))
);

-- Columns: same as board access
CREATE POLICY "Columns visible to board members" ON columns FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = columns.board_id AND board_members.user_id = auth.uid()::text)
);
CREATE POLICY "Editors and owners can manage columns" ON columns FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = columns.board_id AND board_members.user_id = auth.uid()::text AND board_members.role IN ('OWNER', 'EDITOR'))
);

-- Tasks: same as board access
CREATE POLICY "Tasks visible to board members" ON tasks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = tasks.board_id AND board_members.user_id = auth.uid()::text)
);
CREATE POLICY "Editors and owners can manage tasks" ON tasks FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = tasks.board_id AND board_members.user_id = auth.uid()::text AND board_members.role IN ('OWNER', 'EDITOR'))
);

-- Activity logs: readable by board members
CREATE POLICY "Activity logs visible to board members" ON activity_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM board_members WHERE board_members.board_id = activity_logs.board_id AND board_members.user_id = auth.uid()::text)
);
CREATE POLICY "Authenticated users can insert activity logs" ON activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()::text);

-- Enable realtime for tasks and columns
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE columns;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
