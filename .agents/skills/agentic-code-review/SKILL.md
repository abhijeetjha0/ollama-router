---
name: agentic-code-review
description: >-
  Systematic framework for performing rigorous AI-assisted code reviews.
  Use when asked to review a PR, diff, file, or architectural change for security,
  correctness, edge cases, test coverage, and code hygiene.
author: "Abhijit Kumar Jha"
author_url: "https://github.com/abhijeetjha0"
version: "1.1.0"
---

# Agentic Code Review Guide

## Overview
Perform high-signal, thorough code reviews focusing on actionable feedback, security risks, logical edge cases, and maintainability.

---

## Review Checklist

### 1. Correctness & Logic
- [ ] Does the change satisfy all acceptance criteria without unintended side effects?
- [ ] Are edge cases handled (null/nil/undefined values, zero-division, empty collections, timeouts, boundary numbers)?
- [ ] Are race conditions, concurrency bottlenecks, or state desynchronizations possible?

### 2. Security & Data Protection
- [ ] No hardcoded secrets, API tokens, passwords, or private keys.
- [ ] User input is sanitized and parameterized (prevent SQL injection, XSS, SSRF, command injection).
- [ ] Proper authentication and authorization checks are enforced on endpoints.

### 3. Performance & Resource Management
- [ ] Check for $O(n^2)$ or nested loops that could be optimized.
- [ ] Ensure database queries avoid N+1 query patterns and utilize appropriate indexes.
- [ ] Open resources (file descriptors, sockets, streams, database connections) are closed or managed in `try-with-resources` / context managers.

### 4. Maintainability & Clean Code
- [ ] Follows established project idioms and naming conventions.
- [ ] Functions are cohesive, focused on a single responsibility, and not excessively long.
- [ ] Error messages are clear, descriptive, and actionable.

### 5. Test Coverage & Verifiability
- [ ] Unit or integration tests cover the new code path including error paths.
- [ ] Tests are deterministic and do not rely on flaky timing or shared global state.

---

## Output Format

When generating a code review report:
1. **Summary**: Brief 2-3 sentence overview of the change.
2. **Critical Findings / Blockers**: Security issues, data loss hazards, severe logic bugs.
3. **Suggestions & Improvements**: Performance optimizations, style alignment, refactoring.
4. **Questions / Clarifications**: Ambiguities in design intent.
5. **Verdict**: `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`.
