-- Run as the project database owner, through Supabase migrations or SQL Editor.
-- Private helpers use a fixed empty search path; only explicitly granted RPCs
-- are executable by the browser. Auth users are provisioned separately.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_roles where user_id = auth.uid()
  );
$$;

create function private.assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '需要管理员权限' using errcode = '42501';
  end if;
end;
$$;

create function private.valid_rules(p_config jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb; total numeric := 0; ids text[] := '{}'; max_value numeric;
  cap_value numeric; stages jsonb; val jsonb; thresholds numeric[] := '{}'; threshold_value numeric;
begin
  if jsonb_typeof(p_config) is distinct from 'object'
    or jsonb_typeof(p_config->'indicators') is distinct from 'array'
    or jsonb_array_length(p_config->'indicators') <> 4 then return false; end if;
  -- Rule configuration is public by design. Reject unrelated fields rather
  -- than accidentally exposing private metadata through get_public_rules().
  if p_config - array['indicators','month','exam','reward','semester'] <> '{}'::jsonb then return false; end if;
  for item in select value from jsonb_array_elements(p_config->'indicators') loop
    if jsonb_typeof(item->'id') is distinct from 'string' or (item->>'id') <> all(array['understanding','consolidation','transfer','engagement'])
      or (item->>'id') = any(ids) or jsonb_typeof(item->'max') is distinct from 'number'
      or jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 100
      or jsonb_typeof(item->'description') is distinct from 'string'
      or jsonb_typeof(item->'criteria') is distinct from 'array'
      or jsonb_array_length(item->'criteria') not between 1 and 32 then return false; end if;
    if item - array['id','name','max','description','criteria'] <> '{}'::jsonb then return false; end if;
    for val in select value from jsonb_array_elements(item->'criteria') loop
      if jsonb_typeof(val) is distinct from 'string' or length(trim(val#>>'{}')) = 0 then return false; end if;
    end loop;
    ids := array_append(ids, item->>'id');
    max_value := (item->>'max')::numeric;
    if max_value <= 0 or max_value > 10 then return false; end if;
    total := total + max_value;
  end loop;
  if total <> 10 or jsonb_typeof(p_config->'month') is distinct from 'object'
    or jsonb_typeof(p_config#>'{month,minRecords}') is distinct from 'number'
    or (p_config#>>'{month,minRecords}')::numeric not between 1 and 2147483647
    or (p_config#>>'{month,minRecords}')::numeric <> trunc((p_config#>>'{month,minRecords}')::numeric)
    or jsonb_typeof(p_config#>'{month,excellentAverage}') is distinct from 'number'
    or (p_config#>>'{month,excellentAverage}')::numeric not between 0 and 10
    or jsonb_typeof(p_config#>'{month,excellentTotal}') is distinct from 'number'
    or jsonb_typeof(p_config#>'{month,goodTotal}') is distinct from 'number'
    or jsonb_typeof(p_config#>'{exam,cap}') is distinct from 'number' then return false; end if;
  cap_value := (p_config#>>'{exam,cap}')::numeric;
  if (p_config->'month') - array['minRecords','excellentAverage','excellentTotal','goodTotal'] <> '{}'::jsonb
    or (p_config->'exam') - array['tiers','cap'] <> '{}'::jsonb then return false; end if;
  if cap_value not between 0 and 10
    or (p_config#>>'{month,excellentTotal}')::numeric not between 0 and 10 + cap_value
    or (p_config#>>'{month,goodTotal}')::numeric not between 0 and (p_config#>>'{month,excellentTotal}')::numeric
    or jsonb_typeof(p_config#>'{exam,tiers}') is distinct from 'array'
    or jsonb_array_length(p_config#>'{exam,tiers}') not between 0 and 1000 then return false; end if;
  for item in select value from jsonb_array_elements(p_config#>'{exam,tiers}') loop
    if jsonb_typeof(item->'minImprovement') is distinct from 'number' or jsonb_typeof(item->'bonus') is distinct from 'number'
      or (item->>'minImprovement')::numeric <= 0 or (item->>'minImprovement')::numeric > 100
      or (item->>'bonus')::numeric not between 0 and cap_value then return false; end if;
    if item - array['minImprovement','bonus'] <> '{}'::jsonb then return false; end if;
    threshold_value := (item->>'minImprovement')::numeric;
    if threshold_value = any(thresholds) then return false; end if;
    thresholds := array_append(thresholds, threshold_value);
  end loop;
  if jsonb_typeof(p_config->'reward') is distinct from 'object'
    or jsonb_typeof(p_config#>'{reward,name}') is distinct from 'string'
    or jsonb_typeof(p_config#>'{reward,description}') is distinct from 'string'
    or jsonb_typeof(p_config#>'{reward,unit}') is distinct from 'string'
    or jsonb_typeof(p_config#>'{reward,cap}') is distinct from 'number'
    or (p_config#>>'{reward,cap}')::numeric not between 0 and 1000000
    or jsonb_typeof(p_config#>'{reward,stages}') is distinct from 'array'
    or jsonb_array_length(p_config#>'{reward,stages}') not between 1 and 120 then return false; end if;
  for val in select value from jsonb_array_elements(p_config#>'{reward,stages}') loop
    if jsonb_typeof(val) is distinct from 'number' or val::text::numeric not between 0 and 1000000 then return false; end if;
  end loop;
  if jsonb_typeof(p_config#>'{semester,award}') is distinct from 'string'
    or jsonb_typeof(p_config#>'{semester,description}') is distinct from 'string' then return false; end if;
  if (p_config->'reward') - array['name','description','unit','stages','cap'] <> '{}'::jsonb
    or (p_config->'semester') - array['award','description'] <> '{}'::jsonb then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  grade text not null default '高一' check (length(grade) <= 50),
  created_at timestamptz not null default now()
);
create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  version bigint generated always as identity unique,
  effective_from date not null check (isfinite(effective_from)),
  config jsonb not null check (private.valid_rules(config) is true),
  created_at timestamptz not null default now()
);
create index rule_versions_effective_idx on public.rule_versions(effective_from desc, version desc);

create table public.weekly_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  rule_version_id uuid not null references public.rule_versions(id),
  lesson_date date not null check (isfinite(lesson_date)),
  status text not null check (status in ('completed','absent','cancelled','pending')),
  scores jsonb,
  criteria_checks jsonb not null default '{}' check (jsonb_typeof(criteria_checks) = 'object'),
  topics text[] not null default '{}',
  consolidation jsonb not null default '[]' check (jsonb_typeof(consolidation) = 'array'),
  weaknesses text not null default '',
  feedback text not null default '',
  next_focus text not null default '',
  created_at timestamptz not null default now(),
  unique(student_id, lesson_date),
  check ((status = 'completed' and scores is not null) or (status <> 'completed' and scores is null))
);
create index weekly_records_student_month_idx on public.weekly_records(student_id, lesson_date);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  exam_date date not null check (isfinite(exam_date)),
  name text not null check (length(trim(name)) between 1 and 150),
  score numeric not null check (score >= 0 and score < 'Infinity'::numeric),
  max_score numeric not null check (max_score > 0 and max_score <= 1000000),
  comparison_id uuid references public.exams(id) on delete restrict,
  comparable boolean not null default false,
  scope text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (score <= max_score),
  check (not comparable or comparison_id is not null),
  check (comparison_id is distinct from id)
);
create index exams_student_date_idx on public.exams(student_id, exam_date);
create index exams_comparison_idx on public.exams(comparison_id);

create table public.monthly_settlements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  month date not null check (isfinite(month) and extract(day from month) = 1),
  rule_version_id uuid not null references public.rule_versions(id),
  revision integer not null default 1 check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  finalized_at timestamptz not null default now(),
  unique(student_id, month)
);
create table public.settlement_revisions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.monthly_settlements(id),
  revision integer not null,
  rule_version_id uuid not null references public.rule_versions(id),
  snapshot jsonb not null,
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(settlement_id, revision)
);
create table public.reward_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  settlement_id uuid references public.monthly_settlements(id),
  kind text not null check (kind in ('earned','used','adjustment')),
  quantity numeric not null check (quantity <> 0 and abs(quantity) <= 1000000),
  name text not null default '',
  unit text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  check ((kind = 'earned' and quantity > 0 and settlement_id is not null)
    or (kind = 'used' and quantity < 0) or kind = 'adjustment')
);
create unique index reward_entries_settlement_earned_idx on public.reward_entries(settlement_id) where kind = 'earned';
create index reward_entries_student_balance_idx on public.reward_entries(student_id, name, unit);

create table public.semester_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  label text not null check (length(trim(label)) between 1 and 100),
  start_date date not null check (isfinite(start_date)),
  end_date date not null check (isfinite(end_date)),
  review text not null default '',
  award text not null default '',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
-- Intentional whitelist: no student ID/name, individual exam/weekly scores,
-- notes, snapshots or freely supplied description fields live in this table.
create table public.public_growth (
  id uuid primary key references public.monthly_settlements(id),
  month date not null,
  label text not null check (label = to_char(month, 'YYYY年MM月') || ' · 匿名学习者'),
  average numeric check (average between 0 and 10),
  exam_bonus numeric not null check (exam_bonus between 0 and 10),
  rating text not null check (rating in ('excellent','good','improve','pending')),
  streak integer not null check (streak >= 0),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index public_growth_published_idx on public.public_growth(month) where published;
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; row_id uuid; metadata jsonb := '{}';
begin
  if TG_OP = 'DELETE' then row_data := to_jsonb(OLD); else row_data := to_jsonb(NEW); end if;
  row_id := coalesce(row_data->>'id', row_data->>'user_id')::uuid;
  -- Log facts needed to trace an operation without duplicating private notes.
  if row_data ? 'revision' then metadata := metadata || jsonb_build_object('revision', row_data->'revision'); end if;
  if row_data ? 'rule_version_id' then metadata := metadata || jsonb_build_object('ruleVersionId', row_data->'rule_version_id'); end if;
  if row_data ? 'published' then metadata := metadata || jsonb_build_object('published', row_data->'published'); end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, detail)
    values(auth.uid(), lower(TG_OP), TG_TABLE_NAME, row_id, metadata);
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

create function private.immutable_rule() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '规则版本不可修改或删除；请新增版本' using errcode = '23514';
end;
$$;
create trigger rule_versions_immutable before update or delete on public.rule_versions
  for each row execute function private.immutable_rule();

create function private.lock_student_input() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The same lock guards settlement and reward RPCs, so its separate aggregate
  -- queries see one coherent set of inputs throughout their transaction.
  if TG_OP = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended(OLD.student_id::text, 0));
    return OLD;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(NEW.student_id::text, 0));
  return NEW;
end;
$$;
create trigger a_student_input_lock before insert or update or delete on public.weekly_records
  for each row execute function private.lock_student_input();
create trigger a_student_input_lock before insert or update or delete on public.exams
  for each row execute function private.lock_student_input();

create function private.validate_weekly() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb; effective_date date; indicator jsonb; key_name text; score_value numeric; item jsonb; pair record; v jsonb;
begin
  if TG_OP = 'INSERT' then
    select id into NEW.rule_version_id from public.rule_versions
      where effective_from <= NEW.lesson_date order by effective_from desc, version desc limit 1;
    if NEW.rule_version_id is null then raise exception '授课日期没有可用规则' using errcode = '23514'; end if;
  elsif NEW.rule_version_id is distinct from OLD.rule_version_id or NEW.student_id is distinct from OLD.student_id then
    raise exception '历史记录的学生和规则版本不可更改' using errcode = '23514';
  end if;
  select config, effective_from into cfg, effective_date from public.rule_versions where id = NEW.rule_version_id;
  if NEW.lesson_date < effective_date then
    raise exception '授课日期不能早于关联规则的生效日期' using errcode = '23514';
  end if;
  if NEW.status = 'completed' then
    if NEW.scores is null or jsonb_typeof(NEW.scores) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(NEW.scores)) <> 4 then
      raise exception '有效记录必须填写四项积分' using errcode = '23514';
    end if;
    for indicator in select value from jsonb_array_elements(cfg->'indicators') loop
      key_name := indicator->>'id';
      if jsonb_typeof(NEW.scores->key_name) is distinct from 'number' then
        raise exception '积分必须为数字' using errcode = '23514';
      end if;
      score_value := (NEW.scores->>key_name)::numeric;
      if score_value < 0 or score_value > (indicator->>'max')::numeric then
        raise exception '积分超出关联规则的权重' using errcode = '23514';
      end if;
    end loop;
  elsif NEW.scores is not null then raise exception '未完成授课不能记录积分' using errcode = '23514'; end if;
  if jsonb_typeof(NEW.criteria_checks) is distinct from 'object' then raise exception '评分细则格式错误' using errcode = '23514'; end if;
  for pair in select key, value from jsonb_each(NEW.criteria_checks) loop
    if pair.key <> all(array['understanding','consolidation','transfer','engagement']) or jsonb_typeof(pair.value) is distinct from 'array' then
      raise exception '评分细则格式错误' using errcode = '23514';
    end if;
    for v in select value from jsonb_array_elements(pair.value) loop
      if jsonb_typeof(v) is distinct from 'number' or v::text::numeric < 0 or v::text::numeric > 10 then
        raise exception '评分细则数值错误' using errcode = '23514';
      end if;
    end loop;
  end loop;
  if jsonb_typeof(NEW.consolidation) is distinct from 'array' then raise exception '复测格式错误' using errcode = '23514'; end if;
  for item in select value from jsonb_array_elements(NEW.consolidation) loop
    if jsonb_typeof(item->'topic') is distinct from 'string' or jsonb_typeof(item->'mastered') is distinct from 'boolean' then
      raise exception '复测格式错误' using errcode = '23514';
    end if;
  end loop;
  return NEW;
end;
$$;
create trigger weekly_records_validate before insert or update on public.weekly_records
  for each row execute function private.validate_weekly();

create function private.validate_exam() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and NEW.student_id is distinct from OLD.student_id then
    raise exception '考试所属学生不可更改' using errcode = '23514';
  end if;
  if NEW.comparison_id is not null and not exists (
    select 1 from public.exams where id = NEW.comparison_id and student_id = NEW.student_id and exam_date < NEW.exam_date
  ) then raise exception '对比考试必须是同一学生的较早考试' using errcode = '23514'; end if;
  if exists(select 1 from public.exams where comparison_id = NEW.id and exam_date <= NEW.exam_date) then
    raise exception '日期调整会破坏已有考试对比' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
create trigger exams_validate before insert or update on public.exams for each row execute function private.validate_exam();

-- All business tables use RLS; absent policies deny access even if a future
-- deployment accidentally grants additional table privileges.
do $$
declare t text;
begin
  foreach t in array array['admin_roles','students','rule_versions','weekly_records','exams','monthly_settlements',
    'settlement_revisions','reward_entries','semester_reviews','public_growth','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))', t);
    execute format('grant select on public.%I to authenticated', t);
    if t <> 'audit_logs' then
      execute format('create trigger audit_mutation after insert or update or delete on public.%I for each row execute function private.audit_change()', t);
    end if;
  end loop;
  foreach t in array array['students','weekly_records','exams','semester_reviews'] loop
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;
create policy admin_rules_insert on public.rule_versions for insert to authenticated with check ((select public.is_admin()));
grant insert on public.rule_versions to authenticated;
grant usage, select on sequence public.rule_versions_version_seq to authenticated;
create policy published_read on public.public_growth for select to anon, authenticated using (published);
grant select on public.public_growth to anon;

create function public.get_public_rules() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'version', version, 'effective_from', effective_from, 'config', config, 'created_at', created_at)
  from public.rule_versions where effective_from <= (now() at time zone 'Asia/Shanghai')::date order by effective_from desc, version desc limit 1;
$$;

create function private.streak_at(p_student_id uuid, p_month date) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare item record; result integer := 0;
begin
  -- Missing/pending months pause; a valid nonexcellent month resets.
  for item in select snapshot->>'rating' as rating from public.monthly_settlements
    where student_id = p_student_id and month <= p_month order by month loop
    if item.rating = 'excellent' then result := result + 1;
    elsif item.rating <> 'pending' then result := 0; end if;
  end loop;
  return result;
end;
$$;

create function public.settle_month(
  p_student_id uuid, p_month date, p_override_rating text default null,
  p_reason text default '', p_strengths text default '', p_improvements text default '', p_recalculate boolean default false
) returns public.monthly_settlements
language plpgsql security definer set search_path = '' as $$
declare
  r public.rule_versions; saved public.monthly_settlements; existing public.monthly_settlements;
  count_value integer; average_value numeric; bonus_value numeric := 0; total_value numeric;
  calculated text; final_rating text; snapshot_value jsonb; weekly_inputs jsonb; exam_inputs jsonb;
  weekly_ids jsonb; exam_ids jsonb; streak_value integer; reward_value numeric; stages jsonb;
begin
  perform private.assert_admin();
  if p_month is null or not isfinite(p_month) or extract(day from p_month) <> 1 then raise exception '结算月份应为当月1日' using errcode = '23514'; end if;
  if not exists(select 1 from public.students where id = p_student_id) then raise exception '学生不存在' using errcode = '23503'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  select * into existing from public.monthly_settlements where student_id = p_student_id and month = p_month for update;
  if existing.id is not null and p_recalculate is not true then raise exception '已有结算，请明确选择重新结算' using errcode = '23514'; end if;
  if existing.id is not null and length(trim(coalesce(p_reason,''))) = 0 then raise exception '重新结算必须填写原因' using errcode = '23514'; end if;
  if p_override_rating is not null and (p_override_rating not in ('excellent','good','improve','pending')
    or length(trim(coalesce(p_reason,''))) = 0) then raise exception '调整评级必须选择有效评级并填写原因' using errcode = '23514'; end if;
  select * into r from public.rule_versions where effective_from <= p_month order by effective_from desc, version desc limit 1;
  if r.id is null then raise exception '结算月份没有可用规则' using errcode = '23514'; end if;
  select count(*), avg((scores->>'understanding')::numeric + (scores->>'consolidation')::numeric
      + (scores->>'transfer')::numeric + (scores->>'engagement')::numeric),
    coalesce(jsonb_agg(id order by lesson_date), '[]'::jsonb)
    into count_value, average_value, weekly_ids from public.weekly_records
    where student_id = p_student_id and status = 'completed' and lesson_date >= p_month and lesson_date < (p_month + interval '1 month');
  select coalesce(jsonb_agg(to_jsonb(w) order by lesson_date), '[]'::jsonb) into weekly_inputs from public.weekly_records w
    where student_id = p_student_id and lesson_date >= p_month and lesson_date < (p_month + interval '1 month');
  select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('comparisonInput', to_jsonb(previous)) order by e.exam_date), '[]'::jsonb),
    coalesce(jsonb_agg(e.id order by e.exam_date), '[]'::jsonb)
    into exam_inputs, exam_ids from public.exams e left join public.exams previous on previous.id = e.comparison_id
    where e.student_id = p_student_id and e.exam_date >= p_month and e.exam_date < (p_month + interval '1 month');
  select least((r.config#>>'{exam,cap}')::numeric, coalesce(sum(tier.bonus), 0)) into bonus_value
    from public.exams e join public.exams previous on previous.id = e.comparison_id
    join lateral (
      select (value->>'bonus')::numeric as bonus from jsonb_array_elements(r.config#>'{exam,tiers}')
      where 100 * (e.score * previous.max_score - previous.score * e.max_score)
        / (e.max_score * previous.max_score) >= (value->>'minImprovement')::numeric
      order by (value->>'minImprovement')::numeric desc limit 1
    ) tier on true
    where e.student_id = p_student_id and e.comparable and e.exam_date >= p_month and e.exam_date < (p_month + interval '1 month')
    ;
  total_value := average_value + bonus_value;
  if count_value < (r.config#>>'{month,minRecords}')::numeric::integer then calculated := 'pending';
  elsif average_value >= (r.config#>>'{month,excellentAverage}')::numeric and total_value >= (r.config#>>'{month,excellentTotal}')::numeric then calculated := 'excellent';
  elsif total_value >= (r.config#>>'{month,goodTotal}')::numeric then calculated := 'good';
  else calculated := 'improve'; end if;
  final_rating := coalesce(p_override_rating, calculated);
  snapshot_value := jsonb_build_object('validCount', count_value, 'average', average_value, 'examBonus', bonus_value,
    'total', total_value, 'calculatedRating', calculated, 'rating', final_rating, 'overrideReason', coalesce(p_reason,''),
    'strengths', coalesce(p_strengths,''), 'improvements', coalesce(p_improvements,''), 'weeklyIds', weekly_ids, 'examIds', exam_ids,
    'ruleConfig', r.config, 'weeklyInputs', weekly_inputs, 'examInputs', exam_inputs);
  if existing.id is not null then
    insert into public.settlement_revisions(settlement_id, revision, rule_version_id, snapshot, reason, actor_id)
      values(existing.id, existing.revision, existing.rule_version_id, existing.snapshot, p_reason, auth.uid());
    update public.monthly_settlements set rule_version_id = r.id, revision = revision + 1, snapshot = snapshot_value, finalized_at = now()
      where id = existing.id returning * into saved;
    -- A changed private snapshot needs a fresh explicit publication decision.
    update public.public_growth set published = false where id = saved.id and published;
  else
    insert into public.monthly_settlements(student_id, month, rule_version_id, snapshot)
      values(p_student_id, p_month, r.id, snapshot_value) returning * into saved;
  end if;
  if final_rating = 'excellent' then
    streak_value := private.streak_at(p_student_id, p_month);
    stages := r.config#>'{reward,stages}';
    reward_value := least((r.config#>>'{reward,cap}')::numeric,
      (stages->>least(streak_value - 1, jsonb_array_length(stages) - 1))::numeric);
    if reward_value > 0 then
      insert into public.reward_entries(student_id, settlement_id, kind, quantity, name, unit, note)
        values(p_student_id, saved.id, 'earned', reward_value, r.config#>>'{reward,name}', r.config#>>'{reward,unit}', '月度优秀奖励')
        on conflict (settlement_id) where kind = 'earned' do nothing;
    end if;
  end if;
  return saved;
end;
$$;

create function public.use_reward(p_student_id uuid, p_quantity numeric, p_name text, p_unit text, p_note text default '')
returns public.reward_entries
language plpgsql security definer set search_path = '' as $$
declare balance_value numeric; result public.reward_entries;
begin
  perform private.assert_admin();
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception '使用数量必须为正数' using errcode = '23514'; end if;
  if p_name is null or p_unit is null then raise exception '奖励名称与单位不能为null' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  select coalesce(sum(quantity), 0) into balance_value from public.reward_entries
    where student_id = p_student_id and name = p_name and unit = p_unit;
  if balance_value < p_quantity then raise exception '可用奖励不足' using errcode = '23514'; end if;
  insert into public.reward_entries(student_id, kind, quantity, name, unit, note)
    values(p_student_id, 'used', -p_quantity, p_name, p_unit, coalesce(p_note,'')) returning * into result;
  return result;
end;
$$;

create function public.publish_month(p_settlement_id uuid, p_publish boolean) returns public.public_growth
language plpgsql security definer set search_path = '' as $$
declare saved public.monthly_settlements; result public.public_growth;
begin
  perform private.assert_admin();
  if p_publish is null then raise exception '请选择发布状态' using errcode = '23514'; end if;
  select * into saved from public.monthly_settlements where id = p_settlement_id;
  if saved.id is null then raise exception '结算不存在' using errcode = '23503'; end if;
  perform pg_advisory_xact_lock(hashtextextended(saved.student_id::text, 0));
  select * into saved from public.monthly_settlements where id = p_settlement_id for update;
  insert into public.public_growth(id, month, label, average, exam_bonus, rating, streak, published)
    values(saved.id, saved.month, to_char(saved.month, 'YYYY年MM月') || ' · 匿名学习者',
      (saved.snapshot->>'average')::numeric, (saved.snapshot->>'examBonus')::numeric, saved.snapshot->>'rating',
      private.streak_at(saved.student_id, saved.month), p_publish)
    on conflict(id) do update set month = excluded.month, label = excluded.label, average = excluded.average,
      exam_bonus = excluded.exam_bonus, rating = excluded.rating, streak = excluded.streak, published = excluded.published
    returning * into result;
  return result;
end;
$$;

create function public.adjust_reward(p_student_id uuid, p_quantity numeric, p_name text, p_unit text, p_reason text)
returns public.reward_entries
language plpgsql security definer set search_path = '' as $$
declare balance_value numeric; result public.reward_entries;
begin
  perform private.assert_admin();
  if p_quantity is null or p_quantity = 0 or abs(p_quantity) > 1000000 then
    raise exception '调整数量必须为非零有限数值' using errcode = '23514';
  end if;
  if p_name is null or p_unit is null or length(trim(coalesce(p_reason,''))) = 0 then
    raise exception '调整奖励必须填写原因、名称和单位' using errcode = '23514';
  end if;
  if not exists(select 1 from public.students where id = p_student_id) then
    raise exception '学生不存在' using errcode = '23503';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  select coalesce(sum(quantity), 0) into balance_value from public.reward_entries
    where student_id = p_student_id and name = p_name and unit = p_unit;
  if balance_value + p_quantity < 0 then raise exception '调整后奖励余额不能小于0' using errcode = '23514'; end if;
  insert into public.reward_entries(student_id, kind, quantity, name, unit, note)
    values(p_student_id, 'adjustment', p_quantity, p_name, p_unit, trim(p_reason)) returning * into result;
  return result;
end;
$$;

-- Revoke the PostgreSQL default PUBLIC execution privilege on every helper
-- and entrypoint. Only these six RPCs are exposed to browser roles.
revoke all on all functions in schema private from public, anon, authenticated;
-- PostgreSQL evaluates CHECK constraints with the caller's execute privilege.
-- This pure JSON validator is safe; private is not in the API schema list.
grant execute on function private.valid_rules(jsonb) to authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.get_public_rules() from public, anon, authenticated;
revoke all on function public.settle_month(uuid,date,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.use_reward(uuid,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.publish_month(uuid,boolean) from public, anon, authenticated;
revoke all on function public.adjust_reward(uuid,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.is_admin(), public.get_public_rules() to anon, authenticated;
grant execute on function public.settle_month(uuid,date,text,text,text,text,boolean),
  public.use_reward(uuid,numeric,text,text,text), public.publish_month(uuid,boolean),
  public.adjust_reward(uuid,numeric,text,text,text) to authenticated;

insert into public.rule_versions(effective_from, config) values('2000-01-01', '{
  "indicators": [
    {"id":"understanding","name":"错题理解","max":3,"description":"每周精选4—6道重点错题；没有错题时使用概念辨析或典型疑难题。","criteria":["指出原来的错误或不会做的地方","解释错误原因和正确方法","脱离答案独立完成关键解题过程"]},
    {"id":"consolidation","name":"知识巩固","max":3,"description":"已学知识延迟复测，默认3道基础或典型题，独立正确完成每题得1分。","criteria":["基础或典型题1独立正确完成","基础或典型题2独立正确完成","基础或典型题3独立正确完成"]},
    {"id":"transfer","name":"知识迁移","max":2,"description":"使用适度变化的新题检验举一反三能力。","criteria":["独立判断正确的解题方法","独立完成关键步骤并得到正确结果"]},
    {"id":"engagement","name":"课堂表现","max":2,"description":"每项允许0、0.5、1分；不因做错题或性格差异扣分。","criteria":["课堂专注与任务投入","独立思考与有效互动"]}
  ],
  "month":{"minRecords":3,"excellentAverage":8,"excellentTotal":8.5,"goodTotal":7},
  "exam":{"tiers":[{"minImprovement":5,"bonus":0.5},{"minImprovement":10,"bonus":1}],"cap":1},
  "reward":{"name":"设备体验卡","description":"连续优秀递增获得；已获得奖励不会因后续评级被取消。","unit":"天","stages":[1,2,3],"cap":3},
  "semester":{"award":"","description":"学期大奖由管理员结合学习进步手动评定。"}
}'::jsonb);

commit;
