# GitHub 使用说明

本文说明如何把本项目复制到自己的 GitHub 仓库、配置后运行网页，以及构建 Android 手机安装包。仓库不包含任何可直接连接到作者服务的 API 凭据或 APK；每位使用者都需要配置自己的服务。

## 1. 获取项目

在 GitHub 新建一个空仓库，然后在本机项目目录执行：

```powershell
git init
git add .
git status --short
git commit -m "Initial public release"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

推送前检查 `git status` 和待提交文件。`.env.local`、音乐文件、个人方案文档、APK、Android 构建目录和签名密钥已加入忽略规则；不要使用 `git add -f` 强行提交这些文件。

## 2. 环境要求

- Node.js 22 或更新的兼容版本
- npm（随 Node.js 安装）
- Android 原生构建：JDK 21、Android SDK Platform 36 和 Build Tools 36
- 使用地图：自己的高德 Web JS API Key 和安全密钥
- 账号、同步、文件上传：自己的 Supabase 项目

## 3. 配置 Supabase

1. 在 Supabase 创建一个新项目。
2. 将项目根目录的 `.env.example` 复制为 `.env.local`。
3. 在 Supabase 项目设置中取得 Project URL 和公开 anon/publishable key，填入本机 `.env.local` 的 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
4. 依次在 Supabase SQL Editor 执行 `supabase/migrations/` 下的迁移文件，按文件名时间顺序执行。
5. 配置 Supabase Auth 的 Site URL 和 Redirect URLs 为自己的本地地址及正式 HTTPS 地址，并按需要设置邮件验证与邮件服务。
6. 在 Supabase 项目中启用数据库 Realtime。迁移会创建相应表、RLS 策略和私有 Storage bucket；部署到已有项目前先检查迁移内容，避免与现有同名对象冲突。

详细服务配置和可选 Edge Functions 说明见 [`supabase/README.md`](supabase/README.md)。AI 关怀建议是可选功能；使用时把 AI 服务凭据配置在 Supabase Edge Function Secrets 中，不要放进前端环境变量。

## 4. 配置地图

在高德开放平台创建 Web JS API Key 和安全密钥，在本机 `.env.local` 中填写 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_CODE`。按高德控制台要求，把自己的网页域名加入允许列表。Android 原生 WebView 使用 Capacitor 默认本地来源；若调整了 `capacitor.config.json` 的 hostname，也要按高德平台规则配置对应来源。

高德 Key 会进入前端构建产物，不能当作服务端秘密。请在高德控制台限制 Key 的用途和来源。没有配置高德 Key 时，地图功能不会加载。

## 5. 本地运行网页

```powershell
npm ci
Copy-Item .env.example .env.local
# 编辑 .env.local，填写自己的 Supabase 和高德配置
npm run dev
```

Vite 会输出本地访问地址。要构建静态网页：

```powershell
npm run build
npm run preview
```

发布目录为 `dist`。部署到服务器时使用 HTTPS，并将正式网页地址添加到 Supabase Auth 允许的回调地址。Nginx 示例在 `deploy/`；其中的域名和 `YOUR_PROJECT_ID` 都是占位符，使用前必须替换。

## 6. Android 手机版

Android 原生项目位于 `android/`，应随源码一起提交。APK 是构建产物，不提交到 GitHub；每个人用自己的环境变量构建。Debug APK 适用于个人测试，不是 Google Play 商店签名包。

在 Windows PowerShell 中：

```powershell
npm ci
Copy-Item .env.example .env.local
# 编辑 .env.local 并填入自己的配置
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

生成的 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。将 APK 传到 Android 手机上安装；如系统提示，允许从当前文件管理器安装未知来源应用。应用定位需要用户在手机上授权，后台定位行为也受系统省电策略影响。

签名发布包前，应创建并妥善备份自己的 Android keystore，将签名密码放在本机或 CI 的加密 Secrets 中。不要把 `.jks`、`.keystore`、密码或签名配置提交到仓库。Debug 包和 Release 包的签名不同，可能无法直接覆盖安装；切换签名时可能需要先卸载旧包。

## 7. iPhone / iPad

当前仓库包含 Android 原生工程，没有生成好的 iOS Xcode 工程。网页可以通过 iPhone Safari 打开并添加到主屏幕；如需原生 iOS 安装包，需要在 macOS 上安装 Xcode、添加 Capacitor iOS 平台并配置 Apple 开发者签名与定位权限。iOS 构建和上架需要使用自己的 Apple 开发者账号。

## 8. 发布前的隐私与安全检查

- 只在本机 `.env.local` 中填写项目自己的配置，不要提交任何 `.env` 文件。
- 前端只能使用 Supabase anon/publishable 公钥；`service_role`、数据库密码、AI API Key 和 Vault 密钥只能放在 Supabase 服务端 Secrets/Vault。
- 确认 Supabase RLS、Storage policies 和 Auth 回调地址适合自己的项目。
- 仓库忽略 APK、用户上传文件、私人音乐、签名文件及构建输出；提交前再检查 `git status --short`。
- 只发布自己拥有或获准公开的图片、字体、音乐、商标及其他素材。
- 仓库使用根目录 `LICENSE` 中的 MIT License；如果公开素材有不同授权要求，应单独标明。
