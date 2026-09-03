# 16competitive-client

## Releases and automatic updates

Releases use calendar SemVer: `YYYY.M.D` (for example, `2026.9.3`). Run
`npm run release:date` for today's UTC date, or
`npm run release:date -- 2026.9.3` for a specific date. Commit the changed
`package.json` and `package-lock.json`, then push its matching tag:

```bash
git tag v2026.9.3
git push origin v2026.9.3
```

GitHub Actions verifies that the tag and package version match, builds Windows
and Linux packages, and creates the GitHub Release with the updater metadata.
Packaged Windows and Linux AppImage installs check that release feed at startup,
download updates automatically, and install them when the app exits.

## Environment variables

Copy `.env.example` to `.env` for local main-process configuration. `.env` is
ignored by Git; `API_BASE_URL` and `MATCHMAKING_WS_URL` are compiled into the
main-process bundle at build time and are not exposed to the renderer. Do not
put secrets in any `VITE_*` value: those variables are compiled into and visible
to the renderer. Use GitHub Actions Secrets for build or release credentials
instead.

## Counter-Strike launch configuration

The launcher automatically starts Counter-Strike after the backend reports that
the assigned match server is ready. Choose `hl_linux` or `hl.exe` from the
Settings tab. The validated absolute path is stored in Electron's per-user
configuration directory, whose location is shown in Settings.

The working directory defaults to the executable's directory. Server address
and password are validated and passed as process arguments; no shell command is
constructed. `CS16_CLIENT_EXECUTABLE_PATH` remains available as a development
fallback when no path has been saved through the UI.

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
