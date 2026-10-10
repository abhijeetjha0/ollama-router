---
name: browser-automation-test
description: Automates a browser check of the app. Falls back to asking the user to manually start the server if execution is blocked by the sandbox environment.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.2.0"
---

# Browser Automation Test

This skill automates the testing of the application in a browser environment using the `browser_subagent` tool.

## Prerequisites
- **Tools Needed**: The `browser_subagent` and `run_command` tools must be available in the agent's toolset.
- **Environment Requirements**: Node.js and `npm` must be installed on the local system.
- **Project Setup**: Project dependencies (`node_modules`) must be installed prior to running this check.

## Instructions
1. First, attempt to start the local server by running `npm run dev` in the terminal using the `run_command` tool.
2. Wait for the server to start (e.g., watch for "Ready in" or similar output).
3. If the server fails to start due to sandbox environment restrictions, permission errors, or other blocking issues, **STOP** and ask the user to start the server manually in their own terminal (e.g., "Please run `npm run dev` in your terminal and let me know when it's ready.").
4. Wait for the user's confirmation that the server is running.
5. Once the server is running (usually on `http://localhost:3000`), use the `browser_subagent` tool to perform an automation check on the application.
6. In the `Task` parameter for the `browser_subagent`, provide specific and comprehensive instructions to perform the following checks:
   - **Navigation & Error Checking**: Navigate to the local URL, systematically discover all available links in the UI, and **visit every single route** in the application to verify that no errors or broken links occur.
   - **Responsiveness & Overflow**: Resize the browser window across all viewports (e.g., mobile 375px, tablet 768px, desktop). You MUST explicitly verify that no horizontal scrolling/overflow occurs on any screen size. Elements like the hamburger menu must remain visible and accessible within the viewport at all times.
   - **WCAG Accessibility**: Check for semantic HTML, proper contrast, and basic accessibility standards.
   - **Keyboard Navigation (Tabbing)**: Use the `Tab` key to navigate through interactive elements, ensuring focus states are clearly visible and the tab order is logical.
   - **Scrolling & Interaction**: Scroll through pages to ensure lazy-loaded content or animations trigger correctly. Perform clicks on various random elements to ensure the app doesn't crash on unexpected inputs.
   - **Basic Load/Performance**: Observe and report if any page or component takes an unusually long time to render.
7. Once the `browser_subagent` completes its task, analyze its final report.
8. **Codebase Coverage Analysis**: Perform a static dependency trace based on the subagent's actions. For every route or feature the subagent successfully interacted with, trace its source code dependencies (e.g., tracking imports from `page.js` to underlying UI components, hooks, or utilities). Compare the number of these "touched" files against **all source code files inside the `app/` directory** (similar to how Jest measures coverage across the entire directory) to calculate a comprehensive **Code Coverage Percentage** (e.g., "40 out of 50 total files touched = 80% Coverage").
9. Create a detailed report of the findings and save it STRICTLY as `browser-reports/report.html` (create the directory if it doesn't exist). Do not append dynamic names (like `homepage_test_report.html`). Overwrite the existing file if it already exists; do not attempt to delete it first.
   - **Gitignore Verification**: Verify that `browser-reports/` (or `browser-reports`) is listed in the project's `.gitignore`. If it is missing (or if `.gitignore` does not exist), append `browser-reports/` to `.gitignore` (or create `.gitignore` if needed) so generated test reports are not committed to version control.
   - **CRITICAL RESTRICTION**: You are strictly forbidden from writing temporary scripts (e.g., `generate-report.js`) or any files outside of the `browser-reports/` directory to accomplish this. Construct the final HTML string in memory and use your `write_to_file` tool directly on `browser-reports/report.html`.
   - You MUST use the HTML template provided in this skill's directory at `resources/report-template.html`. Read this template file and inject your findings into the designated `{{...}}` and `<!-- INJECT_... -->` placeholders.
   - For `<!-- INJECT_COVERAGE_ROWS -->`, **explicitly list every single source file** in the codebase (both tested and missed) as `<tr>` elements. Do NOT group missed files together (e.g., do not use "and X others...").
   - For `<!-- INJECT_TIMELINE_ITEMS -->`, use the exact `.timeline-item` HTML structure found in the template's timeline UI to document your steps. Do not modify the CSS; it is already configured with exact alignment boundaries.
   - Do NOT include or expect screenshots, as the subagent cannot save them directly to the workspace.
10. Report the summary back to the user and provide a link to the saved HTML report file.
