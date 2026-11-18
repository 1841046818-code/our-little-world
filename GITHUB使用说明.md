# 从源码部署网站和 Android App

本指南针对这个仓库：<https://github.com/1841046818-code/our-little-world>。部署者需要使用自己的 Supabase 项目和 API 配置；仓库不包含作者的服务密钥、用户数据或可直接使用的正式安装包。

## 先准备什么

| 用途 | 必需？ | 需要准备 |
| --- | --- | --- |
| 登录、情侣空间、实时同步、照片和音乐 | 必需 | 自己的 Supabase Project URL 和公开 anon/publishable key |
| 地图和地点搜索 | 可选 | 高德 Web JS API Key 和安全密钥 |
| AI 关怀文案 | 可选 | 兼容 OpenAI Chat Completions 的 HTTPS 服务、API Key、模型名 |
| 获取手机定位 | 不需要额外 API | 手机系统定位权限；Android 原生包使用系统定位能力 |

照片、音乐文件存储在 Supabase Storage，不需要另外买文件存储 API。项目也不需要 Firebase 或 Google Maps API。Supabase `service_role`、数据库密码、AI API Key 和签名密钥都不能放进前端 `.env.local`。

## 1. 下载源代码

安装 Git 后，在 PowerShell 里运行：

```powershell
git clone https://github.com/1841046818-code/our-little-world.git
cd our-little-world
npm ci
```

本地网页开发需要 Node.js 22.12+（或 20.19+ 的 20.x 版本）。生成 Android APK 还需要 JDK 21、Android Studio，以及 Android SDK Platform 36 和 Build Tools 36.0.0。用 Android Studio 的 SDK Manager 安装 SDK；首次 Gradle 构建会下载其余 Android 构建依赖。

## 2. 创建并初始化 Supabase

1. 在 Supabase 创建自己的项目，记下 Project URL 和公开的 anon/publishable key。可在项目的 Connect/API 设置页找到。不要复制 `service_role`/secret key 到网站。
2. 在 Supabase Dashboard 的 SQL Editor 中，按文件名顺序执行以下迁移：

   ```text
   supabase/migrations/202611130001_couple_space.sql
   supabase/migrations/202611140001_couple_photos.sql
   supabase/migrations/202611160001_recycle_bin.sql
   supabase/migrations/202611180001_memory_albums.sql
   ```

   每个文件执行成功后再执行下一个。`202611160002_schedule_trash_cleanup.sql` 是可选的自动清理任务，配置方式见 [Supabase 配置说明](supabase/README.md)。
3. 打开 Supabase Authentication 的 URL Configuration：Site URL 填正式网站地址；Redirect URLs 至少加入正式地址（例如 `https://你的域名/**`）、本地调试地址 `http://localhost:5173/**` 和 Android 登录回调 `com.littleworld.couple://auth-callback`。
4. 若注册邮件无法送达，在 Authentication 的邮件设置中配置自己的 SMTP 服务。两位使用者都注册后，一人创建情侣空间，另一人用邀请码加入。

## 3. 配置 API 和环境变量

复制模板：

```powershell
Copy-Item .env.example .env.local
```

打开项目根目录 `.env.local`，填写：

```env
VITE_SUPABASE_URL=https://你的项目编号.supabase.co
VITE_SUPABASE_ANON_KEY=你的公开anon或publishable_key
VITE_AMAP_KEY=你的高德Web_JS_API_Key
VITE_AMAP_SECURITY_CODE=你的高德安全密钥
```

Supabase 两项是登录、数据库同步、照片和音乐功能的必需配置。高德两项只在使用地图功能时需要；Key 的平台类型要选 Web 端（JS API），并在高德控制台限制允许的域名/来源。项目使用 `VITE_` 前缀，所以这些值会被编进网页和 APK，不能把任何服务端秘密填在这里。特别是高德 Key/安全密钥，应在高德控制台限制用途与来源；需要更强保护时应改为服务端代理方案。

修改 `.env.local` 后，重启本地 Vite 服务；部署网站或生成 APK 前也必须先填好该文件，因为静态网页和 APK 不会在运行时读取服务器上的 `.env.local`。

## 4. 本地运行网页

```powershell
npm run dev
```

