---
name: github-skill-scanner
description: >-
  Scans public GitHub repositories for a given user, discovers available agent skills, and automatically updates the local skills directory and catalog, ensuring no duplicates.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# GitHub Skill Scanner

## Overview
This skill allows you to synchronize skills developed across multiple repositories into your main central `skills` directory. It uses the GitHub API to fetch non-forked repositories from a specified user, scans for `.agents/skills/` or `skills/` directories, and seamlessly pulls in or updates those skills locally.

## Recommended Workflow

### 1. Discovery & Input
- Ask the user for the target GitHub username or profile URL if not already provided (e.g., `https://github.com/username?tab=repositories`).
- Extract the `username` from the input.

### 2. Fetch Repositories
- Make an API request to `https://api.github.com/users/<username>/repos?per_page=100`.
- **Strict Rule:** Filter the resulting JSON list to include ONLY repositories where `"fork": false`.

### 3. Scan for Skills
- Iterate through the non-forked repositories.
- Use the GitHub Contents API to check for the existence of `skills` or `.agents/skills`:
  - `https://api.github.com/repos/<username>/<repo>/contents/skills`
  - `https://api.github.com/repos/<username>/<repo>/contents/.agents/skills`
- For each directory found, compile a list of skill names (the subdirectories).

### 4. Download & Update
- For each discovered skill:
  - Check if the skill already exists in the local `skills/` directory.
  - Fetch the remote `SKILL.md` (and any other files in the remote skill directory).
  - Compare the remote version to the local version (if it exists).
  - **Mandatory Action (Genericization):** Before saving the remote skill locally, you MUST analyze its contents. Remove or generalize any repository-specific hardcoded configurations, NPM scripts (e.g., `npm run check-duplicate`, `npm run lint`), or tooling assumptions. The skill must be completely generic and reusable for this AI Agent Skills Repository.
  - If the newly generalized remote skill does not exist locally OR if it differs from the local version, OVERWRITE the local skill.

### 5. Catalog Registration
- After downloading all discovered skills, read the local `skills/README.md`.
- Ensure that every newly added skill is listed in the "Available Skills Catalog" table.
- Ensure the table remains strictly alphabetically sorted by Skill Name.
- Do NOT add duplicate entries if the skill was merely updated.

## Best Practices & Guidelines
- Rely on the `search_web` or `read_url_content` tools, or a quick Python script with `urllib`/`requests` to fetch data from the GitHub REST API.
- Do not attempt to web scrape the GitHub HTML interface, as it is fragile and pagination is difficult to handle.
- Ensure proper error handling (e.g., handling rate limits on the GitHub API gracefully).
