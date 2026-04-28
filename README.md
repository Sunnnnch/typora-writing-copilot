[English](./README.md) | [简体中文](./README.zh-CN.md)

# Typora Writing Copilot

Typora Writing Copilot is a standalone AI writing assistant for Typora.

## What It Is

This project is not a generic chat page embedded in Typora.
It is a writing-focused copilot built around:

- multi-turn chat
- selection rewrite
- document Q&A
- cited web search
- writing workflows for structure analysis, AI comments, writing checks, and note organization

## Current Features

- right-side AI panel
- one-click writing workflows: document structure, cited search, AI comments, writing check, note organization
- selection floating toolbar
- Chinese / English runtime switching
- conversation history bound to the current document
- provider cards, model suggestions, and connection testing
- replacement preview, optional auto-apply rewrite actions, and undo
- regenerate / retry actions
- copyable search sources
- slash commands for workflows: `/outline`, `/cite`, `/comment`, `/check`, `/organize`
- Typora shell adapter
- Windows installer, uninstaller, and GUI installer

## Provider Status

- `OpenAI-compatible` providers use a live HTTP `chat/completions` transport
- `Gemini` uses the live Google Generative Language API transport
- web search uses the live Tavily Search API adapter

The settings panel includes provider credentials, common model suggestions, connection testing, and Tavily search credentials.
If a model is configured, the test button sends a lightweight generation request instead of only listing models.

## Project Structure

- `src/`: runtime, UI, provider layer, Typora adapter
- `bin/`: Windows install / uninstall scripts and GUI installer
- `demo/`: browser-side preview demo
- `docs/`: product and architecture notes
- `scripts/`: local checks

## Windows Install

Recommended:

```bat
.\bin\install_windows_gui.bat
```

The GUI installer lets you:

- choose the Typora folder
- choose where plugin files should be stored
- install, uninstall, or restore the original `window.html` backup without typing command-line arguments

CLI alternatives:

```bat
.\bin\install_windows.bat
```

```powershell
.\bin\install_windows.bat -TyporaPath "C:\Program Files\Typora"
```

```powershell
.\bin\install_windows.bat -TyporaPath "C:\Program Files\Typora" -PluginHome "D:\TyporaPlugins\WritingCopilot"
```

Parameters:

- `-TyporaPath`: Typora install folder, the folder that contains `window.html`, or the full `window.html` path
- `-PluginHome`: custom folder for plugin runtime files

If you use a custom `-PluginHome`, pass the same value to `uninstall_windows.bat` when removing the plugin.

## Manual Dev Injection

If you still want the temporary development flow, open Typora DevTools and run:

```js
import("file:///C:/path/to/typora-writing-copilot/src/entry-typora.js")
```

This only affects the current Typora window and disappears after restart.

## Local Development

Install nothing extra for the current lightweight checks, then run:

```powershell
npm run check
```

## Notes

- Provider configuration is currently stored in local browser storage, not the system credential store.
- System credential storage still requires a native helper; the Typora page cannot safely read Windows Credential Manager directly.
- Tavily search requires its own API key in Settings.
- This repository is intended to be used as an independent project, not as a subdirectory of another plugin platform.
- Before publishing, review your local runtime storage separately; API keys are not meant to live in tracked files.
