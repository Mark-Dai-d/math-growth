-- Executable after migrations as the database owner. Never persists fixtures.
-- npm/pnpm run test:database also runs this against an isolated PGlite database.
begin;

create function pg_temp.assert_true(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is not true then raise exception 'ASSERTION FAILED: %', p_message; end if;
end;
$$;
create function pg_temp.expect_error(p_sql text, p_state text, p_message text) returns void
language plpgsql as $$
declare failed boolean := false; actual_state text;
begin
  begin execute p_sql;
  exception when others then
    failed := true;
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> p_state then
      raise exception 'ASSERTION FAILED: %, expected SQLSTATE %, got % (%)', p_message, p_state, actual_state, SQLERRM;
    end if;
  end;
  if not failed then raise exception 'ASSERTION FAILED: %, operation unexpectedly succeeded', p_message; end if;
end;
$$;

insert into auth.users(id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'rls-admin@example.invalid'),
  ('a0000000-0000-0000-0000-000000000002', 'rls-visitor@example.invalid');
insert into public.admin_roles(user_id) values ('a0000000-0000-0000-0000-000000000001');
insert into public.students(id, name, grade) values
  ('b0000000-0000-0000-0000-000000000001', '私密学生姓名__不可公开', '高一'),
  ('b0000000-0000-0000-0000-000000000002', '另一个学生', '高一');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true(not public.is_admin(), '匿名身份不是管理员');
select pg_temp.assert_true((public.get_public_rules()->>'version')::integer = 1, '匿名可读取当前有效默认规则');
select pg_temp.assert_true((select count(*) from public.public_growth) = 0, '默认没有公开学生数据');
select pg_temp.expect_error('select * from public.students', '42501', '匿名不能读取学生');
select pg_temp.expect_error('select * from public.weekly_records', '42501', '匿名不能读取原始周积分');
select pg_temp.expect_error('select * from public.exams', '42501', '匿名不能读取考试成绩');
select pg_temp.expect_error('select * from public.monthly_settlements', '42501', '匿名不能读取结算快照');
select pg_temp.expect_error('select * from public.reward_entries', '42501', '匿名不能读取奖励账本');
select pg_temp.expect_error('select * from public.audit_logs', '42501', '匿名不能读取日志');
select pg_temp.expect_error('select * from public.rule_versions', '42501', '匿名只能通过RPC读取当前规则');
select pg_temp.expect_error($q$insert into public.students(name) values('越权')$q$, '42501', '匿名不能新增学生');
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01')$q$, '42501', '匿名不能执行结算RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true(not public.is_admin(), '登录普通用户不是管理员');
select pg_temp.assert_true((select count(*) from public.students) = 0, '普通用户RLS不能读取学生');
select pg_temp.assert_true((select count(*) from public.weekly_records) = 0, '普通用户RLS不能读取原始周积分');
select pg_temp.assert_true((select count(*) from public.admin_roles) = 0, '普通用户不能查看管理员角色');
select pg_temp.expect_error($q$insert into public.admin_roles(user_id) values('a0000000-0000-0000-0000-000000000002')$q$, '42501', '普通用户不能自授管理员');
select pg_temp.expect_error($q$insert into public.students(name) values('越权')$q$, '42501', '普通用户不能新增学生');
select pg_temp.expect_error($q$insert into public.rule_versions(effective_from,config) values('2020-01-01','{}')$q$, '42501', '普通用户不能新增规则');
select pg_temp.expect_error($q$insert into public.weekly_records(student_id,rule_version_id,lesson_date,status,scores) values('b0000000-0000-0000-0000-000000000001',gen_random_uuid(),'2020-01-01','pending',null)$q$, '42501', '普通用户不能写积分');
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01')$q$, '42501', '普通用户不能执行结算');
select pg_temp.expect_error($q$select public.use_reward('b0000000-0000-0000-0000-000000000001',1,'设备体验卡','天')$q$, '42501', '普通用户不能使用奖励');
select pg_temp.expect_error($q$select public.publish_month(gen_random_uuid(),true)$q$, '42501', '普通用户不能发布');
select pg_temp.expect_error($q$select public.adjust_reward('b0000000-0000-0000-0000-000000000001',1,'设备体验卡','天','伪造')$q$, '42501', '普通用户不能调整奖励');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01')$q$, '42501', '没有真实身份的authenticated不能调用RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(public.is_admin(), '数据库角色授权生效');
select pg_temp.assert_true((select count(*) from public.students) = 2, '管理员可读取私有学生');
select pg_temp.expect_error($q$insert into public.rule_versions(effective_from,config) values('2020-01-01','{}')$q$, '23514', '拒绝不完整规则JSON');
select pg_temp.expect_error($q$insert into public.rule_versions(effective_from,config) select '2020-01-01',jsonb_set(config,'{indicators,0,max}','4') from public.rule_versions limit 1$q$, '23514', '权重总和必须10');
select pg_temp.expect_error($q$insert into public.rule_versions(effective_from,config) select '2020-01-01',config || '{"privateNotes":"不可公开"}' from public.rule_versions limit 1$q$, '23514', '公开规则JSON不能混入私密字段');
select pg_temp.expect_error($q$insert into public.rule_versions(effective_from,config) select '2020-01-01',jsonb_set(config,'{exam,tiers}','[{"minImprovement":5,"bonus":0.5},{"minImprovement":5,"bonus":1}]') from public.rule_versions limit 1$q$, '23514', '考试加分门槛不可重复');
select pg_temp.expect_error($q$update public.rule_versions set effective_from = '2020-01-01'$q$, '42501', '规则不能直接编辑');
select pg_temp.expect_error($q$delete from public.rule_versions$q$, '42501', '规则不能删除');
-- Future changes never leak into today's public rules.
insert into public.rule_versions(effective_from,config)
  select '2099-01-01', config from public.rule_versions where version = 1;
select pg_temp.assert_true((public.get_public_rules()->>'version')::integer = 1, '未来规则尚未生效');
insert into public.rule_versions(effective_from,config)
  select '2020-02-01', jsonb_set(config,'{month,excellentAverage}','9') from public.rule_versions where version = 1;

-- Fake supplied rule is replaced by the authoritative lesson-date version.
insert into public.weekly_records(id,student_id,rule_version_id,lesson_date,status,scores,feedback) values
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',gen_random_uuid(),'2020-01-03','completed','{"understanding":3,"consolidation":3,"transfer":1,"engagement":1}','私密反馈__不可公开'),
  ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001',gen_random_uuid(),'2020-01-10','completed','{"understanding":3,"consolidation":3,"transfer":1,"engagement":1}',''),
  ('c0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001',gen_random_uuid(),'2020-01-17','completed','{"understanding":3,"consolidation":3,"transfer":2,"engagement":1}',''),
  ('c0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001',gen_random_uuid(),'2020-01-24','absent',null,'');
select pg_temp.assert_true((select r.version from public.weekly_records w join public.rule_versions r on r.id=w.rule_version_id where w.id='c0000000-0000-0000-0000-000000000001')=1,'周记录按日期绑定历史版本');
select pg_temp.expect_error($q$update public.weekly_records set rule_version_id=(select id from public.rule_versions where effective_from='2099-01-01') where id='c0000000-0000-0000-0000-000000000001'$q$,'23514','历史周记录版本不可变');
select pg_temp.expect_error($q$update public.weekly_records set scores='{"understanding":4,"consolidation":3,"transfer":2,"engagement":1}' where id='c0000000-0000-0000-0000-000000000001'$q$,'23514','单项积分不得越界');
select pg_temp.expect_error($q$update public.weekly_records set scores='{"understanding":3}' where id='c0000000-0000-0000-0000-000000000001'$q$,'23514','不得遗漏指标');
select pg_temp.expect_error($q$update public.weekly_records set scores='{"understanding":null,"consolidation":3,"transfer":2,"engagement":1}' where id='c0000000-0000-0000-0000-000000000001'$q$,'23514','有效积分不得为JSON null');
select pg_temp.expect_error($q$update public.weekly_records set scores='{"understanding":0,"consolidation":0,"transfer":0,"engagement":0}' where id='c0000000-0000-0000-0000-000000000004'$q$,'23514','请假不可作为零分记录');

insert into public.exams(id, student_id, exam_date, name, score, max_score) values
  ('d0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','2019-12-20','对比考试',60,100),
  ('d0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','2019-12-20','另一个学生考试',70,100);
insert into public.exams(id,student_id,exam_date,name,score,max_score,comparison_id,comparable,notes) values
  ('d0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','2020-01-20','当前考试',65,100,'d0000000-0000-0000-0000-000000000001',true,'私密考试备注__不可公开');
select pg_temp.expect_error($q$update public.exams set comparison_id='d0000000-0000-0000-0000-000000000002' where id='d0000000-0000-0000-0000-000000000003'$q$,'23514','不得对比其他学生考试');
select pg_temp.expect_error($q$update public.exams set exam_date='2020-01-25' where id='d0000000-0000-0000-0000-000000000001'$q$,'23514','不得破坏已关联考试的时间顺序');
select pg_temp.expect_error($q$update public.exams set score=101 where id='d0000000-0000-0000-0000-000000000003'$q$,'23514','成绩不能超过满分');

select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01',null,'','私密本月进步__不可公开','私密改进__不可公开');
select pg_temp.assert_true((select (snapshot->>'validCount')::integer=3 and abs((snapshot->>'average')::numeric - 25::numeric/3)<0.000000000001 and (snapshot->>'examBonus')::numeric=0.5 and snapshot->>'rating'='excellent' from public.monthly_settlements where month='2020-01-01'), '缺课不计零分、完整精度月均分和考试加分');
select pg_temp.assert_true((select jsonb_array_length(snapshot->'weeklyInputs')=4 and jsonb_array_length(snapshot->'examInputs')=1 from public.monthly_settlements where month='2020-01-01'), '结算快照保留输入与对比考试');
select pg_temp.assert_true((select sum(quantity)=1 from public.reward_entries where kind='earned'), '第一次优秀新增1天');
-- Editing source records does not silently rewrite a finalized snapshot.
update public.weekly_records set scores='{"understanding":3,"consolidation":3,"transfer":2,"engagement":2}'
  where id='c0000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select abs((snapshot->>'average')::numeric - 25::numeric/3)<0.000000000001 and revision=1 from public.monthly_settlements where month='2020-01-01'),'源记录修改不自动改变已结算快照');
update public.weekly_records set scores='{"understanding":3,"consolidation":3,"transfer":2,"engagement":1}'
  where id='c0000000-0000-0000-0000-000000000003';
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01')$q$,'23514','重复结算必须显式重算');
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01',null,'试图跳过明确确认','','',null)$q$,'23514','null不能跳过显式重算确认');
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01',null,'','','',true)$q$,'23514','重新结算必须填写原因');
select pg_temp.expect_error($q$select public.settle_month('b0000000-0000-0000-0000-000000000001','infinity')$q$,'23514','结算月份必须有限日期');
select pg_temp.expect_error($q$update public.monthly_settlements set snapshot='{}'$q$,'42501','结算不可由客户端直接篡改');
select pg_temp.expect_error($q$insert into public.reward_entries(student_id,kind,quantity,name,unit) values('b0000000-0000-0000-0000-000000000001','adjustment',99,'设备体验卡','天')$q$,'42501','奖励不可由客户端直接篡改');
select pg_temp.expect_error($q$insert into public.audit_logs(action,entity) values('伪造','students')$q$,'42501','日志不可由客户端伪造');

select public.publish_month((select id from public.monthly_settlements where month='2020-01-01'),true);
select pg_temp.expect_error($q$update public.public_growth set label='姓名泄露'$q$,'42501','公开数据必须通过白名单RPC生成');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) from public.public_growth)=1,'管理员发布后匿名能查看');
select pg_temp.assert_true((select label='2020年01月 · 匿名学习者' and streak=1 from public.public_growth),'公开固定匿名标签与连续优秀');
select pg_temp.assert_true((select count(*) from information_schema.columns where table_schema='public' and table_name='public_growth' and column_name in ('student_id','name','score','scores','snapshot','notes','feedback','strengths'))=0,'公开表无任何敏感列');
select pg_temp.assert_true((select to_jsonb(p)::text not like '%私密%' from public.public_growth p),'公开行无私密姓名、备注、快照内容');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);

