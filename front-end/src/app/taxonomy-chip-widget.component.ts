import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { appMaterialDialogDefaults } from './dialog-defaults';
import { PromptDialogComponent } from './material-dialogs.component';

declare global {
  interface Window {
    Turbo?: {
      visit: (url: string, options?: { action?: string; frame?: string }) => void;
    };
    showMaterialConfirm?: (message: string, title?: string) => Promise<boolean>;
    showMaterialAlert?: (message: string, title?: string) => Promise<void>;
  }
}

type TaxonomyChip = {
  id: string;
  name: string;
  url?: string;
  active?: boolean;
  removable?: boolean;
};

@Component({
  selector: 'taxonomy-chip-widget',
  standalone: true,
  imports: [
    CommonModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
  ],
  template: `
    <div class="taxonomy-chip-widget">
      <mat-chip-set class="taxonomy-chip-widget__set" aria-label="Taxonomy chips">
          @for (chip of chips; track chip.id) {
            <mat-chip
              class="taxonomy-chip-widget__chip"
              [class.taxonomy-chip-widget__chip--active]="!!chip.active"
              [highlighted]="!!chip.active"
            >
              @if (canEdit && chip.removable !== false) {
                <button
                  type="button"
                  class="taxonomy-chip-widget__edit-btn"
                  [attr.aria-label]="'Rename ' + chip.name"
                  [disabled]="isBusy"
                  (click)="onRenameClick($event, chip)"
                >
                  <svg class="taxonomy-chip-widget__edit-glyph" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              }
              @if (chip.url) {
                <button
                  type="button"
                  class="taxonomy-chip-widget__link-btn"
                  [attr.aria-label]="'Open ' + chip.name"
                  [attr.aria-pressed]="chip.active ? 'true' : 'false'"
                  [disabled]="isBusy"
                  (click)="onChipClick($event, chip)"
                >
                  {{ chip.name }}
                </button>
              } @else {
                <span class="taxonomy-chip-widget__label">{{ chip.name }}</span>
              }
              @if (canEdit && chip.removable !== false) {
                <button
                  type="button"
                  class="taxonomy-chip-widget__remove-btn"
                  aria-label="Remove {{ chip.name }}"
                  [disabled]="isBusy"
                  (click)="onRemoveClick($event, chip)"
                >
                  <mat-icon>cancel</mat-icon>
                </button>
              }
            </mat-chip>
          }
          @if (canEdit) {
            <mat-chip class="taxonomy-chip-widget__chip taxonomy-chip-widget__add-chip" [highlighted]="false">
              <button type="button" class="taxonomy-chip-widget__link-btn" [disabled]="isBusy" (click)="openAddDialog()">
                <mat-icon class="taxonomy-chip-widget__add-chip-icon">add</mat-icon>
                {{ placeholder }}
              </button>
            </mat-chip>
          }
      </mat-chip-set>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      font-family: var(--font-sans, 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif);
    }
    .taxonomy-chip-widget {
      width: 100%;
      display: block;
      font-family: inherit;
    }
    .taxonomy-chip-widget__set {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      justify-content: flex-start;
    }
    .taxonomy-chip-widget__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .taxonomy-chip-widget__chip--active {
      background: var(--neon-blue, #38bdf8);
      color: #0a0f14;
      border-color: transparent;
      box-shadow: 0 0 28px var(--neon-blue-glow, rgba(56, 189, 248, 0.55));
    }
    .taxonomy-chip-widget__chip--active .taxonomy-chip-widget__link-btn,
    .taxonomy-chip-widget__chip--active .taxonomy-chip-widget__label,
    .taxonomy-chip-widget__chip--active .mat-icon {
      color: #0a0f14;
    }
    .taxonomy-chip-widget__link-btn {
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      padding: 0;
      margin: 0;
      text-align: left;
    }
    .taxonomy-chip-widget__label {
      color: inherit;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
    .taxonomy-chip-widget__edit-btn {
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      position: relative;
      z-index: 3;
      line-height: 0;
      border-radius: 999px;
    }
    .taxonomy-chip-widget__edit-btn:focus-visible {
      outline: 2px solid var(--neon-blue, #38bdf8);
      outline-offset: 2px;
    }
    .taxonomy-chip-widget__edit-glyph {
      pointer-events: none;
      display: block;
      flex-shrink: 0;
    }
    .taxonomy-chip-widget__add-chip {
      cursor: pointer;
    }
    .taxonomy-chip-widget__remove-btn {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .taxonomy-chip-widget__add-chip-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
  `,
})
export class TaxonomyChipWidgetComponent {
  private readonly dialog = inject(MatDialog);

  chips: TaxonomyChip[] = [];

  @Input({ alias: 'create-url' }) createUrl = '';
  @Input({ alias: 'delete-url' }) deleteUrl = '';
  @Input({ alias: 'rename-url' }) renameUrl = '';
  @Input({ alias: 'parent-id' }) parentId = '';
  @Input({ alias: 'create-root' }) set createRootInput(value: string) {
    this.createRoot = value === '1' || value === 'true';
  }
  /** When set (top nav on homepage), navigate here after create so the child row renders. */
  @Input({ alias: 'after-create-visit' }) afterCreateVisit = '';
  @Input({ alias: 'placeholder' }) placeholder = 'Add new';
  @Input({ alias: 'can-edit' }) set canEditInput(value: string) {
    this.canEdit = value === '1' || value === 'true';
  }
  @Input({ alias: 'chips-json' }) set chipsJson(value: string) {
    try {
      const parsed = JSON.parse(value || '[]');
      this.chips = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.chips = [];
    }
  }

