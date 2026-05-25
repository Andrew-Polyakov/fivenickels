/**
 * Article Editor - Main Application Logic
 * Handles all UI interactions and API calls for article editing
 */

class ArticleEditor {
    constructor(articleId) {
        this.articleId = articleId;
        this.article = null;
        this.taxonomyTerms = null;
        this.allTags = [];
        this.selectedTags = [];
        this.bodyBlocks = [];
        this.init();
    }

    /**
     * Initialize the editor
     */
    async init() {
        try {
            await this.loadArticle();
            await this.loadTaxonomy();
            await this.loadTags();
            this.setupEventListeners();
            this.render();
        } catch (error) {
            this.showToast('Error loading article', 'error');
            console.error('Editor initialization error:', error);
        }
    }

    /**
     * Load article data from API
     */
    async loadArticle() {
        const response = await fetch(`/api/articles/${this.articleId}/`);
        if (!response.ok) throw new Error('Failed to load article');
        this.article = await response.json();
        this.bodyBlocks = this.article.body || [];
        this.selectedTags = this.article.tags.map(t => ({ id: t.id, name: t.name }));
    }

    /**
     * Load taxonomy structure
     */
    async loadTaxonomy() {
        const response = await fetch('/api/articles/taxonomy/');
        if (!response.ok) throw new Error('Failed to load taxonomy');
        this.taxonomyTerms = await response.json();
    }

