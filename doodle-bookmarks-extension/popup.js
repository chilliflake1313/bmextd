// Global state
let currentData = null;
let currentContextMenu = null;
let dragState = {
	itemId: null,
	fromSectionId: null
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
	await loadData();
	setupEventListeners();
});

// Load data and render
async function loadData() {
	currentData = await StorageUtils.getData();
	renderContent();
}

// Save data
async function saveData() {
	await StorageUtils.saveData(currentData);
}

// Render main content
function renderContent() {
	const searchInput = document.getElementById('searchInput');
	const query = searchInput.value.trim();

	if (query) {
		renderSearchResults(query);
	} else {
		renderSections();
	}
}

// Render all sections
function renderSections() {
	const mainContent = document.getElementById('mainContent');
	mainContent.innerHTML = '';

	if (!currentData || currentData.sections.length === 0) {
		mainContent.innerHTML = `
			<div class="empty-state">
				<div class="empty-state-icon">📚</div>
				<div class="empty-state-text">No folders yet. Click "+ Add Folder" to get started!</div>
			</div>
		`;
		return;
	}

	currentData.sections.forEach(section => {
		const sectionEl = createSectionElement(section);
		mainContent.appendChild(sectionEl);
	});
}

// Create section element
function createSectionElement(section) {
	const sectionDiv = document.createElement('div');
	sectionDiv.className = 'section';
	sectionDiv.dataset.sectionId = section.id;

	sectionDiv.innerHTML = `
		<div class="section-header">
			<h2 class="section-title">${escapeHtml(section.name)}</h2>
			<div class="section-actions">
				<button class="section-btn edit-section-btn" data-section-id="${section.id}">Edit</button>
				<button class="section-btn delete-section-btn" data-section-id="${section.id}">Delete</button>
				<button class="section-btn add-bookmark-btn" data-section-id="${section.id}">+ Add</button>
			</div>
		</div>
		<div class="section-divider"></div>
		<div class="bookmarks-grid ${section.items.length === 0 ? 'empty' : ''}" data-section-id="${section.id}">
			${section.items.map(item => createBookmarkHTML(item, section.id)).join('')}
		</div>
	`;

	const editBtn = sectionDiv.querySelector('.edit-section-btn');
	const deleteBtn = sectionDiv.querySelector('.delete-section-btn');
	const addBtn = sectionDiv.querySelector('.add-bookmark-btn');
	const grid = sectionDiv.querySelector('.bookmarks-grid');

	editBtn.addEventListener('click', () => openSectionModal(section.id, section.name));
	deleteBtn.addEventListener('click', () => deleteSection(section.id));
	addBtn.addEventListener('click', () => openBookmarkModal(section.id));

	if (section.items.length === 0) {
		grid.addEventListener('click', () => openBookmarkModal(section.id));
	}

	setupDragAndDrop(grid);

	return sectionDiv;
}

