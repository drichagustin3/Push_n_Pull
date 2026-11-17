# HOPE Inc., ERP | Team Working Agreement

## Team Roles & Members

| Role | Username | Full Name | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Scrum Master** | `@drichagustin3` | Aldrich Rodolf Agustin | Coordinates sprint iterations, dissects project requirements into actionable tasks, and directs team collaboration using GitHub issues and version control workflows. |
| **UI/UX Designer** | `@AshleyNicoleMarticio30` | Ashley Nicole Marticio | Creates mobile-friendly interfaces, cohesive layouts, and engaging UI components using industry-standard design tools. |
| **Backend Developer** | `@rickysanglay` | Ricky Joe Sanglay | Develops backend API endpoints, integrates user authentication flows, and manages database operations utilizing Supabase. |
| **DB Admin** | `_` | ___ | Architects database schemas, executes schema migrations, writes PostgreSQL scripts, and enforces Row Level Security policies. |
| **Tester** | `_` | ___ | Authors comprehensive test plans, runs automated testing suites, and conducts thorough defect and security vulnerability reporting. |

---

## 1. Overview & Purpose

This charter defines how our team communicates, runs sprint ceremonies, reviews code, and maintains accountability across the **8-week (4-sprint) project schedule**.

---

## 2. Communication & Workspace Tools

| Channel / Tool | Primary Purpose | Usage Guidelines |
| :--- | :--- | :--- |
| **Facebook Messenger Group Chat** | Daily async updates & quick syncs | Post daily progress, flag blockers early, and coordinate urgent technical questions. |
| **GitHub Repository (`docs/`, `.github/`)** | Single source of truth for documentation | Store all guides, roadmaps, architecture specs, and templates in version control. |
| **GitHub Issues & Pull Requests** | Task tracking & code integration | All code updates must link to an Issue and enter `main` via PR—**no direct pushes**. |

---

## 3. Sprint Ceremonies & Cadence

* **Daily Standups *(Daily — Async / Quick Sync)*:** Share a brief status update covering yesterday's progress, today's goals, and any current impediments.
* **Sprint Planning *(Every 2 Weeks — Sprint Start)*:** Scope the upcoming 2-week sprint backlog, verify acceptance criteria, and assign issues to team members.
* **Sprint Review & Retrospective *(Every 2 Weeks — Sprint End)*:** Demo completed work against acceptance criteria, collect feedback, and identify process improvements for the next sprint.

---

## 4. Pull Request & Code Quality Standards

* **Issue Traceability:** Every PR must use the repository's PR template and reference its corresponding GitHub Issue (e.g., `Closes #3`).
* **Mandatory Peer Approval:** Each PR requires **at least 1 teammate approval** before merging into `main`. Self-approvals are strictly prohibited.
* **24-Hour Review SLA:** Reviewers should inspect and respond to assigned PRs within **24 hours** to prevent workflow bottlenecks.
* **Pre-Merge Quality Checks:** Before requesting a review, verify that your branch:
  * Builds cleanly without errors (`npm run build`)
  * Passes all automated tests and linters (`npm test`)
  * Contains zero hardcoded secrets, credentials, or leftover `console.log` debug statements

---

## 5. Accountability & Conflict Resolution

* **Escalating Blockers:** Surface technical or schedule blockers immediately in the Messenger group chat or tag the **Scrum Master** during standups.
* **Resolving Disagreements:** Address architectural or UI disagreements through a focused discussion thread or quick call. If the team cannot reach consensus, the **Scrum Master** mediates using the **Student Guide** as the baseline authority.
* **Board Ownership:** Every developer is responsible for keeping their GitHub Project board cards accurate in real time (`To Do` → `In Progress` → `Review` → `Done`).