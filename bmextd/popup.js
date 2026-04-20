// Global state
let currentData = null;
let currentContextMenu = null;
let draggedItem = null;
let draggedFromSection = null;
let draggedSectionId = null;
let showFavoritesOnly = false;
let popupSaveQueue = Promise.resolve();

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
applySavedTheme();
await loadData();
setupStorageSync();
setupEventListeners();
KeyboardUtils.init();
optimizeRendering();
});

window.addEventListener('error', (e) => {
console.error('Extension error: - popup.js:21', e.error);
});

async function loadData() {
currentData = await StorageUtils.getData();
if (!currentData || !Array.isArray(currentData.sections)) {
	currentData = { sections: [] };
}
renderContent();
}

async function saveData() {
	const snapshot = JSON.parse(JSON.stringify(currentData || { sections: [] }));
	popupSaveQueue = popupSaveQueue.then(() => StorageUtils.saveData(snapshot));
	await popupSaveQueue;
}

function setupStorageSync() {
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local' || !changes.bookmarksData) return;

		const latest = changes.bookmarksData.newValue;
		currentData = latest && Array.isArray(latest.sections)
			? latest
			: { sections: [] };

		renderContent();
	});
}

function renderContent() {
const searchInput = document.getElementById('searchInput');
const query = searchInput ? searchInput.value.trim() : '';

if (showFavoritesOnly) {
renderFavoritesOnly();
} else if (query) {
renderSearchResults(query);
} else {
renderSections();
}
}

function renderFavoritesOnly() {
const mainContent = document.getElementById('mainContent');
if (!mainContent) return;

const favorites = [];
currentData.sections.forEach((section) => {
	section.items.forEach((item) => {
		if (item.favorite) {
			favorites.push({ ...item, sectionId: section.id });
		}
	});
});

mainContent.innerHTML = '';
if (favorites.length === 0) {
	mainContent.innerHTML = '<div class="empty-state">No favorite bookmarks yet.</div>';
	return;
}

mainContent.innerHTML = `
<div class="section">
<div class="section-header">
<h2 class="section-title">Favorites</h2>
</div>
<div class="section-divider"></div>
<div class="bookmarks-grid" data-section-id="favorites">
${favorites.map((item) => createBookmarkHTML(item, item.sectionId)).join('')}
</div>
</div>
`;

attachBookmarkListeners();
}

function renderSections() {
const mainContent = document.getElementById('mainContent');
mainContent.innerHTML = '';

if (!currentData || currentData.sections.length === 0) {
mainContent.innerHTML = '<div class="empty-state">No folders yet. Click the folder button to add one.</div>';
return;
}

currentData.sections.forEach((section) => {
mainContent.appendChild(createSectionElement(section));
});

attachBookmarkListeners();
}

function createSectionElement(section) {
const sectionDiv = document.createElement('section');
sectionDiv.className = 'section';
sectionDiv.dataset.sectionId = section.id;
const sectionHint = section.name === 'Quick-Save'
? '<div class="section-hint">Ctrl + Shift + X to save page.</div>'
: '';

sectionDiv.innerHTML = `
<div class="section-header">
<div class="section-title-wrap">
<h2 class="section-title" data-section-id="${section.id}">${escapeHtml(section.name)}</h2>
${sectionHint}
</div>
</div>
<div class="section-divider"></div>
<div class="bookmarks-grid" data-section-id="${section.id}">
${section.items.map((item) => createBookmarkHTML(item, section.id)).join('')}
</div>
`;

const titleEl = sectionDiv.querySelector('.section-title');
const grid = sectionDiv.querySelector('.bookmarks-grid');
const headerEl = sectionDiv.querySelector('.section-header');

titleEl.addEventListener('dblclick', () => openSectionModal(section.id, section.name));

if (headerEl) {
headerEl.setAttribute('draggable', 'true');
headerEl.classList.add('section-draggable');
headerEl.addEventListener('dragstart', handleSectionDragStart);
headerEl.addEventListener('dragend', handleSectionDragEnd);
}

sectionDiv.addEventListener('dragover', handleSectionDragOver);
sectionDiv.addEventListener('dragleave', handleSectionDragLeave);
sectionDiv.addEventListener('drop', handleSectionDrop);

sectionDiv.addEventListener('contextmenu', (e) => {
if (e.target.closest('.bookmark-item')) return;
e.preventDefault();
showContextMenu(e, section.id, '', 'section');
});

grid.addEventListener('dblclick', (e) => {
if (e.target.closest('.bookmark-item')) return;
openBookmarkModal(section.id);
});

setupDragAndDrop(grid);
return sectionDiv;
}

