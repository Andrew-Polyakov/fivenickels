# Article Editor Implementation Guide

## Overview

A comprehensive article editing interface for staff users built with:
- **Backend**: Django REST Framework (DRF) API
- **Frontend**: shadcn/html components with vanilla JavaScript
- **Styling**: Modern CSS with shadcn design system

## Project Structure

### Backend Files

#### 1. **API Serializers** (`home/serializers.py`)
- `TaxonomyTermSerializer` - Serialize taxonomy hierarchy with breadcrumb paths
- `ContentTagSerializer` - Serialize content tags
- `ArticleEditorSerializer` - Full article serialization for reading
- `ArticleUpdateSerializer` - Handle partial/full updates with nested relations
- `ArticleStatusActionSerializer` - Validate article action requests

#### 2. **API Viewsets** (`home/api.py`)
- `ArticleEditorViewSet` - Main CRUD operations for articles
- **Endpoints**:
  - `GET /api/articles/{id}/` - Get article details
  - `PATCH /api/articles/{id}/` - Update article fields
  - `POST /api/articles/{id}/action/` - Execute actions (publish, delete, etc.)
  - `POST /api/articles/{id}/upload-image/` - Upload hero image
  - `GET /api/articles/taxonomy/` - Get taxonomy structure
  - `GET /api/articles/tags/` - Get available tags
  - `GET /api/articles/tags/?q=search` - Search tags

#### 3. **Views** (`home/editor_views.py`)
- `article_editor(request, article_id)` - Render editor page

#### 4. **URL Configuration**
- **API URLs** (`home/api_urls.py`) - REST API routes
- **Main URLs** (`mysite/urls.py`) - Added API and editor views

### Frontend Files

#### 1. **Template** (`home/templates/home/article_editor.html`)
- Main editor HTML structure with:
  - Title input
  - Taxonomy breadcrumb selector
  - Hero image upload (1.91:1 aspect ratio)
  - Priority and expiry controls (grouped)
  - Body editor with block management
  - Tag cloud with search
  - Action buttons popover

#### 2. **JavaScript** (`home/static/js/article-editor.js`)
- `ArticleEditor` class - Main application logic
- **Key Methods**:
  - `loadArticle()` - Fetch article from API
  - `loadTaxonomy()` - Load taxonomy structure
  - `loadTags()` - Load available tags
  - `renderTaxonomy()` - Render breadcrumb with change handlers
  - `renderHeroImage()` - Render image upload with drag-drop
  - `renderPriorities()` - Render priority sliders and expiry
  - `renderTags()` - Render tag cloud with search
  - `renderBodyEditor()` - Render StreamField blocks
  - `saveArticle()` - Save changes via API
  - `executeAction()` - Handle publish/delete/etc.

#### 3. **Styles** (`home/static/css/article-editor.css`)
- CSS variables for theming (shadcn design system)
- Responsive layouts
- shadcn/html component styles:
  - Inputs, selects, buttons
  - Breadcrumbs, sliders, tags
  - File upload with drag-drop
  - Popover with action buttons
  - Toast notifications
  - Loading indicators

## Installation

### 1. Install Dependencies

```bash
cd /Users/andewpolyakov/fivenickels/wigtail
pip install -r requirements.txt
```

### 2. Database Migrations

```bash
python manage.py migrate
```

### 3. Static Files (Development)

```bash
python manage.py collectstatic
```

## Configuration

### Settings (`mysite/settings/base.py`)

Added to `INSTALLED_APPS`:
```python
"rest_framework",
```

### REST Framework Settings

Add to `mysite/settings/base.py`:
```python
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}
```

## Usage

### Accessing the Editor

**URL Pattern**: `/profile/article/<article_id>/edit/`

**Example**: `/profile/article/42/edit/`

**Requirements**:
- User must be logged in
- User must be staff or superuser

### Components

#### 1. **Title Input**
- Simple text input with max 500 characters
- Auto-saves on change

#### 2. **Taxonomy Breadcrumb**
- Shows current hierarchy path
- Click any breadcrumb level to change category
- Dropdown selector for direct children

#### 3. **Hero Image Upload**
- 1.91:1 aspect ratio required
- Drag-and-drop or click to upload
- Shows preview with remove button
- File upload via multipart/form-data

#### 4. **Priorities Control Group**
- **Tile Priority** (1-10): Controls listing order
- **Article Priority** (1-10): Controls content priority
- **Priority Expires At**: DateTime field for expiration

