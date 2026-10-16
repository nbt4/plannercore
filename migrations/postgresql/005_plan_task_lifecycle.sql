-- Retain plan/task history and version every writer, including child workflows.
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS planner_mutation_receipts (
 id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL,operation TEXT NOT NULL,
 key_hash TEXT NOT NULL,request_hash TEXT NOT NULL,plan_id UUID,
 response JSONB,status_code INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id,operation,key_hash)
);
CREATE TABLE IF NOT EXISTS planner_mutation_events (
 id BIGSERIAL PRIMARY KEY,plan_id UUID NOT NULL,entity_type TEXT NOT NULL,
 entity_id UUID NOT NULL,user_id TEXT,origin TEXT NOT NULL,operation TEXT NOT NULL,
 before_values JSONB,after_values JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planner_mutation_events_entity ON planner_mutation_events(plan_id,entity_type,entity_id,id DESC);
CREATE OR REPLACE FUNCTION guard_planner_plan_lifecycle() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive plans to retain history' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Plan identity is immutable' USING ERRCODE='23514';END IF;
  IF (OLD.archived_at IS NOT NULL OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) AND
   (to_jsonb(NEW)-'updated_at'-'archived_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'archived_at') THEN
   RAISE EXCEPTION 'Restore plan before changing fields; lifecycle retains metadata' USING ERRCODE='23514';END IF;
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'Archive timestamp retained' USING ERRCODE='23514';END IF;
  NEW.updated_at:=GREATEST(clock_timestamp(),OLD.updated_at+INTERVAL '1 microsecond');
 ELSE NEW.updated_at:=clock_timestamp();END IF;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS planner_plans_guard_lifecycle ON planner_plans;
CREATE TRIGGER planner_plans_guard_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON planner_plans FOR EACH ROW EXECUTE FUNCTION guard_planner_plan_lifecycle();
CREATE OR REPLACE FUNCTION guard_planner_task_lifecycle() RETURNS TRIGGER AS $$
DECLARE parent_archived TIMESTAMPTZ;bucket_plan UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive tasks to retain history' USING ERRCODE='23514';END IF;
 SELECT archived_at INTO parent_archived FROM planner_plans WHERE id=NEW.plan_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR parent_archived IS NOT NULL THEN
  -- Pure version touches on retained children may follow membership revocation.
  IF NOT (TG_OP='UPDATE' AND (to_jsonb(NEW)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'updated_at')) THEN
   RAISE EXCEPTION 'Restore plan before editing tasks' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Task identity and plan are immutable' USING ERRCODE='23514';END IF;
  IF (OLD.archived_at IS NOT NULL OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) AND
   (to_jsonb(NEW)-'updated_at'-'archived_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'archived_at') THEN
   RAISE EXCEPTION 'Restore task before editing fields; lifecycle retains fields' USING ERRCODE='23514';END IF;
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'Archive timestamp retained' USING ERRCODE='23514';END IF;
  NEW.updated_at:=GREATEST(clock_timestamp(),OLD.updated_at+INTERVAL '1 microsecond');
 ELSE NEW.updated_at:=clock_timestamp();END IF;
 IF NEW.bucket_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id OR OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL) THEN
  SELECT plan_id INTO bucket_plan FROM planner_buckets WHERE id=NEW.bucket_id FOR SHARE NOWAIT;
  IF bucket_plan IS DISTINCT FROM NEW.plan_id THEN RAISE EXCEPTION 'Bucket must belong to task plan' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS planner_tasks_guard_lifecycle ON planner_tasks;
CREATE TRIGGER planner_tasks_guard_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON planner_tasks FOR EACH ROW EXECUTE FUNCTION guard_planner_task_lifecycle();
CREATE OR REPLACE FUNCTION planner_task_touch_plan() RETURNS TRIGGER AS $$
BEGIN UPDATE planner_plans SET updated_at=clock_timestamp() WHERE id=NEW.plan_id;RETURN NEW;END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS planner_tasks_touch_plan ON planner_tasks;
CREATE TRIGGER planner_tasks_touch_plan AFTER INSERT OR UPDATE ON planner_tasks FOR EACH ROW EXECUTE FUNCTION planner_task_touch_plan();
CREATE OR REPLACE FUNCTION audit_planner_primary() RETURNS TRIGGER AS $$
DECLARE before_row JSONB;after_row JSONB;pid UUID;actor TEXT;origin TEXT;operation TEXT;
BEGIN
 after_row:=to_jsonb(NEW);
 IF current_setting('cores.planner_origin',true)='guided' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN before_row:=to_jsonb(OLD);IF (before_row-'updated_at') IS NOT DISTINCT FROM (after_row-'updated_at') THEN RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME='planner_plans' THEN pid:=NEW.id;ELSE pid:=NEW.plan_id;END IF;
 actor:=NULLIF(current_setting('cores.planner_user',true),'');
 origin:=COALESCE(NULLIF(current_setting('cores.planner_origin',true),''),'native/legacy');
 operation:=COALESCE(NULLIF(current_setting('cores.planner_operation',true),''),lower(TG_OP));
 INSERT INTO planner_mutation_events(plan_id,entity_type,entity_id,user_id,origin,operation,before_values,after_values)
 VALUES(pid,CASE WHEN TG_TABLE_NAME='planner_plans' THEN 'plan' ELSE 'task' END,NEW.id,actor,origin,operation,before_row,after_row);
 IF TG_TABLE_NAME='planner_tasks' THEN
  INSERT INTO planner_task_history(task_id,user_id,field_changed,old_value,new_value) VALUES(NEW.id,actor,'lifecycle.'||operation,before_row::text,after_row::text);
 END IF;
 RETURN NEW;
END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS planner_plans_audit_lifecycle ON planner_plans;
CREATE TRIGGER planner_plans_audit_lifecycle AFTER INSERT OR UPDATE ON planner_plans FOR EACH ROW EXECUTE FUNCTION audit_planner_primary();
DROP TRIGGER IF EXISTS planner_tasks_audit_lifecycle ON planner_tasks;
CREATE TRIGGER planner_tasks_audit_lifecycle AFTER INSERT OR UPDATE ON planner_tasks FOR EACH ROW EXECUTE FUNCTION audit_planner_primary();
CREATE OR REPLACE FUNCTION planner_child_context(row_data JSONB,table_name TEXT) RETURNS TABLE(plan_id UUID,task_id UUID) AS $$
BEGIN
 IF row_data IS NULL THEN RETURN;END IF;
 IF table_name='planner_dependencies' THEN
  RETURN QUERY SELECT t.plan_id,t.id FROM planner_tasks t WHERE t.id IN ((row_data->>'predecessor_id')::uuid,(row_data->>'successor_id')::uuid) ORDER BY t.plan_id,t.id;
 ELSIF row_data ? 'task_id' THEN
  RETURN QUERY SELECT t.plan_id,t.id FROM planner_tasks t WHERE t.id=(row_data->>'task_id')::uuid;
 ELSE RETURN QUERY SELECT (row_data->>'plan_id')::uuid,NULL::uuid;END IF;
END;$$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION guard_planner_child_lifecycle() RETURNS TRIGGER AS $$
DECLARE a JSONB;b JSONB;item RECORD;archived TIMESTAMPTZ;
BEGIN
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD);END IF;IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW);END IF;
 FOR item IN SELECT DISTINCT x.plan_id,x.task_id FROM (SELECT * FROM planner_child_context(a,TG_TABLE_NAME) UNION SELECT * FROM planner_child_context(b,TG_TABLE_NAME))x ORDER BY x.plan_id,x.task_id LOOP
  SELECT p.archived_at INTO archived FROM planner_plans p WHERE p.id=item.plan_id FOR UPDATE NOWAIT;
  IF archived IS NOT NULL AND NOT (TG_TABLE_NAME='planner_members' AND TG_OP='DELETE') THEN RAISE EXCEPTION 'Archived plan contents retained' USING ERRCODE='23514';END IF;
  IF item.task_id IS NOT NULL THEN
   SELECT t.archived_at INTO archived FROM planner_tasks t WHERE t.id=item.task_id FOR UPDATE NOWAIT;
   IF archived IS NOT NULL THEN RAISE EXCEPTION 'Archived task contents retained' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='planner_task_labels' AND TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM planner_tasks t JOIN planner_labels l ON l.plan_id=t.plan_id WHERE t.id=(b->>'task_id')::uuid AND l.id=(b->>'label_id')::uuid) THEN RAISE EXCEPTION 'Label must belong to task plan' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='planner_task_assignees' AND TG_OP<>'DELETE' THEN
  PERFORM u.userid FROM users u JOIN planner_members m ON m.user_id=u.userid::text JOIN planner_tasks t ON t.plan_id=m.plan_id WHERE u.userid::text=b->>'user_id' AND u.is_active AND t.id=(b->>'task_id')::uuid FOR SHARE OF u,m NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignee must be an active plan member' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='planner_dependencies' AND TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM planner_tasks a JOIN planner_tasks b ON b.plan_id=a.plan_id WHERE a.id=(to_jsonb(NEW)->>'predecessor_id')::uuid AND b.id=(to_jsonb(NEW)->>'successor_id')::uuid AND a.id<>b.id) THEN RAISE EXCEPTION 'Dependencies require distinct tasks in one plan' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION planner_child_touch_versions() RETURNS TRIGGER AS $$