function createBookmarkHTML(item, sectionId) {
const faviconUrl = item.icon || DataUtils.getFaviconUrl(item.url);
const cleanName = String(item.label || '').trim() || getSiteName(item.url);
const fallbackLetter = DataUtils.getFirstLetter(cleanName);
const favoriteClass = item.favorite ? 'favorite' : '';

return `
<div class="bookmark-item ${favoriteClass}"
draggable="true"
data-item-id="${item.id}"
data-section-id="${sectionId}"
title="${escapeHtml(cleanName)}\n${escapeHtml(item.url)}">
<img src="${escapeHtml(faviconUrl)}" class="bookmark-icon" alt="">
<span class="bookmark-fallback">${escapeHtml(fallbackLetter)}</span>
<span class="bookmark-label">${escapeHtml(cleanName)}</span>
</div>
`;
}

function renderSearchResults(query) {
const mainContent = document.getElementById('mainContent');
const normalizedQuery = query.toLowerCase();
const matchedSections = currentData.sections
.map((section) => {
const sectionMatches = section.name.toLowerCase().includes(normalizedQuery);
const matchedItems = section.items.filter((item) => (
item.label.toLowerCase().includes(normalizedQuery) ||
getSiteName(item.url).toLowerCase().includes(normalizedQuery) ||
item.url.toLowerCase().includes(normalizedQuery)
));

if (!sectionMatches && matchedItems.length === 0) return null;

return {
...section,
items: sectionMatches ? section.items : matchedItems
};
})
.filter(Boolean);

mainContent.innerHTML = '';
if (matchedSections.length === 0) {
mainContent.innerHTML = '<div class="empty-state">No matching folders or bookmarks found.</div>';
return;
}

matchedSections.forEach((section) => {
mainContent.appendChild(createSectionElement(section));
});

attachBookmarkListeners();
}

function getSiteName(url) {
try {
const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
const parts = hostname.split('.').filter(Boolean);
if (parts.length <= 1) return parts[0] || 'link';

const multiPartSuffixes = new Set([
 'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
 'co.in', 'com.in', 'org.in', 'net.in', 'edu.in', 'gov.in', 'ac.in', 'res.in', 'nic.in', 'firm.in', 'gen.in', 'ind.in',
 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
 'co.nz', 'com.br', 'net.br', 'org.br',
 'com.sg', 'com.my', 'com.ph',
 'co.jp', 'ne.jp', 'or.jp', 'go.jp'
]);

const suffix = parts.slice(-2).join('.');
if (multiPartSuffixes.has(suffix) && parts.length >= 3) {
 return parts[parts.length - 3] || 'link';
}

return parts[parts.length - 2] || 'link';
} catch (error) {
return 'link';
}
}

