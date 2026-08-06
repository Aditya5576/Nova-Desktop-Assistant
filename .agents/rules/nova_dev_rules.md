# Nova Development Rules (Mandatory)

These rules apply to every change made to this project. Follow them strictly.

## Core Principle
Nova (BuddyAssist) is a production-quality Windows desktop application.
The stability of existing features is more important than adding new features.
Never sacrifice working functionality for new functionality.

---

## Rule 1 — Never Break Existing Features
Before modifying any code, identify what is already working.
If a feature already works correctly, do not rewrite, replace, or refactor it unless absolutely necessary.
Existing working features must continue to work exactly as before after every change.

---

## Rule 2 — Make Small Incremental Changes
Implement only the requested feature or bug fix.
Do not modify unrelated files, components, pages, layouts, styles, database structures, or logic.
Avoid unnecessary code changes.

---

## Rule 3 — Preserve Existing UI
Do not redesign screens that already work unless explicitly instructed.
Maintain consistent spacing, typography, colors, animations, and layouts.
Only update UI where required.

---

## Rule 4 — Preserve Existing Logic
Never remove existing business logic.
Never change working workflows.
Never replace existing implementations simply because another approach exists.
If the current implementation works correctly, keep it.

---

## Rule 5 — Backward Compatibility
Every new feature must work together with all existing features.
Adding a feature must never disable, remove, or interfere with:
* Task Management
* Dashboard
* Notifications (Windows Toast + iPhone 15 Push)
* Projects / Categories
* Calendar / Schedules
* Statistics
* Search
* Settings (Gemini API Key, ntfy Topic, Sound)
* Database (myassist_tasks.json)
* Navigation
* Keyboard Shortcuts

---

## Rule 6 — Verify Before Finishing
Before considering any task complete, verify that existing functionality still works.
At minimum, confirm:
* Application launches correctly (`npx electron .` / `start-myassist.bat`).
* Navigation works.
* Existing pages open correctly.
* Existing buttons function.
* Existing forms still save correctly.
* Existing database operations still work.
* Existing notifications still work.
* Existing settings still work.
* Existing search / NLP parsing still works.

If any regression is detected, fix it before adding anything else.

---

## Rule 7 — Never Delete Without Permission
Never remove:
* Components
* Files
* Pages
* Database tables / schema fields
* Functions
* Utilities
* Assets

Unless explicitly instructed.
If something becomes unused, leave it in place unless approval is given.

---

## Rule 8 — Maintain Code Quality
Every new feature should:
* Follow the existing architecture.
* Reuse existing components where appropriate.
* Avoid duplicated code.
* Keep code modular and maintainable.
* Use clear naming conventions.
* Remain easy to extend.

---

## Rule 9 — Protect User Data
Never modify stored user data unexpectedly.
Never delete existing data.
Never reset the database.
Never overwrite backups.
Database changes must preserve all existing records.

---

## Rule 10 — Fix Bugs First
If a requested change exposes existing bugs:
1. Fix the regression.
2. Verify stability.
3. Then implement the new feature.

Do not ignore broken functionality.

---

## Rule 11 — Respect Existing Behavior
Do not change how existing features behave unless explicitly requested.
Users should not notice unexpected behavior changes after updates.

---

## Rule 12 — Finish Completely
Every implementation should include:
* Complete functionality
* Proper validation
* Error handling
* Loading states
* Empty states
* Responsive desktop behavior
* Visual consistency

Avoid placeholder implementations.

---

## Rule 13 — Regression Prevention
After every completed task, perform a regression review.
Ensure that no existing feature has been broken, degraded, or unintentionally changed.
If a regression is found, fix it immediately before continuing.

---

## Rule 14 — Stability Over Speed
Never rush implementation.
Prefer reliable, maintainable, and production-ready solutions over quick fixes.

---

## Rule 15 — Project Goal
Nova should evolve incrementally.
Every update must improve the application without reducing stability, performance, usability, or reliability.
The application should become more polished with every change while preserving all previously working functionality.
