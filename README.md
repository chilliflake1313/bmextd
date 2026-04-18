bmextd- A simple Chrome bookmark extension.



## How to add in Developer Mode (Load Unpacked)

1. Open Chrome.
2. Go to: chrome://extensions
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this folder: `bmextd/bmextd`
6. The extension is now added.

If you change code:
- Go to chrome://extensions
- Click **Reload** on this extension.

How to remove/unload:
- Go to chrome://extensions
- Click **Remove**.

## Features

https://github.com/user-attachments/assets/3cc8276e-2cc3-424c-9c1c-859dce23341b



- Create folders (sections) for bookmarks.
- Add, edit, and delete bookmarks.
- Open bookmarks in a new tab.
- Search bookmarks and folder names.
- Mark/unmark bookmarks as favorite.
- Show favorites-only view.
- Drag and drop bookmarks between folders.
- Drag and reorder folders.
- Quick save current tab with shortcut: **Ctrl + Shift + X** (saves to **Quick-Save**).
- Import bookmarks from an HTML file.
- Export bookmarks to an HTML file.
- Light/Dark theme toggle.

## Limitations

- Works on Chromium-based browsers (uses Chrome extension APIs).
- Data is saved in local browser storage only (no cloud sync/account sync built in).
- Shortcut can conflict with other browser/system shortcuts.
- Quick save shortcut only saves normal web pages (http/https tabs).
- No advanced duplicate management for bookmarks.
- With very large bookmark lists, popup performance may feel slower.
