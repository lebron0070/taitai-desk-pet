# Windows Support and Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Electron desk pet follow the active window on Windows 10/11, produce a Windows x64 installer, and publish macOS and Windows beta downloads in a public GitHub Release.

**Architecture:** Keep the existing Electron UI, docking, animation, state, tray, and preferences code. Add a platform-specific active-window adapter: the existing AppleScript path remains unchanged on macOS, while Windows calls a bounded PowerShell Win32 query and normalizes the result into the existing `{name,x,y,width,height,hasBounds}` shape. Build Windows on a native GitHub Actions Windows runner so the macOS development machine does not need Wine.

**Tech Stack:** Electron 37, electron-builder 26, CommonJS, Node built-in test runner, PowerShell/Win32, GitHub Actions, GitHub Releases.

## Global Constraints

- Preserve the existing behavior: the pet moves when the foreground application changes, not while the user types inside the same application.
- Windows target is Windows 10/11 x64.
- macOS beta remains Apple silicon only in v0.4.0.
- Public beta binaries are unsigned; release notes must disclose macOS Gatekeeper and Windows SmartScreen warnings.
- Do not add a native Node dependency that would complicate cross-platform packaging.

---

### Task 1: Windows active-window adapter

**Files:**
- Create: `desktop/active-window.js`
- Create: `desktop/active-window.test.js`
- Modify: `desktop/main.js`

**Interfaces:**
- Produces: `getActiveWindow(platform, execFileImpl): Promise<ActiveWindow|null>`
- Produces: `parseWindowsResult(stdout): ActiveWindow|null`
- Consumes: the existing docking code's `{name,x,y,width,height,hasBounds}` contract.

- [ ] **Step 1: Write parser tests for valid JSON, missing bounds, and invalid output**

Use Node's built-in `node:test` and assert that Windows process data is normalized without throwing.

- [ ] **Step 2: Run the tests and verify they fail because the adapter does not exist**

Run: `node --test desktop/active-window.test.js`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the minimal platform adapter**

Keep the current macOS AppleScript. On Windows, run `powershell.exe` with `GetForegroundWindow`, `GetWindowRect`, and `GetWindowThreadProcessId`, return compact JSON, and enforce the existing 1400 ms timeout.

- [ ] **Step 4: Connect `desktop/main.js` to the adapter**

Replace the inline `activeWindow()` implementation and retain all current polling, movement de-duplication, pause/resume, and docking behavior.

- [ ] **Step 5: Run unit tests and syntax checks**

Run: `node --test desktop/active-window.test.js && node --check desktop/main.js && node --check desktop/active-window.js`
Expected: all tests pass and both syntax checks exit 0.

### Task 2: Windows packaging and CI release

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/release.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Taitai-<version>-win-x64.exe` and `Taitai-<version>-win-x64.zip` on Windows.
- Consumes: tag names matching `v*`.

- [ ] **Step 1: Add deterministic Windows targets**

Add `build:win` using electron-builder `--win nsis zip --x64`, plus `win.artifactName` and assisted per-machine NSIS installation settings.

- [ ] **Step 2: Add a tag-triggered Windows GitHub Actions build**

Use `windows-latest`, Node 22, pnpm, `pnpm install --frozen-lockfile`, `pnpm run build:win`, and upload the EXE/ZIP to the matching GitHub Release.

- [ ] **Step 3: Validate configuration locally**

Run package JSON parsing and workflow YAML parsing; expected result is no syntax error.

### Task 3: User-facing documentation

**Files:**
- Modify: `README.md`
- Modify: `release/安装说明.txt`
- Modify: `release/GitHub-Release-v0.4.0.md`

**Interfaces:**
- Produces: exact download choice and first-launch instructions for macOS Apple silicon and Windows x64.

- [ ] **Step 1: Document supported systems and download filenames**

State that Windows 10/11 x64 uses the EXE and Apple silicon macOS uses the ARM64 DMG.

- [ ] **Step 2: Disclose unsigned beta warnings**

Explain that SmartScreen or Gatekeeper may warn and users should proceed only when the file came from the official project Release page.

- [ ] **Step 3: Recheck all filenames against build configuration**

Expected: documentation and electron-builder artifact names match exactly.

### Task 4: Public GitHub repository and beta release

**Files:**
- Publish tracked source files, excluding `node_modules`, local build output, and generated video intermediates.
- Release assets: macOS ARM64 DMG now; Windows x64 EXE/ZIP after the native Windows workflow completes.

**Interfaces:**
- Produces: a public `lebron0070/taitai-desk-pet` repository and `v0.4.0-beta` Release URL.

- [ ] **Step 1: Initialize and commit the reviewed source tree**

Commit message: `feat: publish cross-platform desk pet beta`.

- [ ] **Step 2: Create the public GitHub repository and push `main`**

Verify the repository is public and README renders.

- [ ] **Step 3: Create and push tag `v0.4.0-beta`**

Verify the release workflow starts on GitHub Actions.

- [ ] **Step 4: Publish the prerelease and attach macOS DMG**

Use `release/GitHub-Release-v0.4.0.md` as release notes and verify the asset downloads.

- [ ] **Step 5: Verify Windows artifacts are attached by CI**

Expected: the Release contains macOS ARM64 DMG, Windows x64 installer EXE, and Windows x64 ZIP.

