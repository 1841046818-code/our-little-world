# Supabase 配置说明

项目用 Supabase 提供登录、Postgres 数据库、实时推送和私有 Storage。前端只配置 Project URL 和公开 anon/publishable key；严禁将 `service_role`/secret key、数据库密码或其他服务器密钥放到 `.env.local`。

## 初始化项目

1. 创建自己的 Supabase 项目，在项目 API 设置中复制 Project URL 和公开 anon/publishable key。
2. 在仓库根目录复制 `.env.example` 为 `.env.local`，填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。使用地图时还要填写高德两项，见根目录 [GitHub 使用说明](../GITHUB使用说明.md)。
3. 在 Dashboard > SQL Editor 依序执行：

   - `migrations/202611130001_couple_space.sql`
   - `migrations/202611140001_couple_photos.sql`
   - `migrations/202611160001_recycle_bin.sql`
   - `migrations/202611180001_memory_albums.sql`

   这些迁移创建情侣空间、共享内容、成员位置、自定义相册、RLS 策略和私有文件桶。若项目中已有同名表或策略，先审查 SQL 再执行。
4. 在 Authentication > URL Configuration 中设置正式网站 Site URL，并将正式网站、`http://localhost:5173/**` 和 Android 回调 `com.littleworld.couple://auth-callback` 加到 Redirect URLs。注册邮件不能送达时，为 Auth 配置自己的 SMTP。
5. 首次运行后两位用户分别注册；一位创建情侣空间，另一位使用邀请码加入。

## AI 关怀文案（可选）

AI 功能不配置也不影响其他功能。`care-ai` 使用 OpenAI Chat Completions 兼容 API。在 Dashboard > Edge Functions > Secrets 设置：

- `AI_BASE_URL`：HTTPS API 基础 URL，例如 `https://api.example.com/v1`，不要追加 `/chat/completions`。
- `AI_API_KEY`：AI 服务商密钥。
- `AI_MODEL`：该密钥可调用的模型名。

安装并登录 Supabase CLI，关联项目后部署：

```powershell
npx supabase login
npx supabase link --project-ref 你的项目编号
npx supabase functions deploy care-ai --use-api
```

密钥只保留在 Edge Function Secrets，不能放进前端。用户主动点按 AI 文案时，前端只发送最近的经期开始日期（最多八条）、日期和时段；Edge Function 验证登录及情侣空间成员身份，并限制请求频率。

## 回收站自动清理（可选）

共享内容在回收站保留七天。前端会在用户操作时处理过期项目；如需后台每小时自动清理，先部署 `purge-trash`：

```powershell
npx supabase functions deploy purge-trash --use-api
```

然后在 Supabase Dashboard 的 Vault 中创建两个解密后可读取的 Secret：

- `project_url`：Supabase Project URL，例如 `https://你的项目编号.supabase.co`。
- `secret_key`：当前 Supabase 项目的 server-side secret key。仅供 Vault 里的定时任务调用 Edge Function，绝不能暴露给浏览器或 APK。

最后在 SQL Editor 执行 `migrations/202611160002_schedule_trash_cleanup.sql`。该迁移启用 `pg_cron`、`pg_net` 和 `supabase_vault` 扩展，并建立每小时调用 `purge-trash` 的任务。此功能需要 Supabase 项目支持相应扩展；不需要自动清理时，不执行该迁移即可。

## 位置共享

每位成员都要在自己的设备允许定位。网站必须使用 HTTPS（本地 localhost 可调试）；Android App 使用系统定位权限，不需要额外地图或定位 API。地图显示需要另外配置高德 Web JS API Key 和安全密钥。退出登录时应用会停止定位并删除该成员当前的位置记录；两分钟以上的位置视为离线。

## 本地预览

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

把自己的 Supabase 公共 URL/key 填入 `.env.local` 后再启动。没有 Supabase 配置时应用处于本地演示模式，不会连接 Supabase。改动环境变量后需重启 Vite；网站和 Android APK 都需要重新构建才能带入新配置。
