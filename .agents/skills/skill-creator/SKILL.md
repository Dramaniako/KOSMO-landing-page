---
name: skill-creator
description: Meta-skill for authoring, validating, and formatting agent skills adhering to Anthropic Claude and Google Gemini industry standards. Activates when creating a new skill, upgrading existing skill definitions, or auditing skill directory compliance.
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - meta-skill
  - skills-spec
  - standards
  - agent-orchestration
---

# Skill Creator: Meta-Skill Standard Specification

## 1. Overview & Purpose
`skill-creator` is the foundational meta-skill in KOSMO. It defines the formal architectural blueprint, formatting requirements, progressive disclosure standards, and validation checklist for authoring new agent skills.

All skills within `.agents/skills/` MUST follow the specifications defined in this document, adhering to standards established by Anthropic (Claude Code / Agent Skills) and Google (Gemini Code Assist / Agent Builder).

---

## 2. Industry Standards Compliance
A professional agent skill must fulfill four core criteria:
1. **Machine-Readable Frontmatter**: Valid YAML block at the very beginning of `SKILL.md` containing `name` and `description`.
2. **Trigger-Rich Descriptions**: The `description` must clearly articulate *when*, *why*, and *under what conditions* an autonomous agent should activate the skill.
3. **Progressive Disclosure**: Information is organized hierarchically:
   - High-level intent, activation triggers, and guardrails first.
   - Deep operational playbooks, CLI commands, and code snippets next.
   - Triage runbooks, diagnostics, and edge cases last.
4. **Platform Agnostic & Deterministic**: Procedures must supply commands for both POSIX (Bash/Linux/CI) and Windows (PowerShell) when applicable.

---

## 3. Standard Skill Anatomy

Every skill MUST reside in its own subdirectory under `.agents/skills/`:
```text
.agents/skills/
└── <skill-name>/
    ├── SKILL.md                 # Primary skill definition (Required)
    ├── scripts/                 # Optional automated helper or validation scripts
    └── templates/               # Optional code templates, fixtures, or schemas
```

### 3.1 YAML Frontmatter Template
```yaml
---
name: <skill-name>
description: <Trigger-rich description specifying when the agent must activate this skill and what capabilities it provides.>
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - <domain-tag-1>
  - <domain-tag-2>
---
```

### 3.2 Required Document Sections in `SKILL.md`
1. **Header & Frontmatter**: As defined above.
2. **1. Overview & Triggers**:
   - Concise summary of the skill domain.
   - Specific triggers: user requests, file changes, CI failures, error codes.
   - Negative triggers: when NOT to use this skill.
3. **2. Prerequisites & Environment**:
   - Required environment variables, tools, database connections, and npm scripts.
4. **3. Step-by-Step Execution Playbook**:
   - Progressive disclosure: High-level sequence followed by exact commands.
   - Code blocks with syntax highlighting (`bash`, `powershell`, `typescript`, `sql`).
5. **4. Failure Modes & Automated Triage**:
   - Diagnostic table: Symptom -> Root Cause -> Remediation Step.
6. **5. Security & Verification Guardrails**:
   - Invariants that must never be violated (e.g., zero hardcoded credentials, row-locking in DB).
7. **6. Quick Reference & Examples**:
   - One-liner commands and copy-pasteable execution templates.

---

## 4. Step-by-Step Runbook: Creating a New Skill

Follow these steps when tasked with generating a new agent skill:

### Step 1: Define Name and Triggers
- Choose a kebab-case identifier (e.g., `kosmo-payment-gateway`, `kosmo-seo-audit`).
- Craft a description with explicit trigger terms (keywords likely to appear in user prompts or error outputs).

### Step 2: Initialize Directory & File
```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force -Path ".agents/skills/<skill-name>"
New-Item -ItemType File -Force -Path ".agents/skills/<skill-name>/SKILL.md"
```
```bash
# POSIX Bash
mkdir -p .agents/skills/<skill-name>
touch .agents/skills/<skill-name>/SKILL.md
```

### Step 3: Populate Frontmatter & Structured Content
- Write the YAML frontmatter.
- Fill out Sections 1 through 6 adhering to KOSMO workspace rules (`.agents/rules/workspace-rules.md`).

### Step 4: Validate Git Tracking
Verify that `.gitignore` does not accidentally ignore the newly created skill:
```bash
git check-ignore -v .agents/skills/<skill-name>/SKILL.md
```
*(Expected output: unignored due to `!.agents/skills/**` rule).*

### Step 5: Register in Skill Registry
Update `.agents/skills/README.md` to index the new skill under the relevant domain category.

---

## 5. Automated Triage & Quality Gate Checklist

Before finalizing any skill, run through this checklist:
- [ ] Frontmatter contains valid YAML without tab characters.
- [ ] Description contains concrete trigger keywords.
- [ ] Includes both Linux (`bash`) and Windows (`powershell`) command examples where scripts differ.
- [ ] References existing repository files using relative paths (e.g., `backend/db.ts`, `scripts/verify.ps1`).
- [ ] Mentions relevant automated tests in `tests/` or frontend tests in `frontend/src/`.
- [ ] Contains zero hardcoded secrets, sample API keys, or production passwords.
