# KOSMO Multi-Agent Skill Registry

This directory contains standardized, modular Agent Skills conforming to Anthropic (Claude Code / Agent Skills) and Google (Gemini Code Assist / Agent Builder) specifications.

Each skill provides structured progressive disclosure, YAML frontmatter, operational playbooks, failure triage matrices, and verification guardrails.

---

## Skill Catalog

| Skill Name | Specification Path | Primary Function & Triggers |
|---|---|---|
| **`skill-creator`** | [`skill-creator/SKILL.md`](./skill-creator/SKILL.md) | Meta-skill to author, standardize, lint, and update agent skills adhering to professional standards. |
| **`kosmo-verify-gate`** | [`kosmo-verify-gate/SKILL.md`](./kosmo-verify-gate/SKILL.md) | Verification coordinator and triage guide for the 5-gate pipeline (`scripts/verify.sh` / `scripts/verify.ps1`). |
| **`kosmo-security-sentinel`** | [`kosmo-security-sentinel/SKILL.md`](./kosmo-security-sentinel/SKILL.md) | Secret scanning, token handling, RBAC enforcement, and pre-commit security audits. |
| **`kosmo-concurrency-stress`** | [`kosmo-concurrency-stress/SKILL.md`](./kosmo-concurrency-stress/SKILL.md) | Concurrency stress testing, pessimistic row-locking (`FOR UPDATE`), and double-booking race condition prevention. |
| **`kosmo-contract-auditor`** | [`kosmo-contract-auditor/SKILL.md`](./kosmo-contract-auditor/SKILL.md) | Audit rules and test workflows for statutory digital contract generation (UU ITE & KUHPerdata) and PDFKit delivery. |
| **`kosmo-db-migration`** | [`kosmo-db-migration/SKILL.md`](./kosmo-db-migration/SKILL.md) | TiDB Cloud / MySQL schema migrations, composite index maintenance, diagnostics, and seed workflows. |

---

## Directory Conventions

```text
.agents/skills/
├── README.md                          # This index and skill catalog
├── skill-creator/SKILL.md             # Meta-skill specification
├── kosmo-verify-gate/SKILL.md         # 5-gate pipeline verification & triage
├── kosmo-security-sentinel/SKILL.md   # Security auditing & secret hygiene
├── kosmo-concurrency-stress/SKILL.md  # Concurrency & transaction isolation
├── kosmo-contract-auditor/SKILL.md    # Digital contract compliance & PDFKit
└── kosmo-db-migration/SKILL.md        # TiDB schema & index migration
```

For guidelines on authoring new skills, consult [`skill-creator/SKILL.md`](./skill-creator/SKILL.md).
