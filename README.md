# 🌟 Nova Desktop Assistant

> **Nova** is a smart, ultra-fast Windows desktop task assistant that helps you schedule reminders, manage your day, and sync tasks seamlessly with your iPhone 15 — even when the app is completely closed.

---

## ✨ Why You'll Love Nova

- 📱 **2-Way iPhone 15 Sync**: Speak to Siri or send tasks from your iPhone (`ntfy` app / iOS Shortcuts) directly to your PC in real time.
- ⏰ **Natural Language Scheduling**: Type naturally like *"Remind me tomorrow at 4:30pm #Work"* or *"in 10 min"* — Nova automatically understands dates, times, categories, and priority levels.
- 🔔 **12-Hour AM/PM Offline Alerts**: Integrates directly with Windows Task Scheduler so reminders fire on time with audio chimes — even if Nova or your PC was turned off!
- 🎨 **Obsidian Dark Mode UI**: Modern dark theme with `JetBrains Mono` typography, high-contrast legibility, and chronological task sequencing.
- 🔲 **Floating Desktop Mini Widget**: Shrinks into a compact, always-on-top floating widget bar for easy multitasking.
- 🤖 **Google Gemini AI Assistant**: Get productivity advice, task breakdowns, and 1-click daily summaries powered by Google's free Gemini 2.0 AI.

---

## 🛠️ Built With

- **Framework**: Electron.js, HTML5, Vanilla CSS3, JavaScript (ES6+)
- **AI Engine**: Google Gemini REST API (`gemini-2.0-flash`)
- **OS Integration**: Windows Task Scheduler (`schtasks.exe`), PowerShell Toast Notifications
- **iOS Sync**: Real-Time HTTP Stream Engine (`ntfy.sh`)
- **Storage**: Local JSON Database (`myassist_tasks.json`)

---

## 🚀 Quick Start (Windows)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/Aditya5576/Nova-Desktop-Assistant.git

# Navigate into the project folder
cd Nova-Desktop-Assistant

# Install dependencies
npm install
```

### 2. Launch Nova
```bash
# Start Nova Desktop Assistant
npm start
```
Or double-click **`Nova.lnk`** on your desktop for 1-click instant launch!

---

## 📱 Setting Up iPhone 15 Sync

1. Download the free **ntfy** app on your iPhone from the iOS App Store.
2. Subscribe to topic: `nova-my-tasks`
3. Send any message or task from your iPhone — Nova on your PC will automatically log, schedule, and alert you in real time!

---

## 🔑 Free Google Gemini AI Setup (Optional)

1. Get your free API key from [Google AI Studio](https://aistudio.google.com/) (1,500 free requests/day).
2. Open **Nova** ➔ click **⚙️ Settings**.
3. Paste your Gemini API key and click **Save Settings**.

---

## 📄 License

Distributed under the MIT License.

<p align="center">Made with ❤️ for effortless daily productivity!</p>