按 Vite 输出的地址打开网页，通常是 `http://localhost:5173`。登录、实时同步与上传需要已初始化的 Supabase 项目；浏览器定位在 localhost 可测试。生产网站必须使用 HTTPS 才能请求浏览器定位。

## 5. 部署网站

网站是 Vite 静态站点。设置好 `.env.local` 后运行：

```powershell
npm run build
```

如果部署到自己的服务器，先把域名的 DNS A 记录指向服务器公网 IP，并确认防火墙开放 80/443。Windows PowerShell 可上传构建结果：

```powershell
scp -r dist/* root@你的服务器IP:/var/www/little-world/
```

在服务器上安装 Nginx，把 `deploy/nginx-little-world.conf` 复制为站点配置；将 `server_name` 改成自己的域名、`root` 指向 `/var/www/little-world`，然后检查并重载 Nginx。配置 HTTPS 证书后再开放给手机使用。Nginx 的 `try_files $uri $uri/ /index.html;` 要保留，以支持前端路由。若所在网络无法直连 Supabase，可参考 `deploy/nginx-supabase-proxy.conf` 配置同域代理，并将 `.env.local` 中的 Supabase URL 改为应用域名；先替换示例里的项目编号。静态托管平台则把 `dist/` 内容设为发布目录，并启用 SPA fallback（所有未知页面路径回退到 `index.html`）。

每次改动前端配置或代码都要重新执行 `npm run build`，再把新的 `dist/` 发布到服务器。将正式 HTTPS 地址加入 Supabase Auth 的 Site URL 和 Redirect URLs。

## 6. 构建 Android 安装包

Android App 将网页代码打包在 APK 内，不是单独部署在服务器上的服务。先在项目根目录确认 `.env.local` 是该 App 要连接的 Supabase/高德项目，然后运行：

```powershell
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

测试安装包在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

把 APK 传到小米手机安装；若系统提示，允许当前文件管理器安装未知来源应用。手机系统设置里给 App 开启定位权限，并允许后台运行/关闭电池限制；小米省电管理可能影响后台位置更新。首次登录注册邮件会跳回 App，因此 Supabase Redirect URLs 必须包含 `com.littleworld.couple://auth-callback`。定位由手机系统和 App 权限提供，不需要单独购买定位 API。

Debug APK 适合自己测试。正式分发或上架前，在 Android Studio 生成签名的 Release APK/AAB，并保管好自己的 keystore 和密码；不要提交到 GitHub。更改 Supabase、高德配置或网页代码后，需要重新 build、`cap sync` 并生成新的 APK。

## 7. 可选 AI API

不配置 AI API 不影响登录、情侣空间、同步、地图、照片或音乐；只会无法使用 AI 关怀文案。项目通过 Supabase Edge Function 调用兼容 OpenAI Chat Completions 的服务。在 Supabase Dashboard 的 Edge Functions > Secrets 中配置：

```text
AI_BASE_URL=https://你的兼容服务地址/v1
AI_API_KEY=服务商发放的密钥
AI_MODEL=该密钥可调用的模型名称
```

`AI_BASE_URL` 填 API 基础地址，不要在末尾追加 `/chat/completions`。然后部署项目中的 `supabase/functions/care-ai` Edge Function。可安装 Supabase CLI 并登录、关联自己的项目后运行：

```powershell
npx supabase login
npx supabase link --project-ref 你的项目编号
npx supabase functions deploy care-ai --use-api
```

AI Key 只保存在 Supabase Edge Function Secrets，绝不可放进 `.env.local`。更完整的说明和可选回收站清理配置见 [Supabase 配置说明](supabase/README.md)。

## 发布前检查

- 确认 `.env.local`、Supabase 私钥、AI Key、数据库密码、APK、keystore、用户数据和上传文件都没有加入 Git。
- Supabase 前端公开 key 本来就会出现在网页/APK 中；访问安全依赖项目自带的 RLS 和 Storage policies，切勿用 `service_role` 替代。
- 检查 Supabase Auth 回调地址、网站 HTTPS、地图 Key 来源限制，并用两个新账号测试创建/加入情侣空间和实时同步。
- Android 原生 iOS 工程不在此仓库中。iPhone 可用 Safari 添加网站到主屏幕；原生 iOS 包需 macOS、Xcode 和 Apple 签名。
