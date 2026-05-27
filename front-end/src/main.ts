import { createApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { createCustomElement } from '@angular/elements';
import { importProvidersFrom } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { TaxonomyChipWidgetComponent } from './app/taxonomy-chip-widget.component';
import { appMaterialDialogDefaults } from './app/dialog-defaults';
import { mountShadcnAuthDialogBridge, type AuthTab } from './app/auth-dialog-shadcn';
import { mountShadcnBreadcrumbs } from './app/shadcn-breadcrumb';
import { mountShadcnArticleDatelines } from './app/shadcn-article-datelines';
import {
  mountShadcnArticleTags,
  unmountShadcnArticleTags,
} from './app/shadcn-article-tags';
import {
  mountShadcnTagCloud,
  unmountShadcnTagCloud,
} from './app/shadcn-tag-cloud';
import {
  mountShadcnArticleShare,
  unmountShadcnArticleShare,
} from './app/shadcn-article-share';
import { mountShadcnArticleCards, mountRecentArticlesBlocks } from './app/shadcn-card-layout';
import {
  mountShadcnArticleCarousel,
  unmountShadcnArticleCarousel,
} from './app/shadcn-article-carousel';
import { mountShadcnBento2 } from './app/shadcn-bento2';
import { mountShadcnBentoGrid01 } from './app/shadcn-bentogrid01';
import { mountShadcnTaxonomySiteNav } from './app/shadcn-taxonomy-site-nav';
import {
  mountShadcnBrokerTable,
  mountShadcnBrokerCarousel,
  unmountShadcnBrokerTable,
  unmountShadcnBrokerCarousel,
  scheduleShadcnBrokerMounts,
} from './app/shadcn-broker-data-table';
import { mountShadcnBigTraderCard } from './app/shadcn-big-trader-card';
import { mountShadcnSwingSetups } from './app/shadcn-swing-setups';
import { mountShadcnTickerTabs, unmountShadcnTickerTabs } from './app/shadcn-ticker-tabs';
import { mountShadcnProfileArticlesTable } from './app/shadcn-profile-articles-table';
import { mountShadcnArticleEditor } from './app/shadcn-article-editor';
import { mountShadcnProfileHeaderButton } from './app/shadcn-profile-header-button';
import { mountShadcnReadingThemeToggle } from './app/shadcn-reading-theme-toggle';
import { mountTaxonomyEditor, unmountTaxonomyEditors } from './app/shadcn-taxonomy-editor';
import { mountShadcnHamburgerNav } from './app/shadcn-hamburger-nav';
import {
  ConfirmDialogComponent,
  MessageDialogComponent,
  PromptDialogComponent,
  type PromptDialogData,
} from './app/material-dialogs.component';

/** Sticky flag + event so classic scripts/Turbo hooks mount after async bootstrap. */
function signalAppReady(): void {
  window.__appReady = true;
  document.dispatchEvent(new CustomEvent('app:ready'));
}

declare global {
  interface Window {
    __appReady?: boolean;
    mountTaxonomyChipWidgets?: () => void;
    showMaterialConfirm?: (message: string, title?: string) => Promise<boolean>;
    showMaterialAlert?: (message: string, title?: string) => Promise<void>;
    showMaterialPrompt?: (data: PromptDialogData) => Promise<string | undefined>;
    showMaterialAuthDialog?: (initialTab: 'login' | 'signup') => void;
    mountShadcnBento2?: () => void;
    mountShadcnArticleCards?: () => void;
    mountShadcnArticleCarousel?: () => void;
    unmountShadcnArticleCarousel?: (root?: ParentNode) => void;
    mountRecentArticlesBlocks?: () => void;
    mountShadcnBreadcrumbs?: () => void;
    mountShadcnArticleDatelines?: () => void;
    mountShadcnArticleTags?: () => void;
    unmountShadcnArticleTags?: (root?: ParentNode) => void;
    mountShadcnTagCloud?: () => void;
    unmountShadcnTagCloud?: (root?: ParentNode) => void;
    mountShadcnArticleShare?: () => void;
    unmountShadcnArticleShare?: (root?: ParentNode) => void;
    mountShadcnTaxonomySiteNav?: () => void;
    mountShadcnBrokerTable?: () => void;
    mountShadcnBrokerCarousel?: () => void;
    unmountShadcnBrokerTable?: (root?: ParentNode) => void;
    unmountShadcnBrokerCarousel?: (root?: ParentNode) => void;
    scheduleShadcnBrokerMounts?: () => void;
    mountShadcnBigTraderCard?: (root?: ParentNode) => void;
    mountShadcnProfileArticlesTable?: () => void;
    mountShadcnArticleEditor?: () => void;
    mountTaxonomyEditor?: () => void;
    unmountTaxonomyEditors?: (root?: ParentNode) => void;
    mountShadcnBentoGrid01?: () => void;
    mountShadcnReadingThemeToggle?: () => void;
    mountShadcnProfileHeaderButton?: () => void;
    mountShadcnHamburgerNav?: () => void;
    mountShadcnSwingSetups?: () => void;
    mountShadcnTickerTabs?: () => void;
    unmountShadcnTickerTabs?: (root?: ParentNode) => void;
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
    window.mountShadcnArticleCarousel = mountShadcnArticleCarousel;
    window.unmountShadcnArticleCarousel = unmountShadcnArticleCarousel;
    window.mountRecentArticlesBlocks = mountRecentArticlesBlocks;
    window.mountShadcnBreadcrumbs = mountShadcnBreadcrumbs;
    window.mountShadcnArticleDatelines = mountShadcnArticleDatelines;
    window.mountShadcnArticleTags = mountShadcnArticleTags;
    window.unmountShadcnArticleTags = unmountShadcnArticleTags;
    window.mountShadcnTagCloud = mountShadcnTagCloud;
    window.unmountShadcnTagCloud = unmountShadcnTagCloud;
    window.mountShadcnArticleShare = mountShadcnArticleShare;
    window.unmountShadcnArticleShare = unmountShadcnArticleShare;
    window.mountShadcnTaxonomySiteNav = mountShadcnTaxonomySiteNav;
    window.mountShadcnBrokerTable = mountShadcnBrokerTable;
    window.mountShadcnBrokerCarousel = mountShadcnBrokerCarousel;
    window.unmountShadcnBrokerTable = unmountShadcnBrokerTable;
    window.unmountShadcnBrokerCarousel = unmountShadcnBrokerCarousel;
    window.scheduleShadcnBrokerMounts = scheduleShadcnBrokerMounts;
    window.mountShadcnBigTraderCard = mountShadcnBigTraderCard;
    window.mountShadcnProfileArticlesTable = mountShadcnProfileArticlesTable;
    window.mountShadcnArticleEditor = mountShadcnArticleEditor;
    window.mountTaxonomyEditor = mountTaxonomyEditor;
    window.unmountTaxonomyEditors = unmountTaxonomyEditors;
    window.mountShadcnBentoGrid01 = mountShadcnBentoGrid01;
    window.mountShadcnReadingThemeToggle = mountShadcnReadingThemeToggle;
    window.mountShadcnProfileHeaderButton = mountShadcnProfileHeaderButton;
    window.mountShadcnHamburgerNav = mountShadcnHamburgerNav;
    window.mountShadcnSwingSetups = mountShadcnSwingSetups;
    window.mountShadcnTickerTabs = mountShadcnTickerTabs;
    window.unmountShadcnTickerTabs = unmountShadcnTickerTabs;
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
    signalAppReady();
    mountTaxonomyChipWidgets();
    mountShadcnReadingThemeToggle();
    mountShadcnProfileHeaderButton();
    mountShadcnTaxonomySiteNav();
    mountShadcnBento2();
    mountShadcnArticleCarousel();
    mountShadcnArticleCards();
    mountRecentArticlesBlocks();
    mountShadcnBreadcrumbs();
    mountShadcnArticleDatelines();
    mountShadcnArticleTags();
    mountShadcnTagCloud();
    mountShadcnArticleShare();
    scheduleShadcnBrokerMounts();
    mountShadcnBigTraderCard();
    mountShadcnSwingSetups();
    mountShadcnTickerTabs();
    mountShadcnProfileArticlesTable();
    mountShadcnArticleEditor();
    mountTaxonomyEditor();
    mountShadcnBentoGrid01();
  })
  .catch((err) => console.error(err));
