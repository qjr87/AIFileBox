<div align="center">
  <img src="../public/logo.svg" width="108" height="108" alt="AIFileBox Logo" />
  <h1>AIFileBox</h1>
  <p><strong>Local-first AI File Classification, Batch Renaming & Archiving Desktop Workbench</strong></p>
  <p>
    <a href="../README.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.en.md">English</a> ·
    <a href="./README.ja.md">日本語</a> ·
    <a href="./README.ko.md">한국어</a> ·
    <a href="./README.es.md">Español</a> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a>
  </p>
  <p>
    <a href="https://github.com/qjr87/AIFileBox/releases/latest">
      <img src="https://img.shields.io/github/v/release/qjr87/AIFileBox?style=flat-square&label=Release&color=e04f44" alt="Latest Release" />
    </a>
    <a href="../LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-3a9b6e?style=flat-square" alt="License" />
    </a>
    <img src="https://img.shields.io/badge/Tauri-v2-4a7fd4?style=flat-square" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-e8962e?style=flat-square" alt="Platform" />
  </p>
</div>

---

## 📥 Download & Install (Windows / macOS)

Download the latest installers from [**GitHub Releases**](https://github.com/qjr87/AIFileBox/releases/latest):

| Platform | Architecture | Package Format | Notes |
| :--- | :--- | :--- | :--- |
| **Windows** | `x64` (64-bit) | `.exe` (NSIS) | Windows 10 / 11 installer |
| **macOS (Apple Silicon)** | `aarch64` (M1/M2/M3/M4) | `.dmg` / `.app.tar.gz` | For Apple Silicon Macs |
| **macOS (Intel)** | `x86_64` | `.dmg` / `.app.tar.gz` | For Intel-based Macs |

> **macOS First Launch Tip**: If macOS Gatekeeper blocks the unsigned open-source app on first launch, run:
> ```bash
> sudo xattr -rd com.apple.quarantine "/Applications/AIFileBox.app"
> ```

---

## ✨ Key Features

- **🤖 AI Smart Classification & Batch Renaming**
  - Drag and drop loose files or entire project/download folders; recursively scans all nested files.
  - Automatically cleans ad prefixes, flattens redundant nested directories, and generates a clear **Review & Execution Plan** before touching any file.
  - Scope AI analysis to specific libraries to save tokens and improve accuracy.
- **📚 Multi-Library Management & Hierarchical Markdown Rules**
  - Register any local folder as a Library; rename, adjust folder depth, or relocate library paths anytime.
  - Supports **Global Rules** (`总说明.md`) + **Library Root Rules** (`_规则.md`) + **Sub-folder Rules**, with one-click AI rule drafting based on existing directory structures.
- **🔌 Multi-Provider AI Support (Cloud + Local Offline)**
  - Native support for **OpenAI & OpenAI-compatible APIs** (DeepSeek, Qwen, OpenRouter, etc.), **Anthropic Claude**, **Google Gemini**, and local **Ollama** (works offline without an API key).
  - Built-in AI Request & Token Usage Inspector (input, output, cache hits, latency, and raw payloads).
- **🛡️ Safety-First File Operations**
  - **Never silently overwrites**: Automatic conflict detection, SHA-256 sampled fingerprinting, and safe duplicate cleanup.
  - **Auditable & Reversible**: Every move/copy operation is logged in a local SQLite database with signature verification and one-click undo.
  - **OS Keychain Protection**: API keys are stored in the native OS credential store (Windows Credential Manager / macOS Keychain).
- **🌍 8 Built-in Languages**
  - Simplified Chinese, Traditional Chinese, English, Japanese, Korean, Spanish, French, and German — switchable anytime in **Settings → General**.

---

## 🚀 Development & Build

```bash
# Install frontend dependencies
npm install

# Run in Tauri desktop dev mode
npm run tauri -- dev

# Build production desktop bundles
npm run tauri -- build
```

---

## 📄 License

Licensed under the [MIT License](../LICENSE).