    /**
     * Load all available tags
     */
    async loadTags() {
        const response = await fetch('/api/articles/tags/');
        if (!response.ok) throw new Error('Failed to load tags');
        this.allTags = await response.json();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Save button
        document.getElementById('save-btn').addEventListener('click', () => this.saveArticle());

        // More actions button
        const moreActionsBtn = document.getElementById('more-actions-btn');
        const actionsPopover = document.getElementById('actions-popover');
        moreActionsBtn.addEventListener('click', () => {
            actionsPopover.classList.toggle('popover-hidden');
        });

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#more-actions-btn') && !e.target.closest('#actions-popover')) {
                actionsPopover.classList.add('popover-hidden');
            }
        });

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.executeAction(action);
            });
        });

        // Add block button
        document.getElementById('add-block-btn').addEventListener('click', () => this.addBlock());

        // Title input
        document.getElementById('article-title').addEventListener('change', (e) => {
            this.article.title = e.target.value;
        });

        // Tile priority slider
        const tilePrioritySlider = document.getElementById('tile-priority-slider');
        if (tilePrioritySlider) {
            tilePrioritySlider.addEventListener('change', (e) => {
                this.article.tile_priority = parseInt(e.target.value) || null;
                document.getElementById('tile-priority-value').textContent = e.target.value || 'N/A';
            });
        }

        // Article priority slider
        const articlePrioritySlider = document.getElementById('article-priority-slider');
        if (articlePrioritySlider) {
            articlePrioritySlider.addEventListener('change', (e) => {
                this.article.article_priority = parseInt(e.target.value) || null;
                document.getElementById('article-priority-value').textContent = e.target.value || 'N/A';
            });
        }

        // Priority expiry
        const expiryInput = document.getElementById('priority-expiry');
        if (expiryInput) {
            expiryInput.addEventListener('change', (e) => {
                this.article.priority_expires_at = e.target.value || null;
            });
        }

        // Tag search input
        const tagSearchInput = document.getElementById('tag-search-input');
        if (tagSearchInput) {
            tagSearchInput.addEventListener('input', (e) => this.filterAndShowTags(e.target.value));
        }
    }

    /**
     * Render all UI components
     */
    render() {
        this.renderTitle();
        this.renderTaxonomy();
        this.renderHeroImage();
        this.renderPriorities();
        this.renderTags();
        this.renderBodyEditor();
    }

    /**
     * Render title input
     */
    renderTitle() {
        const titleInput = document.getElementById('article-title');
        titleInput.value = this.article.title || '';
    }

    /**
     * Render taxonomy breadcrumb and selectors
     */
    renderTaxonomy() {
        const breadcrumbContainer = document.getElementById('taxonomy-breadcrumb');
        const selectorContainer = document.getElementById('taxonomy-selector');

        // Get current section term path
        const sectionTerm = this.article.section_term;
        const categoryTerm = this.article.taxonomy_category;

        // Render breadcrumb
        if (sectionTerm && sectionTerm.path_items) {
            const breadcrumbHTML = sectionTerm.path_items.map((item, index) => {
                const isLast = index === sectionTerm.path_items.length - 1;
                return `
                    <div class="breadcrumb-item">
                        <span class="breadcrumb-text">${this.escapeHtml(item.name)}</span>
                        ${!isLast ? '<span class="breadcrumb-sep">/</span>' : ''}
                    </div>
                `;
            }).join('');

            breadcrumbContainer.innerHTML = `
                <div class="breadcrumb">
                    ${breadcrumbHTML}
                </div>
            `;

            // Add click handlers to breadcrumb items for changing level
            breadcrumbContainer.querySelectorAll('.breadcrumb-item').forEach((item, index) => {
                item.style.cursor = 'pointer';
                item.addEventListener('click', () => this.changeCategory(index));
            });
        }

        // Render category selector dropdown if applicable
        if (sectionTerm) {
            const categoryChildren = this.getTaxonomyChildren(sectionTerm.id);
            if (categoryChildren.length > 0) {
                selectorContainer.innerHTML = `
                    <div class="selector-group">
                        <label for="category-select">Category</label>
                        <select id="category-select" class="select">
                            <option value="">-- Select category --</option>
                            ${categoryChildren.map(term => `
                                <option value="${term.id}" ${categoryTerm && categoryTerm.id === term.id ? 'selected' : ''}>
                                    ${this.escapeHtml(term.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `;

                const categorySelect = document.getElementById('category-select');
                categorySelect.addEventListener('change', (e) => {
                    this.article.taxonomy_category_id = e.target.value ? parseInt(e.target.value) : null;
                });
            }
        }
    }

    /**
     * Get children of a taxonomy term
     */
    getTaxonomyChildren(parentId) {
        return this.taxonomyTerms.all_terms.filter(term => {
            const parentPath = term.path.slice(0, -2);
            return parentPath.endsWith(String(parentId).padStart(4, '0'));
        });
    }

    /**
     * Change category level in taxonomy
     */
    changeCategory(levelIndex) {
        // Implementation for changing breadcrumb level
        // This would update the taxonomy_category and re-render children
        console.log('Changing category at level:', levelIndex);
    }

    /**
     * Render hero image upload section
     */
    renderHeroImage() {
        const uploadContainer = document.getElementById('hero-image-upload');
        const previewContainer = document.getElementById('hero-image-preview');

        // Render file upload input
        uploadContainer.innerHTML = `
            <div class="file-upload">
                <input
                    type="file"
                    id="hero-image-input"
                    class="file-input-hidden"
                    accept="image/*"
                    style="display: none;"
                />
                <div class="file-upload-area" id="file-upload-area">
                    <svg class="upload-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p class="upload-text">Drop image or click to upload</p>
                    <p class="upload-hint">Aspect ratio: 1.91:1</p>
                </div>
            </div>
        `;

        // Setup file upload handlers
        const fileInput = document.getElementById('hero-image-input');
        const uploadArea = document.getElementById('file-upload-area');

        uploadArea.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => this.handleImageUpload(e));

        // Drag and drop handlers
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                this.handleImageUpload({ target: { files: e.dataTransfer.files } });
            }
        });

        // Render preview if image exists
        if (this.article.hero_image_url) {
            previewContainer.innerHTML = `
                <div class="image-preview-wrapper">
                    <img src="${this.article.hero_image_url}" alt="Hero image" class="preview-image" />
                    <button id="remove-image-btn" class="btn btn-small btn-ghost">Remove</button>
                </div>
            `;

            document.getElementById('remove-image-btn').addEventListener('click', () => {
                this.article.hero_image_id = null;
                this.article.hero_image_url = null;
                previewContainer.innerHTML = '';
            });
        }
    }

    /**
     * Handle image upload
     */
    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`/api/articles/${this.articleId}/upload-image/`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');
            const data = await response.json();
            this.article.hero_image_url = data.image_url;
            this.article.hero_image_id = data.image_id;
            this.renderHeroImage();
            this.showToast('Image uploaded successfully', 'success');
        } catch (error) {
            this.showToast('Error uploading image', 'error');
            console.error('Upload error:', error);
        }
    }

    /**
     * Render priority sliders and expiry control
     */
    renderPriorities() {
        const controlGroup = document.getElementById('priorities-control');

        const tilePriorityValue = this.article.tile_priority || '';
        const articlePriorityValue = this.article.article_priority || '';
        const expiryValue = this.article.priority_expires_at || '';

        controlGroup.innerHTML = `
            <div class="control-item">
                <label for="tile-priority-slider">Tile Priority: <span id="tile-priority-value">${tilePriorityValue || 'N/A'}</span></label>
                <input
                    type="range"
                    id="tile-priority-slider"
                    class="slider"
                    min="1"
                    max="10"
                    value="${tilePriorityValue || 5}"
                    placeholder="1-10 or blank"
                />
            </div>

            <div class="control-item">
                <label for="article-priority-slider">Article Priority: <span id="article-priority-value">${articlePriorityValue || 'N/A'}</span></label>
                <input
                    type="range"
                    id="article-priority-slider"
                    class="slider"
                    min="1"
                    max="10"
                    value="${articlePriorityValue || 5}"
                    placeholder="1-10 or blank"
                />
            </div>

            <div class="control-item">
                <label for="priority-expiry">Priority Expires At</label>
                <input
                    type="datetime-local"
                    id="priority-expiry"
                    class="input"
                    value="${this.formatDateTimeLocal(expiryValue)}"
                />
            </div>
        `;

        // Re-setup priority event listeners
        const tilePrioritySlider = document.getElementById('tile-priority-slider');
        const articlePrioritySlider = document.getElementById('article-priority-slider');
        const expiryInput = document.getElementById('priority-expiry');

        if (tilePrioritySlider) {
            tilePrioritySlider.addEventListener('change', (e) => {
                this.article.tile_priority = parseInt(e.target.value) || null;
                document.getElementById('tile-priority-value').textContent = e.target.value || 'N/A';
            });
        }

        if (articlePrioritySlider) {
            articlePrioritySlider.addEventListener('change', (e) => {
                this.article.article_priority = parseInt(e.target.value) || null;
                document.getElementById('article-priority-value').textContent = e.target.value || 'N/A';
            });
        }

        if (expiryInput) {
            expiryInput.addEventListener('change', (e) => {
                this.article.priority_expires_at = e.target.value || null;
            });
        }
    }

    /**
     * Format datetime string for input
     */
    formatDateTimeLocal(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toISOString().slice(0, 16);
    }

    /**
     * Render tags cloud with search
     */
    renderTags() {
        const tagsCloud = document.getElementById('tags-cloud');

        tagsCloud.innerHTML = `
            <div class="tags-container">
                <div class="tag-search">
                    <input
                        type="text"
                        id="tag-search-input"
                        class="input"
                        placeholder="Search tags..."
                    />
                    <div id="tag-suggestions" class="tag-suggestions">
                        <!-- Suggestions will appear here -->
                    </div>
                </div>

                <div id="selected-tags" class="selected-tags">
                    ${this.selectedTags.map(tag => `
                        <div class="tag-chip" data-tag-id="${tag.id}">
                            <span>${this.escapeHtml(tag.name)}</span>
                            <button class="tag-remove" aria-label="Remove tag">×</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Setup event listeners for tag removal
        document.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tagId = parseInt(e.target.closest('.tag-chip').dataset.tagId);
                this.selectedTags = this.selectedTags.filter(t => t.id !== tagId);
                this.article.tag_ids = this.selectedTags.map(t => t.id);
                this.renderTags();
            });
        });

        // Setup tag search
        const tagSearchInput = document.getElementById('tag-search-input');
        if (tagSearchInput) {
            tagSearchInput.addEventListener('input', (e) => this.filterAndShowTags(e.target.value));
        }
    }

    /**
     * Filter and show tag suggestions
     */
    filterAndShowTags(query) {
        const suggestionsContainer = document.getElementById('tag-suggestions');
        if (!query.trim()) {
            suggestionsContainer.innerHTML = '';
            return;
        }

        const filtered = this.allTags.filter(tag =>
            tag.name.toLowerCase().includes(query.toLowerCase()) &&
            !this.selectedTags.some(t => t.id === tag.id)
        ).slice(0, 10);

        suggestionsContainer.innerHTML = filtered.map(tag => `
            <div class="tag-suggestion" data-tag-id="${tag.id}">
                ${this.escapeHtml(tag.name)}
            </div>
        `).join('');

        // Setup click handlers for suggestions
        suggestionsContainer.querySelectorAll('.tag-suggestion').forEach(item => {
            item.addEventListener('click', (e) => {
                const tagId = parseInt(e.target.dataset.tagId);
                const tag = this.allTags.find(t => t.id === tagId);
                this.selectedTags.push(tag);
                this.article.tag_ids = this.selectedTags.map(t => t.id);
                document.getElementById('tag-search-input').value = '';
                this.renderTags();
            });
        });
    }

    /**
     * Render body editor with blocks
     */
    renderBodyEditor() {
        const bodyEditor = document.getElementById('body-editor');

        bodyEditor.innerHTML = this.bodyBlocks.map((block, index) => `
            <div class="block-item" data-block-index="${index}">
                <div class="block-header">
                    <span class="block-type">${block.type}</span>
                    <button class="btn-block-remove" data-block-index="${index}" aria-label="Remove block">×</button>
                </div>
                <div class="block-content">
                    ${this.renderBlockContent(block)}
                </div>
            </div>
        `).join('');

        // Setup block remove handlers
        document.querySelectorAll('.btn-block-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.blockIndex);
                this.bodyBlocks.splice(index, 1);
                this.renderBodyEditor();
            });
        });
    }

    /**
     * Render individual block content
     */
    renderBlockContent(block) {
        const type = block.type;
        const value = block.value;

        switch (type) {
            case 'heading':
                return `<h${value.level === 'h2' ? '2' : '3'}>${this.escapeHtml(value.text)}</h${value.level === 'h2' ? '2' : '3'}>`;
            case 'paragraph':
                return `<p>${value}</p>`;
            case 'markdown':
                return `<pre>${this.escapeHtml(value)}</pre>`;
            case 'image':
                return `<div class="block-image"><img src="${value}" alt="Block image" style="max-width: 100%; height: auto;" /></div>`;
            case 'embed':
                return `<div class="block-embed">[Embed: ${this.escapeHtml(value)}]</div>`;
            case 'separator':
                return `<hr class="block-separator" />`;
            default:
                return `<p>[${type}]</p>`;
        }
    }

    /**
     * Add new block
     */
    addBlock() {
        const blockType = prompt('Block type (heading, paragraph, markdown, image, embed, separator):');
        if (!blockType) return;

        const validTypes = ['heading', 'paragraph', 'markdown', 'image', 'embed', 'separator'];
        if (!validTypes.includes(blockType)) {
            alert('Invalid block type');
            return;
        }

        const newBlock = {
            type: blockType,
            value: blockType === 'heading' ? { level: 'h2', text: 'New heading' } : ''
        };

        this.bodyBlocks.push(newBlock);
        this.renderBodyEditor();
    }

    /**
     * Save article
     */
    async saveArticle() {
        this.showLoading(true);

        try {
            const updateData = {
                title: this.article.title,
                lede: this.article.lede,
                hero_image_description: this.article.hero_image_description,
                tile_priority: this.article.tile_priority,
                article_priority: this.article.article_priority,
                priority_expires_at: this.article.priority_expires_at,
                section_term_id: this.article.section_term?.id,
                taxonomy_category_id: this.article.taxonomy_category?.id || null,
                tag_ids: this.selectedTags.map(t => t.id),
                hero_image_id: this.article.hero_image?.id || null,
                body_json: this.bodyBlocks,
            };

            const response = await fetch(`/api/articles/${this.articleId}/`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken(),
                },
                body: JSON.stringify(updateData),
            });

            if (!response.ok) throw new Error('Save failed');
            const data = await response.json();
            this.article = data;
            this.showToast('Article saved successfully', 'success');
        } catch (error) {
            this.showToast('Error saving article', 'error');
            console.error('Save error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Execute article action (publish, delete, etc.)
     */
    async executeAction(action) {
        if (action === 'delete' && !confirm('Are you sure you want to delete this article?')) {
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`/api/articles/${this.articleId}/action/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken(),
                },
                body: JSON.stringify({ action }),
            });

            if (!response.ok) throw new Error(`Action failed: ${action}`);
            const data = await response.json();

            this.showToast(data.message, 'success');

            if (action === 'delete') {
                setTimeout(() => {
                    window.location.href = '/profile/';
                }, 1500);
            } else {
                this.article = data.article;
                this.render();
            }
        } catch (error) {
            this.showToast(`Error executing ${action}`, 'error');
            console.error('Action error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Get CSRF token from cookies
     */
    getCsrfToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === name + '=') {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    /**
     * Show loading indicator
     */
    showLoading(show) {
        const indicator = document.getElementById('loading-indicator');
        if (show) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast-notification');
        const messageEl = document.getElementById('toast-message');
        messageEl.textContent = message;
        toast.className = `toast toast-${type}`;
        setTimeout(() => toast.classList.add('toast-hidden'), 3000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.ARTICLE_ID) {
        new ArticleEditor(window.ARTICLE_ID);
    }
});
