# 🤖 Nova (MyAssist) — Intelligent Desktop Personal Assistant

> **Nova** is a sleek, ultra-fast, glassmorphism desktop personal task assistant powered by **Google Gemini AI**, natural language task parsing, and **Native Windows OS Task Scheduler** integration for 100% reliable offline notifications.

---

## ✨ Key Features

- 💬 **Conversational AI Assistant ("Nova")**: Ask for productivity advice, task breakdowns, or discuss your day. Powered by Google's free `gemini-2.0-flash` model.
- ⏱️ **Natural Language Task Scheduler**: Type naturally like `"Remind me to call client tomorrow at 4pm #Work"` or `"in 1.1 min"` — Nova automatically extracts dates, times, categories, and priority levels.
- 🛡️ **0MB RAM Offline Windows OS Notifications**: Integrates directly with `schtasks.exe` so Windows OS fires desktop notifications and audio alerts on time — even if the app or computer was closed/rebooted!
- 🎨 **Glassmorphism Dark Mode UI**: Modern dark theme built with CSS design tokens, smooth animations, and responsive collapsible sidebar.
- 🔲 **Compact Floating Widget Mode**: Shrinks down into an unobtrusive, always-on-top mini floating widget bar for seamless multitasking.
- 🔴 **Priority Levels & 🔄 Recurring Tasks**: Built-in support for High, Medium, and Low priorities (`Urgent`, `P1`, `🔴`) and automatic rescheduling for Daily, Weekly, and Monthly tasks.
- 🎵 **Dual-Tone Audio Chime Alerts**: Loud, pleasant 2-tone audio chime synthesis for reminders.
- 🔄 **Cross-Device Auto-Sync**: Automatically syncs code, tasks, and settings across multiple PCs via GitHub.

---

## 🛠️ Built With

- **Core**: Electron, HTML5, Vanilla CSS3 (Glassmorphism), JavaScript (ES6+)
- **AI Engine**: Google Gemini REST API (`gemini-2.0-flash`)
- **OS Integration**: Windows Task Scheduler (`schtasks.exe`), PowerShell Toast Notifications (`Windows.UI.Notifications`)
- **Persistence**: Local JSON Database Engine (`myassist_tasks.json`)

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v16 or higher)
- Windows 10 / 11

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Aditya5576/Nova-Desktop-Assistant.git

# Navigate into the project folder
cd Nova-Desktop-Assistant

# Install dependencies
npm install
```

### 3. Running the App
```bash
# Start Nova Desktop Assistant
npm start
```
Or double-click `start-myassist.bat` / `launch-silent.vbs` for background execution with zero CMD window!

---

## 🔑 Google Gemini Free API Key Setup

1. Get your free API key from [Google AI Studio](https://aistudio.google.com/).
2. Open **Nova** → Click **Settings (⚙️)**.
3. Paste your Gemini API key and click **Save Settings**.
4. Enjoy instant conversational advice and AI daily productivity summaries!

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p center>Crafted with ❤️ for maximum productivity!</p>
