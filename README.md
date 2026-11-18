# 我们的小宇宙

一款供两个人共同使用的情侣空间。网页使用 React 和 Vite 构建，账号、共享数据、实时更新和私密文件由 Supabase 提供。

源码获取、Supabase 初始化、网站部署和安卓安装包构建步骤见[使用说明](GITHUB使用说明.md)。

## 本地运行

需要 Node.js 22.12 或更高版本，也可以使用 20.19 或更高版本的 Node.js 20。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

在项目根目录的 `.env.local` 中填写 Supabase 项目网址和公开访问密钥。地图功能还需要填写高德地图网页 JS API 密钥和安全密钥。不使用地图时，高德配置可以留空。不要把 Supabase 服务端密钥（`service_role`）或 AI 服务密钥写入前端环境变量。

首次配置 Supabase 时，按顺序在 SQL 编辑器中执行 `supabase/migrations/` 目录里的数据库迁移，并参考 [Supabase 配置说明](supabase/README.md)配置用户登录、文件存储、实时更新和边缘函数。

若页面提示找不到 `public.memory_albums`，请在 Supabase 的 SQL 编辑器中执行 `supabase/migrations/202611180001_memory_albums.sql`。该数据表用于自定义相册分类；其他共享记录仍使用 `shared_entries` 同步。

正式构建会隐藏仅供本地开发使用的演示空间入口和内置示例记录。部署网站前，必须配置自己的 Supabase 项目网址和公开访问密钥。

## 部署网页

运行 `npm run build` 构建网站，生成的文件位于 `dist` 目录。构建前，先在本地 `.env.local` 或服务器构建环境中填写 `.env.example` 中的 `VITE_` 配置。Nginx 示例配置见 `deploy/nginx-little-world.conf`。如果用户所在网络无法直接连接 Supabase，可参考 `deploy/nginx-supabase-proxy.conf`，在网站的 HTTPS 配置中添加代理规则，让网页通过同一域名访问 Supabase 的登录、数据库、文件、边缘函数和实时更新服务。最后将正式网站地址加入 Supabase 用户登录配置中的网站地址和允许回调地址。

## 手机上使用

先将网站部署到 HTTPS 地址，并完成 Supabase 在线登录配置，再用手机浏览器打开网站。安卓手机可以从 Chrome 菜单选择安装或添加到主屏幕；iPhone 和 iPad 可以在 Safari 的分享菜单中选择“添加到主屏幕”。安卓安装包的构建方法见下方说明。

### Android APK

安卓安装包使用 Capacitor 后台定位。登录并允许定位和通知后，应用切到后台时会显示持续通知并继续同步位置；退出账号会停止定位并清除该成员的位置记录。Android 13 及更新版本需要允许通知，才能显示持续定位通知。

小米手机安装后，请在系统应用设置中允许定位和通知，并将电池策略设为“无限制”或允许后台运行。省电策略、强行停止、关机或关闭系统定位仍可能中断位置更新。浏览器版只在网页活跃时尽力共享位置，不提供后台持续定位保证。

请先安装 Node.js、JDK 21，以及 Android SDK 平台 36 和构建工具 36.0.0，然后运行：

```powershell
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 中填入自己的 Supabase 项目网址和公开访问密钥
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

安装包生成在 `android/app/build/outputs/apk/debug/app-debug.apk`。这是用于测试的安装包，不是应用商店发布版；正式发布需要使用自己的安卓签名密钥重新签名。

## 公开仓库前检查

- `.env.local`、Supabase 服务端密钥、用户数据和存储文件不得提交。
- 只提交你拥有或已获准公开的图片、音乐、字体和其他素材。根目录的本地音乐文件已由 `.gitignore` 排除。
- 项目使用根目录 `LICENSE` 文件中注明的 MIT 许可证发布。
- Supabase 公开访问密钥会包含在网页构建文件中。数据安全依赖数据库行级安全策略（RLS）和文件存储访问策略；不要把公开密钥误当成服务端密钥。

## 检查

```powershell
npm run build
npm run preview
```