#### 5. **Body Editor**
- Displays StreamField blocks
- Supports: Heading, Paragraph, Markdown, Image, Embed, Separator
- Add/remove blocks with buttons
- Click to edit block content (basic prompt interface)

#### 6. **Tag Cloud**
- Search box filters available tags
- Selected tags shown as chips
- Click × on chip to remove
- Multiple selections supported

#### 7. **Actions Popover**
- **Publish**: Make article live
- **Unpublish**: Remove from public
- **Submit for Moderation**: Flag for review (extensible)
- **Save Draft**: Save without publishing
- **Delete**: Permanently remove article (with confirmation)

## API Endpoints

### Get Article
```
GET /api/articles/42/

Response:
{
    "id": 42,
    "title": "Article Title",
    "status": "published",
    "section_term": {...},
    "taxonomy_category": {...},
    "tags": [{id: 1, name: "Tag"}],
    "hero_image_url": "...",
    "tile_priority": 5,
    "article_priority": 8,
    "priority_expires_at": "2026-05-09T12:00:00Z",
    "body": [{type: "heading", value: {...}}, ...]
}
```

### Update Article (Partial)
```
PATCH /api/articles/42/

Request:
{
    "title": "New Title",
    "tile_priority": 7,
    "tag_ids": [1, 2, 3],
    "body_json": [...]
}

Response: Updated article data
```

### Article Action
```
POST /api/articles/42/action/

Request:
{
    "action": "publish|unpublish|submit_moderation|save_draft|delete"
}

Response:
{
    "status": "success",
    "message": "Article published",
    "article": {...}
}
```

### Taxonomy List
```
GET /api/articles/taxonomy/

Response:
{
    "root_terms": [{id, name, slug}, ...],
    "all_terms": [{id, name, slug, path}, ...]
}
```

### Tags List/Search
```
GET /api/articles/tags/?q=tech

Response: [{id: 1, name: "Technology"}, ...]
```

## Error Handling

- **404 Not Found**: Article doesn't exist or user lacks permission
- **403 Forbidden**: User is not staff
- **400 Bad Request**: Invalid form data
- **500 Server Error**: Server-side error

Errors are displayed via toast notifications with error-specific styling.

## Security

- **Authentication**: Login required (`@login_required`)
- **Authorization**: Staff/superuser check (`@user_passes_test(_is_staff)`)
- **CSRF Protection**: `X-CSRFToken` header in API calls
- **XSS Prevention**: HTML escaping in JavaScript (`escapeHtml`)

## Customization

### Adding New Block Types

1. **Register in `home/blocks.py`** (already in MAIN_SITE_STREAMBLOCK)
2. **Update `renderBlockContent()` in JavaScript** to display the block
3. **Update admin if needed** (Wagtail handles StreamField automatically)

### Styling

CSS variables in `:root` allow easy theming:
```css
--primary: #09090b;
--border: #e4e4e7;
--radius: 0.5rem;
```

### API Customization

- Extend `ArticleStatusActionSerializer` for custom actions
- Override `ArticleUpdateSerializer.update()` for validation
- Add new methods to `ArticleEditorViewSet` for additional endpoints

## Troubleshooting

### Static Files Not Loading

```bash
python manage.py collectstatic --noinput
```

### REST Framework Not Installed

```bash
pip install djangorestframework
```

### API Returns 403 Forbidden

- Ensure user is logged in
- Ensure user is staff or superuser
- Check `IsStaffUser` permission class

### Image Upload Fails

- Check file size limits in Django settings
- Verify `MEDIA_URL` and `MEDIA_ROOT` are configured
- Ensure directory permissions allow uploads

## Future Enhancements

1. **Batch Operations**: Edit multiple articles at once
2. **Version History**: Track article changes over time
3. **Collaborative Editing**: Real-time updates for multiple users
4. **Advanced Search**: Full-text search in body and tags
5. **Preview Mode**: Live preview of article as it appears on site
6. **Scheduling**: Schedule articles to publish at future dates
7. **Analytics**: Track article performance metrics

## Testing

### Test Article Editor
```bash
# Manually test in browser at:
# /profile/article/1/edit/

# Or use curl:
curl -X GET http://127.0.0.1:8000/api/articles/1/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Fixtures for Testing
```bash
# Create test article
python manage.py shell
> from home.models import TaggedContentPage, TaxonomyTerm
> term = TaxonomyTerm.objects.first()
> article = TaggedContentPage.objects.create(title="Test", section_term=term)
> print(f"Test article ID: {article.id}")
```

## License

Part of the Wigtail/FiveNickels project.
