---
description: 
---

# Implementation Plan: [Feature / Bug Fix Name]

## 1. Scope & Objective
- **Target Area:** [Backend API / Frontend UI / Database]
- **Target Files:**
  - `backend/router.js` (Modify)
  - `frontend/src/...` (Modify)
  - `tests/...` (New / Modify)

## 2. Analysis & Call Sites
- **Current State:** [Brief description of existing flow or error]
- **Proposed Solution:** [Step-by-step logic change]

## 3. Verification & Testing Strategy
- **Reproduction/Test Command:** `npm test` or `node tests/[test_name].js`
- **Frontend Check:** Run `npm --prefix frontend run build` to confirm no bundling/linting regressions.

## 4. Execution Steps
1. [ ] Create or update test cases in `tests/`
2. [ ] Implement changes in `backend/` or `frontend/`
3. [ ] Run `./scripts/verify.sh`
4. [ ] Verify UI flows via browser preview (if frontend changed)