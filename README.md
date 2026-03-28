# Zotodo

Add Todoist tasks for papers in Zotero. Install by downloading the [latest version](https://github.com/kiastien/zotodo/releases/latest).
Scaffolded with
[`zotero-plugin-template`](https://github.com/windingwind/zotero-plugin-template)
and powered by [`zotero-plugin-scaffold`](https://github.com/northword/zotero-plugin-scaffold).

## Features
- Automatically generate Todoist tasks when new papers are imported
- Generate Todoist tasks for existing papers
- Templating of task and optional task comment, including paper information (authors, title,
  abstract, etc.)
- Customizable project, section, and due date settings
- Customizable labels for tasks
- Generate Zotero select links
- Generate Zotero PDF opening links

## Installation
1. Download the [latest version](https://github.com/kiastien/zotodo/releases/latest) of the `.xpi`.
2. In Zotero, go to Tools > Add-ons.
3. Click the  gear icon in the upper right corner, and select "Install Add-On From File".
4. Navigate to where you downloaded the Zotodo `.xpi` and select it.

## Development
1. Copy environment variables: `cp .env.example .env`
2. Set your Zotero executable/profile path in `.env`
3. Install deps: `npm install`
4. Start dev mode with auto-reload: `npm start`
5. Build production package: `npm run build`

## Configuration
- See "Zotodo Preferences" in the "Tools" menu.

## Notes
- You **must** set your Todoist API key in the preferences for this plugin to work. OAuth might be
  implemented eventually, but it's not there right now.
- For select links to work, you may need to set up handling of the `zotero://` protocol on your
  computer.

## TODO/Future features
- [x] Create project/labels if nonexistent
- [ ] OAuth flow for getting authorization key
- [ ] Set project by Zotero collection
- [x] Add more template tokens
- [ ] Switch to official Todoist API client



