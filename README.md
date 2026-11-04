<div align="center">
  <img src="./public/logo.svg" width="108" height="108" alt="AIFileBox Logo" />
  <h1>AIFileBox</h1>
  <p><strong>本地优先的 AI 智能文件分类、重命名与归档桌面工作台</strong></p>
  <p>
    <a href="./README.md">简体中文</a> ·
    <a href="./docs/README.zh-TW.md">繁體中文</a> ·
    <a href="./docs/README.en.md">English</a> ·
    <a href="./docs/README.ja.md">日本語</a> ·
    <a href="./docs/README.ko.md">한국어</a> ·
    <a href="./docs/README.es.md">Español</a> ·
    <a href="./docs/README.fr.md">Français</a> ·
    <a href="./docs/README.de.md">Deutsch</a>
  </p>
  <p>
    <a href="https://github.com/qjr87/AIFileBox/releases/latest">
      <img src="https://img.shields.io/github/v/release/qjr87/AIFileBox?style=flat-square&label=Release&color=e04f44" alt="Latest Release" />
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-3a9b6e?style=flat-square" alt="License" />
    </a>
    <img src="https://img.shields.io/badge/Tauri-v2-4a7fd4?style=flat-square" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-e8962e?style=flat-square" alt="Platform" />
  </p>
</div>

---

## 📥 下载安装（Windows / macOS）

前往 [**GitHub Releases 下载页面**](https://github.com/qjr87/AIFileBox/releases/latest) 获取最新安装包：

| 平台 | 架构 | 安装包格式 | 说明 |
| :--- | :--- | :--- | :--- |
| **Windows** | `x64` (64-bit) | `.exe` (NSIS) | 支持 Windows 10 / 11，双击即可安装 |
| **macOS (Apple Silicon)** | `aarch64` (M1/M2/M3/M4) | `.dmg` / `.app.tar.gz` | 适用于 Apple 芯片 Mac |
| **macOS (Intel)** | `x86_64` | `.dmg` / `.app.tar.gz` | 适用于 Intel 芯片 Mac |

> **macOS 首次打开提示**：由于开源应用未进行 Apple 商业公证，若首次启动提示“无法验证开发者”或“已损坏”，请在终端执行：
> ```bash
> sudo xattr -rd com.apple.quarantine "/Applications/AIFileBox.app"
> ```

---

## ✨ 核心特性

- **🤖 AI 智能分类与批量重命名**
  - 支持直接拖入散落文件或整个项目/剧集/下载文件夹，自动递归扫描全部子文件。
  - 自动识别广告前缀、冗余嵌套层级，生成清晰的**归档与重命名执行计划**，人工确认后再执行。
  - 支持限定参与分析的目标文件库范围，大幅节省 Token 用量并提升分类准确率。
- **📚 多文件库与分层 Markdown 规则体系**
  - 将本机任意文件夹登记为「文件库」，支持在应用内随时改名、调整目录层级或迁移文件库位置。
  - 支持**全局总规则**（`总说明.md`）+ **文件库根规则**（`_规则.md`）+ **任意子文件夹专属规则**，并支持一键让 AI 根据目录现有结构生成规则草稿。
- **🔌 多协议模型支持（云端 + 本地离线）**
  - 原生支持 **OpenAI / 兼容接口**（DeepSeek、通义千问、硅基流动、OneAPI 等）、**Anthropic Claude**、**Google Gemini** 以及本地 **Ollama**（无需 API Key 即可离线运行）。
  - 内置完整的 AI 请求与 Token 消耗统计面板（输入、输出、缓存命中、耗时与报文详情）。
- **🛡️ 安全第一的本地文件操作**
  - **绝不静默覆盖**：同名冲突自动检测，支持 SHA-256 采样指纹比对与重复文件安全清理。
  - **可追溯、可撤销**：所有移动/复制操作均记录在本地 SQLite 数据库并校验文件签名，支持一键安全撤销回退。
  - **系统级密钥保护**：API Key 存储在操作系统原生凭据库（Windows Credential Manager / macOS Keychain），绝不写入代码仓库。
- **🌍 多语言支持（8 种主流语言）**
  - 内置简体中文、繁體中文、English、日本語、한국어、Español、Français、Deutsch，可在「设置 → 通用偏好」一键即时切换。

---

## 🛠️ 技术栈

- **桌面外壳与后端**：[Tauri 2](https://v2.tauri.app/) + Rust + SQLite (`rusqlite`) + OS Keyring (`keyring`)
- **前端界面**：React 19 + TypeScript + Tailwind CSS 4 + Vite

---

## 🚀 本地开发与构建

### 环境要求

- **Node.js** >= 20
- **Rust** >= 1.80（通过 [rustup](https://rustup.rs/) 安装）
- Windows 需安装 Microsoft C++ 生成工具与 WebView2；macOS 需安装 Xcode Command Line Tools。

### 启动开发环境

```bash
# 1. 安装前端依赖
npm install

# 2. 启动 Tauri 桌面开发模式
npm run tauri -- dev
```

### 编译打包

```bash
# 仅构建前端与校验类型
npm run build

# 校验 Rust 后端
cargo check --manifest-path src-tauri/Cargo.toml

# 打包桌面安装包（Windows 生成 .exe，macOS 生成 .dmg/.app）
npm run tauri -- build
```

---

## 🔒 隐私与安全说明

- 本项目完全在本地运行，除您自行配置的 AI 模型接口外，**不向任何第三方服务器发送任何数据**。
- 所有本地数据库（`*.sqlite3`）、环境变量（`.env*`）与密钥文件均已配置在 `.gitignore` 中被严格忽略。

---

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
