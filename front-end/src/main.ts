import { createApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { createCustomElement } from '@angular/elements';
import { importProvidersFrom } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { TaxonomyChipWidgetComponent } from './app/taxonomy-chip-widget.component';
import { appMaterialDialogDefaults } from './app/dialog-defaults';
import { mountShadcnAuthDialogBridge, type AuthTab } from './app/auth-dialog-shadcn';
import { mountShadcnBreadcrumbs } from './app/shadcn-breadcrumb';
import { mountShadcnArticleCards, mountSimilarArticleCarousels, mountRecentArticlesBlocks } from './app/shadcn-card-layout';
import { mountShadcnBento2 } from './app/shadcn-bento2';
import { mountShadcnBentoGrid01 } from './app/shadcn-bentogrid01';
import { mountShadcnTaxonomySiteNav } from './app/shadcn-taxonomy-site-nav';
import { mountShadcnBrokerTable } from './app/shadcn-broker-data-table';
import { mountShadcnProfileArticlesTable } from './app/shadcn-profile-articles-table';
import { mountShadcnArticleEditor } from './app/shadcn-article-editor';
import { mountTaxonomyEditor } from './app/shadcn-taxonomy-editor';
import {
  ConfirmDialogComponent,
  MessageDialogComponent,
  PromptDialogComponent,
  type PromptDialogData,
} from './app/material-dialogs.component';

declare global {
  interface Window {
    mountTaxonomyChipWidgets?: () => void;
    showMaterialConfirm?: (message: string, title?: string) => Promise<boolean>;
    showMaterialAlert?: (message: string, title?: string) => Promise<void>;
    showMaterialPrompt?: (data: PromptDialogData) => Promise<string | undefined>;
    showMaterialAuthDialog?: (initialTab: 'login' | 'signup') => void;
    mountShadcnBento2?: () => void;
    mountShadcnArticleCards?: () => void;
    mountSimilarArticleCarousels?: () => void;
    mountRecentArticlesBlocks?: () => void;
    mountShadcnBreadcrumbs?: () => void;
    mountShadcnTaxonomySiteNav?: () => void;
    mountShadcnBrokerTable?: () => void;
    mountShadcnProfileArticlesTable?: () => void;
    mountShadcnArticleEditor?: () => void;
    mountTaxonomyEditor?: () => void;
    mountShadcnBentoGrid01?: () => void;
  }
}

function mountTaxonomyChipWidgets(): void {
  const hosts = document.querySelectorAll<HTMLElement>('[data-taxonomy-chip-widget]');
  hosts.forEach((host) => {
    if (host.getAttribute('data-taxonomy-chip-widget-bound') === '1') {
      return;
    }
    host.setAttribute('data-taxonomy-chip-widget-bound', '1');
    const el = document.createElement('taxonomy-chip-widget');
    if (host.dataset['canEdit']) {
      el.setAttribute('can-edit', host.dataset['canEdit']);
    }
    if (host.dataset['createUrl']) {
      el.setAttribute('create-url', host.dataset['createUrl']);
    }
    if (host.dataset['deleteUrl']) {
      el.setAttribute('delete-url', host.dataset['deleteUrl']);
    }
    if (host.dataset['parentId']) {
      el.setAttribute('parent-id', host.dataset['parentId']);
    }
    if (host.dataset['createRoot']) {
      el.setAttribute('create-root', host.dataset['createRoot']);
    }
    if (host.dataset['placeholder']) {
      el.setAttribute('placeholder', host.dataset['placeholder']);
    }
    if (host.dataset['chipsJson']) {
      el.setAttribute('chips-json', host.dataset['chipsJson']);
    }
    if (host.dataset['renameUrl']) {
      el.setAttribute('rename-url', host.dataset['renameUrl']);
    }
    if (host.dataset['afterCreateVisit']) {
      el.setAttribute('after-create-visit', host.dataset['afterCreateVisit']);
    }
    host.replaceChildren(el);
  });
}

createApplication({
  providers: [provideAnimations(), importProvidersFrom(MatDialogModule)],
})
  .then((appRef) => {
    const dialog = appRef.injector.get(MatDialog);
    const authDialogBridge = mountShadcnAuthDialogBridge();
    const taxonomyElement = createCustomElement(TaxonomyChipWidgetComponent, {
      injector: appRef.injector,
    });
    if (!customElements.get('taxonomy-chip-widget')) {
      customElements.define('taxonomy-chip-widget', taxonomyElement);
    }
    window.mountTaxonomyChipWidgets = mountTaxonomyChipWidgets;
    window.mountShadcnBento2 = mountShadcnBento2;
    window.mountShadcnArticleCards = mountShadcnArticleCards;
    window.mountSimilarArticleCarousels = mountSimilarArticleCarousels;
    window.mountRecentArticlesBlocks = mountRecentArticlesBlocks;
    window.mountShadcnBreadcrumbs = mountShadcnBreadcrumbs;
    window.mountShadcnTaxonomySiteNav = mountShadcnTaxonomySiteNav;
    window.mountShadcnBrokerTable = mountShadcnBrokerTable;
    window.mountShadcnProfileArticlesTable = mountShadcnProfileArticlesTable;
    window.mountShadcnArticleEditor = mountShadcnArticleEditor;
    window.mountTaxonomyEditor = mountTaxonomyEditor;
    window.mountShadcnBentoGrid01 = mountShadcnBentoGrid01;
    window.showMaterialConfirm = (message: string, title?: string) =>
      new Promise<boolean>((resolve) => {
        dialog
          .open(ConfirmDialogComponent, {
            ...appMaterialDialogDefaults(),
            data: { message, title },
          })
          .afterClosed()
          .subscribe((value) => resolve(Boolean(value)));
      });
    window.showMaterialAlert = (message: string, title?: string) =>
      new Promise<void>((resolve) => {
        dialog
          .open(MessageDialogComponent, {
            ...appMaterialDialogDefaults(),
            data: { message, title },
          })
          .afterClosed()
          .subscribe(() => resolve());
      });
    window.showMaterialPrompt = (data: PromptDialogData) =>
      new Promise<string | undefined>((resolve) => {
        dialog
          .open(PromptDialogComponent, {
            ...appMaterialDialogDefaults(),
            data,
            width: '360px',
          })
          .afterClosed()
          .subscribe((value) => resolve(value ?? undefined));
      });
    window.showMaterialAuthDialog = (initialTab: AuthTab) => {
      authDialogBridge.openAuthDialog(initialTab);
    };
    mountTaxonomyChipWidgets();
    mountShadcnTaxonomySiteNav();
    mountShadcnBento2();
    mountSimilarArticleCarousels();
    mountShadcnArticleCards();
    mountRecentArticlesBlocks();
    mountShadcnBreadcrumbs();
    mountShadcnBrokerTable();
    mountShadcnProfileArticlesTable();
    mountShadcnArticleEditor();
    mountTaxonomyEditor();
    mountShadcnBentoGrid01();
  })
  .catch((err) => console.error(err));