// Create bookmark HTML
function createBookmarkHTML(item, sectionId) {
	const faviconUrl = DataUtils.getFaviconUrl(item.url);
	const fallbackLetter = DataUtils.getFirstLetter(item.label);
	const favoriteClass = item.favorite ? 'favorite' : '';

	return `
		<div class="bookmark-item ${favoriteClass}" 
				 draggable="true"
				 data-item-id="${item.id}" 
				 data-section-id="${sectionId}">
			${faviconUrl ? `<img src="${faviconUrl}" class="bookmark-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : ''}
			<div class="bookmark-fallback" style="${faviconUrl ? 'display:none' : ''}">${fallbackLetter}</div>
			<div class="bookmark-star">⭐</div>
			<div class="tooltip">
				<div class="tooltip-title">${escapeHtml(item.label)}</div>
				<div class="tooltip-url">${escapeHtml(item.url)}</div>
			</div>
		</div>
	`;
}

// Render search results
function renderSearchResults(query) {
	const mainContent = document.getElementById('mainContent');
	const results = DataUtils.searchBookmarks(currentData, query);

	mainContent.innerHTML = `
		<div class="search-results">
			<div class="search-results-title">Found ${results.length} result${results.length !== 1 ? 's' : ''}</div>
			<div class="bookmarks-grid">
				${results.map(item => createBookmarkHTML(item, item.sectionId)).join('')}
			</div>
		</div>
	`;

	attachBookmarkListeners();
}

// Setup event listeners
function setupEventListeners() {
	const searchInput = document.getElementById('searchInput');
	searchInput.addEventListener('input', debounce(() => {
		renderContent();
		attachBookmarkListeners();
	}, 300));

	const addSectionBtn = document.getElementById('addSectionBtn');
	addSectionBtn.addEventListener('click', () => openSectionModal());

	const exportBtn = document.getElementById('exportBtn');
	exportBtn.addEventListener('click', () => DataUtils.exportData(currentData));

	const importBtn = document.getElementById('importBtn');
	const importInput = document.getElementById('importInput');
  
	importBtn.addEventListener('click', () => importInput.click());
	importInput.addEventListener('change', async (e) => {
		const file = e.target.files[0];
		if (file) {
			try {
				const data = await DataUtils.importData(file);
				currentData = data;
				await saveData();
				await loadData();
				e.target.value = '';
			} catch (error) {
				alert('Failed to import data: ' + error.message);
			}
		}
	});

	const sectionModalForm = document.getElementById('sectionModalForm');
	const sectionModalCancel = document.getElementById('sectionModalCancel');
  
	sectionModalForm.addEventListener('submit', handleSectionFormSubmit);
	sectionModalCancel.addEventListener('click', closeSectionModal);

	const modalForm = document.getElementById('modalForm');
	const modalCancel = document.getElementById('modalCancel');
  
	modalForm.addEventListener('submit', handleBookmarkFormSubmit);
	modalCancel.addEventListener('click', closeBookmarkModal);

	document.addEventListener('click', closeContextMenu);
	const contextMenu = document.getElementById('contextMenu');
	contextMenu.addEventListener('click', handleContextMenuAction);

	attachBookmarkListeners();
}

// Attach event listeners to bookmarks
function attachBookmarkListeners() {
	const bookmarkItems = document.querySelectorAll('.bookmark-item');
  
	bookmarkItems.forEach(item => {
		item.addEventListener('click', (e) => {
			if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
				const itemId = item.dataset.itemId;
				const sectionId = item.dataset.sectionId;
				openBookmarkUrl(sectionId, itemId);
			}
		});

		item.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			showContextMenu(e, item.dataset.sectionId, item.dataset.itemId);
		});

		item.addEventListener('dragstart', handleDragStart);
		item.addEventListener('dragend', handleDragEnd);
	});
}

// Open bookmark URL
function openBookmarkUrl(sectionId, itemId) {
	const section = currentData.sections.find(s => s.id === sectionId);
	if (section) {
		const item = section.items.find(i => i.id === itemId);
		if (item) {
			chrome.tabs.create({ url: item.url });
		}
	}
}

// Section Modal Functions
function openSectionModal(sectionId = null, sectionName = '') {
	const modal = document.getElementById('sectionModal');
	const title = document.getElementById('sectionModalTitle');
	const idInput = document.getElementById('sectionModalId');
	const nameInput = document.getElementById('sectionModalName');

	if (sectionId) {
		title.textContent = 'Edit Folder';
		idInput.value = sectionId;
		nameInput.value = sectionName;
	} else {
		title.textContent = 'Add Folder';
		idInput.value = '';
		nameInput.value = '';
	}

	modal.classList.remove('hidden');
	nameInput.focus();
}

function closeSectionModal() {
	const modal = document.getElementById('sectionModal');
	modal.classList.add('hidden');
	document.getElementById('sectionModalForm').reset();
}

async function handleSectionFormSubmit(e) {
	e.preventDefault();
  
	const sectionId = document.getElementById('sectionModalId').value;
	const sectionName = document.getElementById('sectionModalName').value.trim();

	if (!sectionName) return;

	if (sectionId) {
		currentData = DataUtils.editSection(currentData, sectionId, sectionName);
	} else {
		currentData = DataUtils.addSection(currentData, sectionName);
	}

	await saveData();
	await loadData();
	closeSectionModal();
}

async function deleteSection(sectionId) {
	const section = currentData.sections.find(s => s.id === sectionId);
	const confirmMsg = section.items.length > 0 
		? `Delete "${section.name}" and all its ${section.items.length} bookmarks?`
		: `Delete "${section.name}"?`;

	if (confirm(confirmMsg)) {
		currentData = DataUtils.deleteSection(currentData, sectionId);
		await saveData();
		await loadData();
	}
}

// Bookmark Modal Functions
function openBookmarkModal(sectionId, itemId = null) {
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
		const section = currentData.sections.find(s => s.id === sectionId);
		const item = section ? section.items.find(i => i.id === itemId) : null;

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
	const modal = document.getElementById('modal');
	modal.classList.add('hidden');
	document.getElementById('modalForm').reset();
}

async function handleBookmarkFormSubmit(e) {
	e.preventDefault();

	const sectionId = document.getElementById('modalSectionId').value;
	const itemId = document.getElementById('modalItemId').value;
	const label = document.getElementById('modalLabel').value.trim();
	const url = document.getElementById('modalUrl').value.trim();

	if (!label || !url) return;

	if (itemId) {
		currentData = DataUtils.editBookmark(currentData, sectionId, itemId, label, url);
	} else {
		currentData = DataUtils.addBookmark(currentData, sectionId, label, url);
	}

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

// Context Menu Functions
function showContextMenu(event, sectionId, itemId) {
	const contextMenu = document.getElementById('contextMenu');
	currentContextMenu = { sectionId, itemId };

	contextMenu.style.left = `${event.pageX}px`;
	contextMenu.style.top = `${event.pageY}px`;
	contextMenu.classList.remove('hidden');
}

function closeContextMenu() {
	const contextMenu = document.getElementById('contextMenu');
	contextMenu.classList.add('hidden');
	currentContextMenu = null;
}

async function handleContextMenuAction(event) {
	const actionEl = event.target.closest('.context-item');
	if (!actionEl || !currentContextMenu) return;

	const action = actionEl.dataset.action;
	const { sectionId, itemId } = currentContextMenu;

	if (action === 'edit') {
		openBookmarkModal(sectionId, itemId);
	} else if (action === 'delete') {
		if (confirm('Delete this bookmark?')) {
			await deleteBookmark(sectionId, itemId);
		}
	} else if (action === 'favorite') {
		await toggleFavorite(sectionId, itemId);
	}

	closeContextMenu();
}

// Drag and Drop
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
		if (!dragState.itemId || !dragState.fromSectionId || dragState.fromSectionId === targetSectionId) {
			return;
		}

		currentData = DataUtils.moveBookmark(currentData, dragState.itemId, dragState.fromSectionId, targetSectionId);
		await saveData();
		await loadData();
	});
}

function handleDragStart(event) {
	const item = event.currentTarget;
	dragState = {
		itemId: item.dataset.itemId,
		fromSectionId: item.dataset.sectionId
	};
	event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
	dragState = {
		itemId: null,
		fromSectionId: null
	};
	document.querySelectorAll('.bookmarks-grid').forEach(grid => {
		grid.classList.remove('drag-over');
	});
}

// Helpers
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
