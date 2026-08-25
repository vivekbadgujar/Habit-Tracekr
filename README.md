# HABITUS — Daily Habit Ledger & Schedule

A professional, monochrome habit tracker and timetable dashboard built with pure HTML5, modern CSS3, and Vanilla JavaScript. Inspired by financial ledgers and spreadsheet clarity.

![Habitus Dashboard](https://images.unsplash.com/photo-1507925921958-8a62f3d1a50d?auto=format&fit=crop&w=1200&q=80)

---

## ✨ Features

- **◈ Today View**: Interactive check-off rows with animated teal ✓, real-time SVG circular progress ring, and live streak counters.
- **⊞ Monthly Grid (Ledger)**: Financial-style matrix of habits vs. month days with future days locked and a monthly trend sparkline.
- **◎ Analytics & Insights**: Donut completion chart, month-to-date stat cards, per-habit performance bar chart, breakdown table, and Top Habits leaderboard.
- **⊞ Timetable & Daily Schedule**:
  - Time block grid (5:00 AM to 11:00 PM) with 30-min precision.
  - Live teal current-time line indicating your current activity.
  - Linked habit sync (marking a scheduled block done marks its linked habit done).
  - Day view & 7-day Week view.
  - Cycle status: Pending → Done → Skipped.
- **⊕ Manage & Backup**:
  - Add/remove/reorder habits with emoji picker.
  - **Export / Import JSON**: One-click data backup and restore across devices.
- **100% Local Persistence**: Fully powered by browser `localStorage`.

---

## 🚀 Deploy to Vercel (Ready!)

This repository is pre-configured for instant zero-config deployment on Vercel.

### Method 1: Push to GitHub & Import
1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: HABITUS habit tracker"
   git remote add origin https://github.com/YOUR_USERNAME/habitus-habit-tracker.git
   git branch -M main
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → **Import** your repository.
3. Keep default settings and click **Deploy**.

### Method 2: Vercel CLI
```bash
npx vercel
```

---

## 💻 Local Development

Run locally with any static server:

```bash
# Using npx serve
npx serve .

# Or using Python (if installed)
python -m http.server 8080
```

Or simply double-click `index.html` to open directly in any web browser!