function setupEventListeners() {
const searchInput = document.getElementById('searchInput');
const searchContainer = document.getElementById('searchContainer');
const searchToggleBtn = document.getElementById('searchToggleBtn');
const addFolderBtn = document.getElementById('addFolderBtn');
const favoritesToggleBtn = document.getElementById('favoritesToggleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const importInput = document.getElementById('importInput');
const mainContent = document.getElementById('mainContent');

if (searchInput) {
searchInput.addEventListener('input', debounce(() => {
renderContent();
}, 220));
}

if (searchToggleBtn && searchContainer && searchInput) {
searchToggleBtn.addEventListener('click', () => {
searchContainer.classList.toggle('hidden');
if (!searchContainer.classList.contains('hidden')) {
searchInput.focus();
} else {
searchInput.value = '';
renderContent();
}
});
}

if (addFolderBtn) {
addFolderBtn.addEventListener('click', () => openSectionModal());
}

if (favoritesToggleBtn) {
	favoritesToggleBtn.addEventListener('click', () => {
		showFavoritesOnly = !showFavoritesOnly;
		favoritesToggleBtn.classList.toggle('active', showFavoritesOnly);
		if (showFavoritesOnly && searchInput) {
			searchInput.value = '';
		}
		renderContent();
	});
}

if (themeToggleBtn) {
	themeToggleBtn.addEventListener('click', toggleTheme);
}

if (exportBtn) {
exportBtn.addEventListener('click', () => DataUtils.exportData(currentData));
}

if (importBtn && importInput) {
importBtn.addEventListener('click', () => importInput.click());
}

if (importInput) {
importInput.addEventListener('change', async (e) => {
const file = e.target.files[0];
if (!file) return;
try {
const beforeCount = currentData?.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0;
console.log('[bmextd] Import HANDLER: currentData at start has', beforeCount, 'bookmarks');
console.log('[bmextd] Import HANDLER: currentData sections:', currentData?.sections?.map(s => ({ name: s.name, items: s.items?.length || 0 })));

console.log('[bmextd] Import HANDLER: Calling DataUtils.importData...');
const merged = await DataUtils.importData(file);
const importedCount = merged?.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0;
console.log('[bmextd] Import HANDLER: importData returned merged with', importedCount, 'bookmarks');
console.log('[bmextd] Import HANDLER: merged sections:', merged?.sections?.map(s => ({ name: s.name, items: s.items?.length || 0 })));

currentData = merged;
console.log('[bmextd] Import HANDLER: Setting currentData = merged');

console.log('[bmextd] Import HANDLER: Calling saveData...');
await saveData();
console.log('[bmextd] Import HANDLER: saveData complete');

console.log('[bmextd] Import HANDLER: Calling loadData...');
await loadData();
console.log('[bmextd] Import HANDLER: loadData complete');

const afterCount = currentData?.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0;
console.log('[bmextd] Import HANDLER: After reload, currentData has', afterCount, 'bookmarks');

alert(`Import complete: Before=${beforeCount}, After=${afterCount}, Imported=${importedCount}`);

e.target.value = '';
} catch (error) {
alert('Failed to import data: ' + error.message);
console.error('[bmextd] Import error: - popup.js:327', error);
}
});
}

if (mainContent) {
mainContent.addEventListener('wheel', (event) => {
if (!draggedItem && !draggedSectionId) return;
mainContent.scrollTop += event.deltaY;
event.preventDefault();
}, { passive: false });

mainContent.addEventListener('dragover', (event) => {
if (!draggedItem && !draggedSectionId) return;
const rect = mainContent.getBoundingClientRect();
const edgeThreshold = 70;
const scrollAmount = 14;

if (event.clientY < rect.top + edgeThreshold) {
mainContent.scrollTop -= scrollAmount;
} else if (event.clientY > rect.bottom - edgeThreshold) {
mainContent.scrollTop += scrollAmount;
}
});
}

const sectionModalForm = document.getElementById('sectionModalForm');
const sectionModalCancel = document.getElementById('sectionModalCancel');
if (sectionModalForm) sectionModalForm.addEventListener('submit', handleSectionFormSubmit);
if (sectionModalCancel) sectionModalCancel.addEventListener('click', closeSectionModal);

const modalForm = document.getElementById('modalForm');
const modalCancel = document.getElementById('modalCancel');
if (modalForm) modalForm.addEventListener('submit', handleBookmarkFormSubmit);
if (modalCancel) modalCancel.addEventListener('click', closeBookmarkModal);

document.addEventListener('click', closeContextMenu);
const contextMenu = document.getElementById('contextMenu');
if (contextMenu) contextMenu.addEventListener('click', handleContextMenuAction);
}

function attachBookmarkListeners() {
document.querySelectorAll('.bookmark-item').forEach((item) => {
const icon = item.querySelector('.bookmark-icon');
const fallback = item.querySelector('.bookmark-fallback');
if (icon && fallback) {
icon.addEventListener('error', () => {
icon.style.display = 'none';
fallback.style.display = 'inline-flex';
});
}

item.addEventListener('click', () => {
openBookmarkUrl(item.dataset.sectionId, item.dataset.itemId);
});

item.addEventListener('contextmenu', (e) => {
e.preventDefault();
showContextMenu(e, item.dataset.sectionId, item.dataset.itemId, 'bookmark');
});

item.addEventListener('dragstart', handleDragStart);
item.addEventListener('dragend', handleDragEnd);
});
}

function openBookmarkUrl(sectionId, itemId) {
const section = currentData.sections.find((s) => s.id === sectionId);
if (!section) return;
const item = section.items.find((i) => i.id === itemId);
if (item) chrome.tabs.create({ url: item.url });
}

function openSectionModal(sectionId = '', sectionName = '') {
const modal = document.getElementById('sectionModal');
document.getElementById('sectionModalTitle').textContent = sectionId ? 'Edit Folder' : 'Add Folder';
document.getElementById('sectionModalId').value = sectionId;
document.getElementById('sectionModalName').value = sectionName;
modal.classList.remove('hidden');
document.getElementById('sectionModalName').focus();
}

function closeSectionModal() {
document.getElementById('sectionModal').classList.add('hidden');
document.getElementById('sectionModalForm').reset();
}

async function handleSectionFormSubmit(e) {
e.preventDefault();
const sectionId = document.getElementById('sectionModalId').value;
const sectionName = document.getElementById('sectionModalName').value.trim();
if (!sectionName) return;

currentData = sectionId
? DataUtils.editSection(currentData, sectionId, sectionName)
: DataUtils.addSection(currentData, sectionName);

await saveData();
await loadData();
closeSectionModal();
}

async function deleteSection(sectionId) {
const section = currentData.sections.find((s) => s.id === sectionId);
if (!section) return;
const confirmMsg = section.items.length > 0
? `Delete "${section.name}" and all its ${section.items.length} bookmarks?`
: `Delete "${section.name}"?`;
if (!confirm(confirmMsg)) return;
currentData = DataUtils.deleteSection(currentData, sectionId);
await saveData();
await loadData();
}

function openBookmarkModal(sectionId, itemId = '') {
const modal = document.getElementById('modal');
const title = document.getElementById('modalTitle');
const sectionIdInput = document.getElementById('modalSectionId');
const itemIdInput = document.getElementById('modalItemId');
const labelInput = document.getElementById('modalLabel');
const urlInput = document.getElementById('modalUrl');

sectionIdInput.value = sectionId;
itemIdInput.value = '';
labelInput.value = '';
urlInput.value = '';

if (itemId) {
const section = currentData.sections.find((s) => s.id === sectionId);
const item = section ? section.items.find((i) => i.id === itemId) : null;
if (item) {
title.textContent = 'Edit Bookmark';
itemIdInput.value = itemId;
labelInput.value = item.label;
urlInput.value = item.url;
}
} else {
title.textContent = 'Add Bookmark';
}

modal.classList.remove('hidden');
labelInput.focus();
}

function closeBookmarkModal() {
document.getElementById('modal').classList.add('hidden');
document.getElementById('modalForm').reset();
}

async function handleBookmarkFormSubmit(e) {
e.preventDefault();
const sectionId = document.getElementById('modalSectionId').value;
const itemId = document.getElementById('modalItemId').value;
const label = document.getElementById('modalLabel').value.trim();
const urlInput = document.getElementById('modalUrl').value.trim();

if (ValidationUtils.isEmptyString(label) || ValidationUtils.isEmptyString(urlInput)) return;
if (!ValidationUtils.isValidUrl(urlInput)) {
alert('Please enter a valid URL.');
return;
}

const url = ValidationUtils.sanitizeUrl(urlInput);
currentData = itemId
? DataUtils.editBookmark(currentData, sectionId, itemId, label, url)
: DataUtils.addBookmark(currentData, sectionId, label, url);

await saveData();
await loadData();
closeBookmarkModal();
}

async function deleteBookmark(sectionId, itemId) {
currentData = DataUtils.deleteBookmark(currentData, sectionId, itemId);
await saveData();
await loadData();
}

async function toggleFavorite(sectionId, itemId) {
currentData = DataUtils.toggleFavorite(currentData, sectionId, itemId);
await saveData();
await loadData();
}

function showContextMenu(event, sectionId, itemId, contextType = 'bookmark') {
const contextMenu = document.getElementById('contextMenu');
currentContextMenu = { sectionId, itemId, contextType };
const favoriteItem = contextMenu.querySelector('[data-action="favorite"]');
if (favoriteItem) {
favoriteItem.style.display = contextType === 'section' ? 'none' : '';
}
contextMenu.classList.remove('hidden');

const margin = 8;
const menuRect = contextMenu.getBoundingClientRect();
const maxLeft = window.innerWidth - menuRect.width - margin;
const maxTop = window.innerHeight - menuRect.height - margin;
const left = Math.max(margin, Math.min(event.clientX, maxLeft));
const top = Math.max(margin, Math.min(event.clientY, maxTop));
contextMenu.style.left = `${left}px`;
contextMenu.style.top = `${top}px`;
}

function closeContextMenu() {
const contextMenu = document.getElementById('contextMenu');
if (contextMenu) contextMenu.classList.add('hidden');
currentContextMenu = null;
}

async function handleContextMenuAction(event) {
const actionEl = event.target.closest('.context-item');
if (!actionEl || !currentContextMenu) return;
const { sectionId, itemId, contextType } = currentContextMenu;

if (actionEl.dataset.action === 'edit') {
if (contextType === 'section') {
openSectionModal(sectionId, currentData.sections.find((section) => section.id === sectionId)?.name || '');
} else {
openBookmarkModal(sectionId, itemId);
}
}
if (actionEl.dataset.action === 'delete') {
if (contextType === 'section') {
await deleteSection(sectionId);
} else if (confirm('Delete this bookmark?')) {
await deleteBookmark(sectionId, itemId);
}
}
if (actionEl.dataset.action === 'favorite') {
await toggleFavorite(sectionId, itemId);
}

closeContextMenu();
}

function setupDragAndDrop(grid) {
grid.addEventListener('dragover', (event) => {
event.preventDefault();
grid.classList.add('drag-over');
});

grid.addEventListener('dragleave', () => {
grid.classList.remove('drag-over');
});

grid.addEventListener('drop', async (event) => {
event.preventDefault();
grid.classList.remove('drag-over');
const targetSectionId = grid.dataset.sectionId;

if (!draggedItem || !draggedFromSection || draggedFromSection === targetSectionId) return;

currentData = DataUtils.moveBookmark(
currentData,
draggedItem.dataset.itemId,
draggedFromSection,
targetSectionId
);
await saveData();
await loadData();
});
}

function handleDragStart(event) {
const item = event.currentTarget;
draggedItem = item;
draggedFromSection = item.dataset.sectionId;
item.classList.add('dragging');
event.dataTransfer.effectAllowed = 'move';

const dragImage = item.cloneNode(true);
dragImage.style.opacity = '0.85';
document.body.appendChild(dragImage);
dragImage.style.position = 'absolute';
dragImage.style.top = '-1000px';
event.dataTransfer.setDragImage(dragImage, 30, 20);
setTimeout(() => dragImage.remove(), 0);
}

function handleDragEnd(event) {
event.currentTarget.classList.remove('dragging');
document.querySelectorAll('.bookmarks-grid').forEach((grid) => {
grid.classList.remove('drag-over');
});
draggedItem = null;
draggedFromSection = null;
}

function handleSectionDragStart(event) {
const sectionEl = event.currentTarget.closest('.section');
if (!sectionEl) return;

draggedSectionId = sectionEl.dataset.sectionId;
sectionEl.classList.add('section-dragging');
event.dataTransfer.effectAllowed = 'move';
}

function handleSectionDragEnd(event) {
const sectionEl = event.currentTarget.closest('.section');
if (sectionEl) {
	sectionEl.classList.remove('section-dragging');
}

document.querySelectorAll('.section').forEach((section) => {
	section.classList.remove('section-drag-over');
});

draggedSectionId = null;
}

function handleSectionDragOver(event) {
if (!draggedSectionId) return;

const sectionEl = event.currentTarget;
if (!sectionEl || sectionEl.dataset.sectionId === draggedSectionId) return;

event.preventDefault();
sectionEl.classList.add('section-drag-over');
}

function handleSectionDragLeave(event) {
const sectionEl = event.currentTarget;
if (sectionEl) {
	sectionEl.classList.remove('section-drag-over');
}
}

async function handleSectionDrop(event) {
if (!draggedSectionId) return;

event.preventDefault();
const targetSectionEl = event.currentTarget;
if (!targetSectionEl) return;

targetSectionEl.classList.remove('section-drag-over');
const targetSectionId = targetSectionEl.dataset.sectionId;
if (!targetSectionId || targetSectionId === draggedSectionId) return;

const fromIndex = currentData.sections.findIndex((section) => section.id === draggedSectionId);
const toIndex = currentData.sections.findIndex((section) => section.id === targetSectionId);
if (fromIndex === -1 || toIndex === -1) return;

const [movedSection] = currentData.sections.splice(fromIndex, 1);
currentData.sections.splice(toIndex, 0, movedSection);

await saveData();
await loadData();
}

function escapeHtml(text) {
const div = document.createElement('div');
div.textContent = text;
return div.innerHTML;
}

function debounce(fn, wait) {
let timeoutId;
return (...args) => {
clearTimeout(timeoutId);
timeoutId = setTimeout(() => fn(...args), wait);
};
}

function optimizeRendering() {
const totalItems = StatsUtils.getTotalBookmarks(currentData);
if (totalItems > 100) {
console.log('Large dataset detected, optimizing rendering... - popup.js:693');
}
}

function applySavedTheme() {
const savedTheme = localStorage.getItem('bmextd-theme') || 'light';
document.body.dataset.theme = savedTheme;
syncThemeButton(savedTheme);
}

function toggleTheme() {
const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
document.body.dataset.theme = nextTheme;
localStorage.setItem('bmextd-theme', nextTheme);
syncThemeButton(nextTheme);
}

function syncThemeButton(theme) {
const button = document.getElementById('themeToggleBtn');
if (!button) return;

const sunIcon = button.querySelector('.icon-sun');
const moonIcon = button.querySelector('.icon-moon');

if (sunIcon && moonIcon) {
	if (theme === 'dark') {
		sunIcon.classList.add('hidden');
		moonIcon.classList.remove('hidden');
	} else {
		sunIcon.classList.remove('hidden');
		moonIcon.classList.add('hidden');
	}
}
}
