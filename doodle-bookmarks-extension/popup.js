// Global state
let currentData = null;
let currentContextMenu = null;
let draggedItem = null;
let draggedFromSection = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
await loadData();
setupEventListeners();
KeyboardUtils.init();
optimizeRendering();
});

window.addEventListener('error', (e) => {
console.error('Extension error:', e.error);
});

async function loadData() {
currentData = await StorageUtils.getData();
renderContent();
}

async function saveData() {
await StorageUtils.saveData(currentData);
}

function renderContent() {
const searchInput = document.getElementById('searchInput');
const query = searchInput ? searchInput.value.trim() : '';

if (query) {
renderSearchResults(query);
} else {
renderSections();
}
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

sectionDiv.innerHTML = `
<div class="section-header">
<h2 class="section-title" data-section-id="${section.id}">${escapeHtml(section.name)}</h2>
</div>
<div class="section-divider"></div>
<div class="bookmarks-grid" data-section-id="${section.id}">
${section.items.map((item) => createBookmarkHTML(item, section.id)).join('')}
</div>
`;

const titleEl = sectionDiv.querySelector('.section-title');
const grid = sectionDiv.querySelector('.bookmarks-grid');

titleEl.addEventListener('dblclick', () => openSectionModal(section.id, section.name));
titleEl.addEventListener('contextmenu', (e) => {
e.preventDefault();
deleteSection(section.id);
});

if (section.items.length === 0) {
grid.addEventListener('click', () => openBookmarkModal(section.id));
}

setupDragAndDrop(grid);
return sectionDiv;
}

function createBookmarkHTML(item, sectionId) {
const faviconUrl = item.icon || DataUtils.getFaviconUrl(item.url);
const fallbackLetter = DataUtils.getFirstLetter(item.label);
const favoriteClass = item.favorite ? 'favorite' : '';

return `
<div class="bookmark-item ${favoriteClass}"
draggable="true"
data-item-id="${item.id}"
data-section-id="${sectionId}"
title="${escapeHtml(item.label)}\n${escapeHtml(item.url)}">
<img src="${escapeHtml(faviconUrl)}" class="bookmark-icon" alt="">
<span class="bookmark-fallback">${escapeHtml(fallbackLetter)}</span>
<span class="bookmark-label">${escapeHtml(item.label)}</span>
</div>
`;
}

function renderSearchResults(query) {
const mainContent = document.getElementById('mainContent');
const results = DataUtils.searchBookmarks(currentData, query);

mainContent.innerHTML = `
<div class="section">
<div class="section-header">
<h2 class="section-title">Search</h2>
</div>
<div class="section-divider"></div>
<div class="bookmarks-grid">
${results.map((item) => createBookmarkHTML(item, item.sectionId)).join('')}
</div>
</div>
`;

attachBookmarkListeners();
}

function setupEventListeners() {
const searchInput = document.getElementById('searchInput');
const searchContainer = document.getElementById('searchContainer');
const searchToggleBtn = document.getElementById('searchToggleBtn');
const addFolderBtn = document.getElementById('addFolderBtn');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const importInput = document.getElementById('importInput');

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
const data = await DataUtils.importData(file);
currentData = data;
await saveData();
await loadData();
e.target.value = '';
} catch (error) {
alert('Failed to import data: ' + error.message);
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
showContextMenu(e, item.dataset.sectionId, item.dataset.itemId);
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

function showContextMenu(event, sectionId, itemId) {
const contextMenu = document.getElementById('contextMenu');
currentContextMenu = { sectionId, itemId };
contextMenu.style.left = `${event.pageX}px`;
contextMenu.style.top = `${event.pageY}px`;
contextMenu.classList.remove('hidden');
}

function closeContextMenu() {
const contextMenu = document.getElementById('contextMenu');
if (contextMenu) contextMenu.classList.add('hidden');
currentContextMenu = null;
}

async function handleContextMenuAction(event) {
const actionEl = event.target.closest('.context-item');
if (!actionEl || !currentContextMenu) return;
const { sectionId, itemId } = currentContextMenu;

if (actionEl.dataset.action === 'edit') {
openBookmarkModal(sectionId, itemId);
}
if (actionEl.dataset.action === 'delete') {
if (confirm('Delete this bookmark?')) await deleteBookmark(sectionId, itemId);
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
console.log('Large dataset detected, optimizing rendering...');
}
}
