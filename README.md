# 16competitive-client

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
