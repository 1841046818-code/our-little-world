# 我们的小宇宙

一款供两个人共同使用的情侣空间。前端使用 React 和 Vite，账号、共同数据、实时推送与私有文件由 Supabase 提供。

GitHub 获取、Supabase 初始化、网页运行与 Android APK 安装/构建步骤见 [GitHub 使用说明](GITHUB使用说明.md)。

## 本地运行

需要 Node.js 22.12 或更高版本（或 20.19 及更高的 20.x 版本）。

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

在 `.env.local` 中填写 Supabase Project URL、公开 anon/publishable key，以及可选的高德地图 Web JS Key 和安全密钥。不要将 Supabase `service_role` key 或 AI 服务密钥放进前端环境变量。

首次配置 Supabase 时，按顺序执行 `supabase/migrations/` 中的 SQL 迁移，并按 [Supabase 配置说明](supabase/README.md)配置 Auth、Storage、Realtime 和 Edge Functions。

若页面提示找不到 `public.memory_albums`，请在 Supabase SQL Editor 执行 `supabase/migrations/202611180001_memory_albums.sql`。该表用于自定义相册分类；共同记录会继续使用 `shared_entries` 同步。

生产构建会隐藏仅用于本地开发的演示空间入口和内置示例记录。上线时必须在托管平台配置真实 Supabase 公共 URL 和 anon/publishable key。

## 部署网页

构建命令为 `npm run build`，发布目录为 `dist`。在服务器环境变量或本地 `.env.local` 中设置 `.env.example` 里的 `VITE_` 配置后再构建。Nginx 示例配置见 `deploy/nginx-little-world.conf`。若客户端所在网络无法直连 Supabase，请在域名的 HTTPS `server` 块中加入 `deploy/nginx-supabase-proxy.conf` 的路由；应用会通过同域名请求 Auth、REST、Storage、Functions 和 Realtime。将正式地址加入 Supabase Auth 的 Site URL 和 Redirect URLs。

## 手机上使用

先部署到 HTTPS 地址并完成线上 Supabase 登录配置，再用手机浏览器打开该地址。Android 可从 Chrome 菜单安装/添加到主屏幕；iPhone/iPad 可在 Safari 分享菜单中选择“添加到主屏幕”。当前原生 Android APK 需要按下方 Android 说明构建。

### Android APK

安装包使用 Capacitor 后台定位。登录并允许定位、通知后，应用切到后台时会显示持续通知并继续同步位置；退出账号会停止定位并清除该成员的位置记录。Android 13 及以上需要允许通知，才能显示持续定位通知。

小米手机安装后，请在系统应用设置中允许定位和通知，并将电池策略设为“无限制”或允许后台运行。省电策略、强行停止、关机或关闭系统定位仍可能中断位置更新。浏览器版只在网页活跃时尽力共享位置，不提供后台持续定位保证。

在已安装 Node.js、JDK 21+ 和 Android SDK（Platform 36、Build Tools 36.0.0）的环境中：

```powershell
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 填入正式 Supabase 公共 URL 和 anon key
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。这是个人安装测试包，不是 Play 商店发布签名包。

## 公开仓库前检查

- `.env.local`、Supabase 服务端密钥、用户数据和 Storage 文件不得提交。
- 只提交你拥有或已获准公开的图片、音乐、字体和其他素材。根目录的本地音乐文件已由 `.gitignore` 排除。
- 项目按根目录 `LICENSE` 中的 MIT License 发布。
- Supabase 前端 anon/publishable key 会出现在浏览器构建产物中，必须依靠正确的 RLS 和 Storage policies 限制数据访问；不要把它当作服务端密钥。

## 检查

```powershell
npm run build
npm run preview
```
