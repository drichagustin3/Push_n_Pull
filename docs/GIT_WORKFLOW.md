# Hope, Inc. ERP — Git Workflow & Contribution Guide

> [!IMPORTANT]
> Direct commits and force pushes to `main` are strictly prohibited. All changes must go through a reviewed Pull Request to ensure code quality and prevent accidental overwrites.

---

## 1. Branching Strategy

We follow a **Feature Branching** workflow branched directly from `main`. Every sprint task should have its own dedicated branch.

### Branch Naming Conventions
Use the pattern `<type>/<ticket-id>-<short-description>` in all lowercase with hyphens:

| Category | Branch Prefix | Format | Example |
| :--- | :--- | :--- | :--- |
| **Features** | `feature/` | `feature/<ticket-id>-<description>` | `feature/S1-DEV-01-app-scaffold` |
| **Bug Fixes** | `fix/` | `fix/<ticket-id>-<description>` | `fix/S1-DEV-03-blocked-user-check` |
| **Testing** | `test/` | `test/<ticket-id>-<description>` | `test/S1-TST-02-auth-suite` |
| **Docs & Governance** | `docs/` | `docs/<ticket-id>-<description>` | `docs/S1-DOC-01-setup-guide` |

---

## 2. Commit Message Standards

All commits must follow the **Conventional Commits** specification:

```text
<type>: <short imperative description>
```

### Allowed Commit Types

| Type | Purpose | Example |
| :--- | :--- | :--- |
| `feat` | Introduces a new feature or endpoint | `feat: add user registration endpoint` |
| `fix` | Resolves a bug or defect | `fix: prevent blocked users from logging in` |
| `docs` | Updates documentation only | `docs: add database setup guide` |
| `test` | Adds or updates unit/integration tests | `test: add password hashing unit test` |
| `refactor` | Restructures code without changing behavior | `refactor: simplify auth token validation` |
| `chore` | Maintenance, dependencies, or repo config | `chore: update package dependencies` |

---

## 3. Pull Request & Review Process

Each task in the sprint plan corresponds to **one planned Pull Request**.

### Step 1: Sync `main` and Create a Branch
Always branch off the latest version of `main`:
```bash
git checkout main
git pull origin main
git checkout -b feature/S1-DEV-01-app-scaffold
```

### Step 2: Develop and Commit
Make small, logical commits that adhere to the commit message standards above:
```bash
git add .
git commit -m "feat: initialize project folder structure"
```

### Step 3: Push Your Branch to GitHub
```bash
git push -u origin feature/S1-DEV-01-app-scaffold
```

### Step 4: Open a Pull Request
1. Navigate to GitHub and open a Pull Request targeting the **`main`** branch.
2. Fill out **every section** of the auto-loaded Pull Request template in full detail.
3. Reference the target sprint issue in the description so it links and closes automatically upon merge (e.g., `Closes (link of an issue)`).
4. Request a code review from your teammates.

