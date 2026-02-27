# Moduly CLI

Moduly is an advanced architecture analysis tool that automatically scans your JavaScript and TypeScript codebases. It transforms messy directory structures into intuitive, navigable metrics, and pushes the data to a beautiful 3D dashboard.

## Overview

The `moduly-cli` is built to be a seamless, zero-config tool that fits directly into your developer workflow. By performing deep AST-level parsing locally, it generates actionable insights into your codebase's health, dependencies, and performance, without sending your code to any external servers.

## Features

- 🔍 **Deep Scanning**: AST-level parsing to analyze dependencies, import relationships, and architectural bottlenecks.
- 📦 **Dependency Analysis**: Detects used, unused, and outdated packages automatically.
- 🛡️ **Security Check**: Analyzes code for dangerous patterns (`eval()`, `innerHTML`, command injection) alongside `npm audit` checks.
- ⚡ **Performance Profiling**: Estimates bundle impact and identifies uniquely large structural files/dependencies.
- 📈 **Health Score**: A unified 0-100 metric based on modularity, coupling ratios, vulnerabilities, and Git history hotspots.
- 🪄 **AI Mode**: Machine learning mode to scan through `git logs` detecting semantically huge architectural commits and hotspots.

## Installation

Install Moduly globally via npm:

```bash
npm i -g moduly-cli
```

## Quick Start
Navigate to any JavaScript or TypeScript project on your machine, and type:

```bash
moduly analyze --report
```

Moduly will immediately orchestrate seven specialized analysis modules over your codebase. Once completed, the CLI will automatically launch the **Moduly Dashboard** in your browser (`https://moduly-zeta.vercel.app/dashboard`).

### Commands & Flags
- `moduly analyze` — Scans the entire project and outputs structural logs locally within a `.moduly/` folder.
  - `--report`: Generates the `report.json` struct, saves it, and pushes it directly to the live dashboard.
  - `--open`: Manually forces the dashboard to open.
- `moduly ai <on|off>` — Toggles AI-assisted commit anomaly detection on or off across project runs.

## Output format
A successful `analyze --report` generates a highly structured `report.json` that looks like this:
```json
{
  "projectName": "my-app",
  "score": 87,
  "stats": { ... },
  "dependencies": {
    "nodes": [...],
    "links": [...]
  },
  "packageDependencies": { ... },
  "security": [ ... ],
  "performance": [ ... ]
}
```

## Note on `@schemerr/moduly`
If you previously saw an accidentally scopes npm package named `@schemerr/moduly`, feel free to ignore or delete it from your npm portal. `moduly-cli` is the clean, official, globally unique package name!

---

**Made for modern developer workflows.**
