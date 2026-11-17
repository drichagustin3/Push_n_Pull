# Hope, Inc. ERP — Branch Protection Configuration Guide
As Scrum Master, I am implementing this rule on the main branch to protect our code quality and stop unintended overwrites.

### Steps to Configure in GitHub:
1. Navigate to **Settings** > **Branches** in the repository.
2. In the **Branch protection rules** section, click **Add branch protection rule**.
3. Under **Branch name pattern**, enter: main.
4. Configure the following protection checkboxes:
   - [x] **Require a pull request before merging**
   - [x] **Require conversation with teammates before merging**
   - [x] **Block force pushes**
   - [x] **Block branch deletions**
5. Click **Save changes** to activate.