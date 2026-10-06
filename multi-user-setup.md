# Reading Garden 多用户设置

网站已经准备好独立账号注册和同步。GitHub 部署不能自动修改 Supabase 项目的数据库和认证设置；完成以下步骤后，朋友才能注册并同步自己的记录。

## 1. 升级数据库权限

打开项目：
https://supabase.com/dashboard/project/oonwggwdcywukwshwbxx/sql/new

打开 `setup.sql`，复制全部内容，粘贴到 SQL Editor 并点击 Run。

这是在原表上升级权限，不会删除原账号的数据。每条数据只能由 `auth.uid()` 对应的账号读取或写入；匿名访问不允许读取文献或笔记。写入函数继续检查 revision，防止手机和电脑同时编辑时静默覆盖。

运行成功后，在 SQL Editor 检查：

```sql
select public.reading_garden_capabilities();
```

应返回 `{"multiUser": true, "version": 2}`。

## 2. 设置网站地址

在 Authentication → URL Configuration 中，把 Site URL 设置为：

https://shannchen.github.io/reading-garden/

在 Redirect URLs 中加入同一个完整地址，保存。

## 3. 配置注册确认邮件

若朋友要在网站上自行注册并确认邮箱，在 Authentication 的邮件设置中配置 Custom SMTP，使用你自己的邮件发送服务。保留 Confirm email 开启。

Supabase 默认邮件服务只向项目团队成员发送邮件，无法直接给普通朋友发送确认邮件。邮件服务的 SMTP 凭据只填入 Supabase 后台，不要提交到 GitHub，也不用发到聊天里。

官方说明：https://supabase.com/docs/guides/auth/auth-smtp

## 4. 开放注册

在 Authentication → Sign In / Providers（或对应的 Authentication 设置页面）中：

- 开启 Allow new users to sign up。
- 开启 Email provider。
- 保留 Confirm email 开启。
- 保持 Allow anonymous sign-ins 关闭。

保存设置。未配置邮件服务时，网站可能提示确认邮件暂时不可用。

## 5. 使用和检查

1. 你先用原账号登录，确认原来的文献、Ideas、People 和星标仍在。
2. 朋友打开网站，点击 Sign in / Register → New here? Create an account。
3. 输入邮箱、密码和确认密码，打开确认邮件中的链接，然后登录。
4. 新账号应拥有自己的空文献库，不能看到你的文献或私人笔记。New Papers 是大家共用的公开文章来源。
5. 朋友在电脑保存一篇文献，再在手机登录同一账号，检查同步。

原有浏览器本地记录不会自动合入新账号。需要时，由当前账号自行点击 Import local records 或 Import Backup 导入。只导入属于自己的记录。

如果暂时只想先给一个朋友使用，也可以在 Supabase 的 Authentication → Users → Add user / Create new user 中由管理员创建并确认账号，再让朋友直接登录；无需先开放公共注册。账号仍受同样的数据库隔离权限保护。

## 已验证与待验证

自动测试使用模拟 Supabase API，覆盖账号隔离、旧账号缓存保留、注册校验和邮箱确认两种返回、旧请求不能串账号、并发合并、离线本地缓存和退出登录。数据库脚本需要在你的 Supabase 项目执行后，按以上步骤验证实际 RLS 和邮件投递；仓库部署不等于后台设置完成。
