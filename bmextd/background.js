const SAVE_SHORTCUT_COMMAND = 'save-to-default-bookmarks';
const DEFAULT_SECTION_NAME = 'Quick-Save';
let saveQueue = Promise.resolve();

chrome.commands.onCommand.addListener((command) => {
	console.log('[bmextd] Command received: - background.js:6', command);
	if (command !== SAVE_SHORTCUT_COMMAND) return;

	saveQueue = saveQueue
		.then(() => saveCurrentActiveTab())
		.catch((error) => {
			console.error('[bmextd] Shortcut save failed - background.js:12', error);
		});
});

async function saveCurrentActiveTab() {
	const activeTab = await findBestActiveTab();
	if (!activeTab) {
		console.warn('[bmextd] No active tabs found - background.js:19');
		return;
	}

	const url = activeTab.url || activeTab.pendingUrl;
	if (!url) {
		console.warn('[bmextd] Active tab has no URL or pending URL - background.js:25');
		return;
	}

	const title = (activeTab.title && activeTab.title.trim()) || url;
	console.log('[bmextd] Saving bookmark: - background.js:30', { title, url });
	await addBookmarkToSection(url, title, DEFAULT_SECTION_NAME);
}

async function findBestActiveTab() {
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

function queryTabs(queryInfo) {
	return new Promise((resolve) => {
		chrome.tabs.query(queryInfo, (tabs) => {
			if (chrome.runtime.lastError) {
				console.warn('[bmextd] tabs.query failed - background.js:57', chrome.runtime.lastError.message);
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

					console.log('[bmextd] Bookmark saved successfully - background.js:110');
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