-- Re-settlement creates a historical revision; previously earned rewards are
-- retained and not duplicated, even when rating changes.
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01','good','核实调整','','',true);
select pg_temp.assert_true((select count(*) from public.settlement_revisions)=1,'重新结算保存旧版快照');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries where kind='earned')=1,'重新结算不撤销已获奖励');
select pg_temp.assert_true((select published=false from public.public_growth),'重新结算撤回旧公开数据等待明确发布');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-01-01','excellent','恢复确认','','',true);
select pg_temp.assert_true((select sum(quantity) from public.reward_entries where kind='earned')=1,'同一月重复重算不重复发奖');
select pg_temp.assert_true((select count(*) from public.settlement_revisions)=2,'保留每次重算前快照');

insert into public.weekly_records(student_id,rule_version_id,lesson_date,status,scores)
  select 'b0000000-0000-0000-0000-000000000001',gen_random_uuid(),d,'completed','{"understanding":3,"consolidation":3,"transfer":2,"engagement":2}'::jsonb
  from unnest(array['2020-02-03'::date,'2020-02-10'::date,'2020-02-17'::date,'2020-04-03'::date,'2020-04-10'::date,'2020-04-17'::date,'2020-05-03'::date,'2020-05-10'::date,'2020-05-17'::date]) d;