  canEdit = false;
  createRoot = false;
  isBusy = false;

  openAddDialog(): void {
    if (this.isBusy || !this.canEdit || !this.createUrl) {
      return;
    }
    this.dialog
      .open(PromptDialogComponent, {
        ...appMaterialDialogDefaults(),
        data: {
          title: 'New category',
          label: 'Name',
          confirmText: 'Create',
        },
        width: '360px',
      })
      .afterClosed()
      .subscribe((name: string | undefined) => {
        const trimmed = name?.trim();
        if (!trimmed) {
          return;
        }
        this.runMutation(this.postJson(this.createUrl, {
          name: trimmed,
          parent_id: this.parentId || null,
          create_root: this.createRoot,
        }), () => this.afterCreateRedirectOrRefresh())
          .catch((err: Error) => this.showAlert(err.message || 'Could not create category.'));
      });
  }

  onRenameClick(evt: Event, chip: TaxonomyChip): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (this.isBusy || !this.canEdit || chip.removable === false || !chip?.id) {
      return;
    }
    if (!this.renameUrl) {
      this.showAlert('Rename is not configured (missing rename URL).');
      return;
    }
    this.dialog
      .open(PromptDialogComponent, {
        ...appMaterialDialogDefaults(),
        data: {
          title: 'Rename category',
          label: 'Name',
          value: chip.name,
          confirmText: 'Save',
        },
        width: '360px',
      })
      .afterClosed()
      .subscribe((name: string | undefined) => {
        const trimmed = name?.trim();
        if (!trimmed || trimmed === chip.name) {
          return;
        }
        this.runMutation(this.postJson(this.renameUrl, { term_id: chip.id, name: trimmed }), () =>
          this.refreshCurrentPage()
        ).catch((err: Error) => this.showAlert(err.message || 'Could not rename category.'));
      });
  }

  removeChip(chip: TaxonomyChip): void {
    if (this.isBusy || !this.canEdit || chip.removable === false || !this.deleteUrl || !chip?.id) {
      return;
    }
    this.showConfirm('Delete this category? This cannot be undone.', 'Delete category').then((ok) => {
      if (this.isBusy || !ok) {
        return;
      }
      this.runMutation(this.postJson(this.deleteUrl, { term_id: chip.id }), () => this.refreshCurrentPage()).catch(
        (err: Error) => this.showAlert(err.message || 'Could not delete category.')
      );
    });
  }

  onRemoveClick(evt: Event, chip: TaxonomyChip): void {
    evt.preventDefault();
    evt.stopPropagation();
    this.removeChip(chip);
  }

  onChipClick(evt: Event, chip: TaxonomyChip): void {
    if (this.isBusy || !chip?.url) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    this.setActiveChip(chip.id);
    this.visitWithMainFrame(chip.url);
  }

  private setActiveChip(chipId: string): void {
    this.chips = this.chips.map((chip) => ({
      ...chip,
      active: chip.id === chipId,
    }));
  }

  private runMutation(promise: Promise<unknown>, onSuccess: () => void): Promise<void> {
    this.isBusy = true;
    return promise
      .then(() => {
        onSuccess();
      })
      .catch((err) => {
        this.isBusy = false;
        throw err;
      });
  }

  private getCookie(name: string): string {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || '';
    }
    return '';
  }

  private postJson(url: string, payload: unknown): Promise<unknown> {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': this.getCookie('csrftoken'),
        Accept: 'application/json',
      },
      body: JSON.stringify(payload || {}),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data && data.error) || 'Request failed.');
      }
      return data;
    });
  }

  private afterCreateRedirectOrRefresh(): void {
    const target = (this.afterCreateVisit || '').trim();
    if (target) {
      // Full-document Turbo visit: framed `#main` visits require `<turbo-frame id="main">`
      // in the response (404/error pages break with an uncaught Turbo promise).
      this.visitAfterCreate(target);
      return;
    }
    this.refreshCurrentPage();
  }

  private visitAfterCreate(url: string): void {
    if (!window.Turbo || typeof window.Turbo.visit !== 'function') {
      window.location.assign(url);
      return;
    }
    window.Turbo.visit(url, { action: 'replace' });
  }

  private visitWithMainFrame(url: string): void {
    if (!window.Turbo || typeof window.Turbo.visit !== 'function') {
      window.location.assign(url);
      return;
    }
    if (document.querySelector('turbo-frame#main')) {
      window.Turbo.visit(url, { action: 'replace', frame: 'main' });
      return;
    }
    window.Turbo.visit(url, { action: 'replace' });
  }

  private refreshCurrentPage(): void {
    if (!window.Turbo || typeof window.Turbo.visit !== 'function') {
      window.location.reload();
      return;
    }
    if (document.querySelector('turbo-frame#main')) {
      window.Turbo.visit(window.location.href, { action: 'replace', frame: 'main' });
      return;
    }
    window.Turbo.visit(window.location.href, { action: 'replace' });
  }

  private showAlert(message: string): void {
    if (window.showMaterialAlert && typeof window.showMaterialAlert === 'function') {
      void window.showMaterialAlert(message, 'Notice');
      return;
    }
    alert(message);
  }

  private showConfirm(message: string, title: string): Promise<boolean> {
    if (window.showMaterialConfirm && typeof window.showMaterialConfirm === 'function') {
      return window.showMaterialConfirm(message, title);
    }
    return Promise.resolve(window.confirm(message));
  }
}
