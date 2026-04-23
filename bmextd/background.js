const SAVE_SHORTCUT_COMMAND = 'save-to-default-bookmarks';
const DEFAULT_SECTION_NAME = 'Quick-Save';
let saveQueue = Promise.resolve();

chrome.commands.onCommand.addListener(async (command) => {
	console.log('[bmextd] Command received: - background.js:6', command);
	if (command !== SAVE_SHORTCUT_COMMAND) return;

	saveQueue = saveQueue
		.then(() => saveCurrentActiveTab())
		.catch((error) => {
			console.error('[bmextd] Shortcut save failed - background.js:12', error);
		});

	await saveQueue;
});

async function saveCurrentActiveTab() {
	const activeTab = await findBestActiveTab();
	if (!activeTab) {
		console.warn('[bmextd] No active tabs found - background.js:21');
		return;
	}

	const url = activeTab.url || activeTab.pendingUrl;
	if (!url) {
		console.warn('[bmextd] Active tab has no URL or pending URL - background.js:27');
		return;
	}

	if (!isBookmarkableUrl(url)) {
		console.warn('[bmextd] Skipping nonbookmarkable URL - background.js:32', url);
		return;
	}

	const title = (activeTab.title && activeTab.title.trim()) || url;
	console.log('[bmextd] Saving bookmark: - background.js:37', { title, url });
	await addBookmarkToSection(url, title, DEFAULT_SECTION_NAME);
}

async function findBestActiveTab() {
	const focused = await getLastFocusedWindow();
	if (focused && typeof focused.id === 'number') {
		const focusedTabs = await queryTabs({ active: true, windowId: focused.id });
		if (focusedTabs.length > 0) {
			return focusedTabs[0];
		}
	}

	const currentWindowTabs = await queryTabs({ active: true, currentWindow: true });
	if (currentWindowTabs.length > 0) {
		return currentWindowTabs[0];
	}

	const lastFocusedWindowTabs = await queryTabs({ active: true, lastFocusedWindow: true });
	if (lastFocusedWindowTabs.length > 0) {
		return lastFocusedWindowTabs[0];
	}

	const anyActiveTabs = await queryTabs({ active: true });
	if (anyActiveTabs.length > 0) {
		return anyActiveTabs[0];
	}

	return null;
}

function getLastFocusedWindow() {
	return new Promise((resolve) => {
		chrome.windows.getLastFocused({ populate: false }, (windowInfo) => {
			if (chrome.runtime.lastError) {
				resolve(null);
				return;
			}

			resolve(windowInfo || null);
		});
	});
}

function queryTabs(queryInfo) {
	return new Promise((resolve) => {
		chrome.tabs.query(queryInfo, (tabs) => {
			if (chrome.runtime.lastError) {
				console.warn('[bmextd] tabs.query failed - background.js:85', chrome.runtime.lastError.message);
				resolve([]);
				return;
			}

			resolve(Array.isArray(tabs) ? tabs : []);
		});
	});
}

function addBookmarkToSection(url, title, sectionName) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(['bookmarksData'], (result) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}

			try {
				const data = result.bookmarksData || { sections: [] };

				if (!Array.isArray(data.sections)) {
					data.sections = [];
				}

				let targetSection = data.sections.find((section) => section && section.name === sectionName);
				if (!targetSection) {
					targetSection = {
						id: generateId(),
						name: sectionName,
						items: []
					};
					data.sections.unshift(targetSection);
				}

				if (!Array.isArray(targetSection.items)) {
					targetSection.items = [];
				}

				const normalizedUrl = normalizeUrl(url);
				const alreadyExists = targetSection.items.some((item) => normalizeUrl(item && item.url) === normalizedUrl);
				if (alreadyExists) {
					console.log('[bmextd] Bookmark already exists in QuickSave - background.js:127', url);
					resolve();
					return;
				}

				targetSection.items.push({
					id: generateId(),
					label: title || url,
					url,
					icon: getFaviconUrl(url),
					favorite: false
				});

				chrome.storage.local.set({ bookmarksData: data }, () => {
					if (chrome.runtime.lastError) {
						reject(chrome.runtime.lastError);
						return;
					}

					console.log('[bmextd] Bookmark saved successfully - background.js:146');
					resolve();
				});
			} catch (error) {
				reject(error);
			}
		});
	});
}

function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getFaviconUrl(url) {
	return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`;
}

function normalizeUrl(url) {
	return String(url || '').trim().toLowerCase().replace(/\/$/, '');
}

function isBookmarkableUrl(url) {
	return /^https?:\/\//i.test(String(url || ''));
}