insert into public.exams(student_id,exam_date,name,score,max_score,comparison_id,comparable) values
  ('b0000000-0000-0000-0000-000000000001','2020-02-20','进步考试一',65,100,'d0000000-0000-0000-0000-000000000001',true),
  ('b0000000-0000-0000-0000-000000000001','2020-02-25','进步考试二',65,100,'d0000000-0000-0000-0000-000000000001',true);
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-02-01');
select pg_temp.assert_true((select r.effective_from='2020-02-01' from public.monthly_settlements s join public.rule_versions r on r.id=s.rule_version_id where s.month='2020-02-01'),'月度使用月初有效版本');
select pg_temp.assert_true((select (snapshot->>'examBonus')::numeric=1 and (snapshot->>'total')::numeric=11 from public.monthly_settlements where month='2020-02-01'),'两场各0.5相加封顶1且综合分支持11');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries where kind='earned')=3,'连续优秀第二个月新增2天');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-03-01');
select pg_temp.assert_true((select snapshot->>'rating'='pending' and snapshot->>'average' is null and (snapshot->>'examBonus')::numeric=0 from public.monthly_settlements where month='2020-03-01'),'无记录月份待评估、不记零分、不罚无考试');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-04-01');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-05-01');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries where kind='earned')=9,'待评估暂停连续优秀且第四次优秀奖励封顶3天');
select public.publish_month((select id from public.monthly_settlements where month='2020-05-01'),true);
select pg_temp.assert_true((select streak=4 from public.public_growth where month='2020-05-01'),'公开连续优秀跳过待评估月份');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-06-01','good','有效评估手动调整');
select public.settle_month('b0000000-0000-0000-0000-000000000001','2020-07-01','excellent','特殊授课情况确认');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries where kind='earned')=10,'非优秀重置连续优秀但不撤销奖励');
select public.use_reward('b0000000-0000-0000-0000-000000000001',2,'设备体验卡','天','已使用');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries)=8,'使用奖励记负数且余额正确');
select pg_temp.expect_error($q$select public.use_reward('b0000000-0000-0000-0000-000000000001',9,'设备体验卡','天')$q$,'23514','余额不足不能使用');
select pg_temp.expect_error($q$select public.use_reward('b0000000-0000-0000-0000-000000000001',-1,'设备体验卡','天')$q$,'23514','不能用负数虚增奖励');
select pg_temp.expect_error($q$select public.use_reward('b0000000-0000-0000-0000-000000000001',1,'其他奖励','天')$q$,'23514','不同名称单位的奖励余额不能混用');
select pg_temp.expect_error($q$select public.adjust_reward('b0000000-0000-0000-0000-000000000001',2,'设备体验卡','天','')$q$,'23514','手动调整必须填写原因');
select pg_temp.expect_error($q$select public.adjust_reward('b0000000-0000-0000-0000-000000000001',0,'设备体验卡','天','零值')$q$,'23514','手动调整必须非零');
select public.adjust_reward('b0000000-0000-0000-0000-000000000001',2,'设备体验卡','天','核实历史结算补发');
select public.adjust_reward('b0000000-0000-0000-0000-000000000001',-1,'设备体验卡','天','核实后修正');
select pg_temp.assert_true((select sum(quantity) from public.reward_entries)=9,'正负调整进入独立账本并更新余额');
select pg_temp.assert_true((select count(*) from public.reward_entries where kind='adjustment' and length(note)>0)=2,'手动调整原因保存在私密账本');
select pg_temp.expect_error($q$select public.adjust_reward('b0000000-0000-0000-0000-000000000001',-10,'设备体验卡','天','超出余额')$q$,'23514','手动调整不得使余额小于零');
select pg_temp.expect_error($q$select public.adjust_reward('b0000000-0000-0000-0000-000000000001',-1,'其他奖励','天','名称不同')$q$,'23514','不同奖励的调整不能混用余额');
select pg_temp.assert_true((select count(*) from public.audit_logs where entity='monthly_settlements')>=9,'关键操作均生成审计记录');
select pg_temp.assert_true((select bool_and(detail::text not like '%私密%') from public.audit_logs),'审计元数据不复制私密反馈');
-- Custom tiers select the highest threshold, not the numerically largest bonus.
insert into public.rule_versions(effective_from,config)
  select '2020-08-01',jsonb_set(config,'{exam,tiers}','[{"minImprovement":5,"bonus":1},{"minImprovement":10,"bonus":0.25}]')
    from public.rule_versions where version=1;
