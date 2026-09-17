# NEXUS — Universal Game Launcher for Windows

A real, native Windows desktop application (Electron + React + TypeScript) that:

- **Detects every game** installed on your system across 8 stores
- **Lets you add games manually** that weren't auto-detected
- **Patches rich metadata** (cover art, description, genres, ratings) via the [RAWG API](https://rawg.io/apidocs)
- **Launches games natively** through each store's real protocol handler
- Has a **minimal, sleek, black, modern** UI

This is a genuine Windows `.exe` tool — not a website. The build pipeline produces an NSIS installer and a portable `.exe` via `electron-builder`.

---

## How detection works (real, not gimmick)

Each detector reads the **actual** install records your stores write to disk / registry:

| Store | Detection source | Launch mechanism |
|-------|------------------|-------------------|
| **Steam** | `steamapps\libraryfolders.vdf` + `appmanifest_*.vdf` (parsed VDF) + `HKCU\Software\Valve\Steam` | `steam://run/<appid>` |
| **Epic Games** | `C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat` (JSON) | `com.epicgames.launcher://apps/<app>?action=launch&silent=true` |
| **GOG Galaxy** | `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<id>` registry | `gog://<id>` |
| **Battle.net** | `C:\ProgramData\Blizzard Entertainment\Battle.net\Agent\agent.db` (SQLite) | `battlenet://<uid>` |
| **EA App** | `HKLM\SOFTWARE\WOW6432Node\EA Games` + `EA Desktop\InstalledContent.csv` | `origin2://game/launch?offerIds=<id>` |
| **Ubisoft Connect** | `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>` + uninstall entries | `uplay://launch/<id>/0` |
| **Riot Client** | `C:\Riot Games\*` install paths + `HKLM\SOFTWARE\Riot Games` | `valorant://`, `leagueoflegends://`, `lor://` |
| **Xbox / Game Pass** | PowerShell `Get-AppxPackage` enumeration | `shell:appsfolder:<PFN>!<AppId>` |

Every detector is **read-only** — no files are modified on your system.

---

## Build & run

### Prerequisites
- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- Windows 10 or 11 (for running; for building the `.exe` you must build on Windows or via CI)

### Install dependencies
```bash
npm install
```

> `better-sqlite3` is a native module. After install, rebuild it for Electron:
> ```bash
> npm run rebuild
> ```

### Run in development
```bash
npm run dev
```
Launches the Vite dev server + Electron together with hot reload.

### Build the Windows installer (.exe)
```bash
npm run dist
```
Produces, in `release/`:
- `NEXUS-Setup-1.0.0.exe` — NSIS installer (with desktop + Start Menu shortcuts)
- `NEXUS-Portable-1.0.0.exe` — single-file portable executable

### Build just one target
```bash
npm run dist:nsis       # installer only
npm run dist:portable   # portable only
```

---

## RAWG API key (for metadata)

1. Get a free key at <https://rawg.io/apidocs>
2. Open NEXUS → Settings → paste the key into "RAWG API Key"
3. Click "Patch Metadata" on any game to fetch cover art + description + genres + rating

Without a key, NEXUS still detects and launches games — only the metadata patching needs RAWG.

---

## Project structure

```
nexus-launcher/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts                # App entry, BrowserWindow
│   │   ├── preload.ts              # Secure IPC bridge (contextBridge)
│   │   ├── ipc.ts                  # IPC handlers
│   │   ├── db.ts                   # better-sqlite3 local store
│   │   ├── detectors/              # Real Windows game detection
│   │   │   ├── steam.ts            #   Steam VDF parsing
│   │   │   ├── epic.ts             #   Epic LauncherInstalled.dat
│   │   │   ├── gog.ts              #   GOG registry
│   │   │   ├── battlenet.ts        #   Battle.net agent.db (SQLite)
│   │   │   ├── ea.ts               #   EA registry + InstalledContent.csv
│   │   │   ├── ubisoft.ts          #   Ubisoft registry
│   │   │   ├── riot.ts             #   Riot install paths
│   │   │   ├── xbox.ts             #   Xbox AppxPackage (PowerShell)
│   │   │   ├── registry.ts         #   reg.exe wrapper
│   │   │   └── vdf.ts              #   VDF parser
│   │   ├── launchers/index.ts      # Real game launching (shell.openExternal)
│   │   └── metadata/rawg.ts        # RAWG API client
│   ├── renderer/                  # React UI (Vite)
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── styles.css
│   └── shared/types.ts            # Shared types + platform metadata
├── resources/                      # App icon
├── .github/workflows/build.yml    # CI: builds Windows .exe on push
├── electron-builder.yml           # (config is in package.json "build")
├── package.json
└── vite.config.ts
```

---

## CI: automatic Windows builds

The included GitHub Actions workflow (`.github/workflows/build.yml`) builds the Windows installer on every push to `main`. Download the built `.exe` from the workflow's **Artifacts** section.

---

## Security

- `contextIsolation` is ON, `nodeIntegration` is OFF
- The renderer only talks to the main process through a minimal, typed `window.nexus` API
- All file/registry/network access happens in the main process
- A Content-Security-Policy restricts renderer network access to `self` + `api.rawg.io`

## License

MIT
