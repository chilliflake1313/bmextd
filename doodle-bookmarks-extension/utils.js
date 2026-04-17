// Storage Utilities
const StorageUtils = {
	// Get all data from chrome.storage.local
	async getData() {
		return new Promise((resolve) => {
			chrome.storage.local.get(['bookmarksData'], (result) => {
				if (result.bookmarksData) {
					resolve(result.bookmarksData);
				} else {
					// Return default data structure
					resolve(this.getDefaultData());
				}
			});
		});
	},

	// Save data to chrome.storage.local
	async saveData(data) {
		return new Promise((resolve) => {
			chrome.storage.local.set({ bookmarksData: data }, () => {
				resolve();
			});
		});
	},

	// Get default data structure
	getDefaultData() {
		return {
			sections: [
				{
					id: this.generateId(),
					name: 'Life',
					items: []
				},
				{
					id: this.generateId(),
					name: 'Social',
					items: []
				},
				{
					id: this.generateId(),
					name: 'Work',
					items: []
				}
			]
		};
	},

	// Generate unique ID
	generateId() {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
};

// Data Manipulation Utilities
const DataUtils = {
	// Add a new section
	addSection(data, sectionName) {
		const newSection = {
			id: StorageUtils.generateId(),
			name: sectionName,
			items: []
		};
		data.sections.push(newSection);
		return data;
	},

	// Edit section name
	editSection(data, sectionId, newName) {
		const section = data.sections.find(s => s.id === sectionId);
		if (section) {
			section.name = newName;
		}
		return data;
	},

	// Delete section
	deleteSection(data, sectionId) {
		data.sections = data.sections.filter(s => s.id !== sectionId);
		return data;
	},

	// Add bookmark to section
	addBookmark(data, sectionId, label, url) {
		const section = data.sections.find(s => s.id === sectionId);
		if (section) {
			const newItem = {
				id: StorageUtils.generateId(),
				label: label,
				url: url,
				favorite: false
			};
			section.items.push(newItem);
		}
		return data;
	},

	// Edit bookmark
	editBookmark(data, sectionId, itemId, label, url) {
		const section = data.sections.find(s => s.id === sectionId);
		if (section) {
			const item = section.items.find(i => i.id === itemId);
			if (item) {
				item.label = label;
				item.url = url;
			}
		}
		return data;
	},

	// Delete bookmark
	deleteBookmark(data, sectionId, itemId) {
		const section = data.sections.find(s => s.id === sectionId);
		if (section) {
			section.items = section.items.filter(i => i.id !== itemId);
		}
		return data;
	},

	// Toggle favorite
	toggleFavorite(data, sectionId, itemId) {
		const section = data.sections.find(s => s.id === sectionId);
		if (section) {
			const item = section.items.find(i => i.id === itemId);
			if (item) {
				item.favorite = !item.favorite;
			}
		}
		return data;
	},

	// Move bookmark between sections
	moveBookmark(data, itemId, fromSectionId, toSectionId) {
		const fromSection = data.sections.find(s => s.id === fromSectionId);
		const toSection = data.sections.find(s => s.id === toSectionId);
    
		if (fromSection && toSection) {
			const itemIndex = fromSection.items.findIndex(i => i.id === itemId);
			if (itemIndex !== -1) {
				const [item] = fromSection.items.splice(itemIndex, 1);
				toSection.items.push(item);
			}
		}
		return data;
	},

	// Search bookmarks
	searchBookmarks(data, query) {
		const results = [];
		const lowerQuery = query.toLowerCase();
    
		data.sections.forEach(section => {
			section.items.forEach(item => {
				if (
					item.label.toLowerCase().includes(lowerQuery) ||
					item.url.toLowerCase().includes(lowerQuery)
				) {
					results.push({
						...item,
						sectionId: section.id,
						sectionName: section.name
					});
				}
			});
		});
    
		return results;
	},

	// Get favicon URL
	getFaviconUrl(url) {
		try {
			const domain = new URL(url).hostname;
			return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
		} catch (e) {
			return null;
		}
	},

	// Get first letter of label
	getFirstLetter(label) {
		return label.charAt(0).toUpperCase();
	},

	// Export data as JSON
	exportData(data) {
		const dataStr = JSON.stringify(data, null, 2);
		const blob = new Blob([dataStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `doodle-bookmarks-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(url);
	},

	// Import data from JSON
	async importData(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = JSON.parse(e.target.result);
					// Validate data structure
					if (data.sections && Array.isArray(data.sections)) {
						resolve(data);
					} else {
						reject(new Error('Invalid data format'));
					}
				} catch (error) {
					reject(error);
				}
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		});
	}
};