insert into public.exams(student_id,exam_date,name,score,max_score,comparison_id,comparable) values
  ('b0000000-0000-0000-0000-000000000002','2020-08-20','自定义档位考试',85,100,'d0000000-0000-0000-0000-000000000002',true);
select public.settle_month('b0000000-0000-0000-0000-000000000002','2020-08-01');
select pg_temp.assert_true((select (snapshot->>'examBonus')::numeric=0.25 from public.monthly_settlements where student_id='b0000000-0000-0000-0000-000000000002' and month='2020-08-01'),'每场考试选择最高适用门槛而非最大加分');
insert into public.rule_versions(effective_from,config)
  select '2020-09-01',jsonb_set(config,'{exam,tiers}','[]') from public.rule_versions where version=1;
select public.settle_month('b0000000-0000-0000-0000-000000000002','2020-09-01');
select pg_temp.assert_true((select (snapshot->>'examBonus')::numeric=0 from public.monthly_settlements where student_id='b0000000-0000-0000-0000-000000000002' and month='2020-09-01'),'允许空档位关闭考试加分');
-- Explicit unpublishing hides the row, not only a frontend toggle.
select public.publish_month((select id from public.monthly_settlements where month='2020-05-01'),false);
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*) from public.public_growth)=0,'取消公开后匿名RLS不可读取');
reset role;

rollback;