DECLARE a JSONB;b JSONB;item RECORD;
BEGIN
 IF TG_OP<>'INSERT' THEN a:=to_jsonb(OLD);END IF;IF TG_OP<>'DELETE' THEN b:=to_jsonb(NEW);END IF;
 FOR item IN SELECT DISTINCT x.plan_id,x.task_id FROM (SELECT * FROM planner_child_context(a,TG_TABLE_NAME) UNION SELECT * FROM planner_child_context(b,TG_TABLE_NAME))x ORDER BY x.plan_id,x.task_id LOOP
  IF item.task_id IS NULL THEN UPDATE planner_plans SET updated_at=clock_timestamp() WHERE id=item.plan_id;
  ELSE UPDATE planner_tasks SET updated_at=clock_timestamp() WHERE id=item.task_id;END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$ LANGUAGE plpgsql;
DO $$ DECLARE name TEXT;BEGIN
 FOREACH name IN ARRAY ARRAY['planner_members','planner_buckets','planner_labels','planner_checklist_items','planner_task_labels','planner_task_assignees','planner_comments','planner_attachments','planner_dependencies','planner_sprints','planner_sprint_tasks','planner_goals','planner_custom_fields','planner_custom_field_values','planner_baselines','planner_plan_links','planner_my_day'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I',name||'_guard_lifecycle',name);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_planner_child_lifecycle()',name||'_guard_lifecycle',name);
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I',name||'_touch_versions',name);
  EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION planner_child_touch_versions()',name||'_touch_versions',name);
 END LOOP;
END;$$;

CREATE OR REPLACE FUNCTION planner_keep_events() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'Planner mutation history is immutable' USING ERRCODE='23514';END;$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS planner_events_immutable ON planner_mutation_events;
CREATE TRIGGER planner_events_immutable BEFORE UPDATE OR DELETE ON planner_mutation_events FOR EACH ROW EXECUTE FUNCTION planner_keep_events();
