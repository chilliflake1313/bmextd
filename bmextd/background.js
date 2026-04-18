const SAVE_SHORTCUT_COMMAND = 'save-to-default-bookmarks';
const DEFAULT_SECTION_NAME = 'Quick-Save';

chrome.commands.onCommand.addListener((command) => {
	console.log('[bmextd] Command received:', command);
	if (command !== SAVE_SHORTCUT_COMMAND) return;

	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (!tabs || tabs.length === 0) {
			console.warn('[bmextd] No active tabs found');
			return;
		}

		const activeTab = tabs[0];
		const url = activeTab.url;
		if (!url) {
			console.warn('[bmextd] Active tab has no URL');
			return;
		}
		if (!/^https?:\/\//i.test(url)) {
			console.warn('[bmextd] URL is not http/https:', url);
			return;
		}

		const title = activeTab.title || url;
		console.log('[bmextd] Saving bookmark:', { title, url });
		addBookmarkToSection(url, title, DEFAULT_SECTION_NAME);
	});
});

function addBookmarkToSection(url, title, sectionName) {
	chrome.storage.local.get(['bookmarksData'], (result) => {
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
					console.error('[bmextd] Storage error:', chrome.runtime.lastError);
				} else {
					console.log('[bmextd] Bookmark saved successfully');
				}
			});
		} catch (error) {
			console.error('[bmextd] Error saving bookmark:', error);
		}
	});
}

function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getFaviconUrl(url) {
	return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`;
}
