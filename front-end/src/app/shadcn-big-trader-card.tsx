import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { SCN_PROSE } from '../components/ui/typography';
import { cn } from '../lib/utils';

export type CategoryRating = { label: string; score: number };

export type BigTraderCardPayload = {
  kind: 'big_trader_card';
  brokerId: number;
  brokerName: string;
  slug: string;
  detailUrl: string;
  website: string;
  faviconUrl: string;
  logoRectUrl: string;
  logoSquareUrl: string;
  displayLogoUrl: string;
  overview: string;
  bestForHtml: string;
  overallRating: number;
  reviews: number;
  categoryRatings: CategoryRating[];
  uploadUrl: string;
  updateUrl: string;
  isStaff: boolean;
};

function starFillAt(starIndex: number, score: number): 'full' | 'half' | 'empty' {
  const threshold = starIndex + 1;
  if (score >= threshold) return 'full';
  if (score >= threshold - 0.5) return 'half';
  return 'empty';
}

function StarGlyph({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const pathD =
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
  if (fill === 'half') {
    return (
      <span className="scn-big-trader-card__star scn-big-trader-card__star--half" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="scn-big-trader-card__star-svg scn-big-trader-card__star-svg--empty">
          <path fill="none" stroke="currentColor" strokeWidth="1.5" d={pathD} />
        </svg>
        <svg viewBox="0 0 24 24" className="scn-big-trader-card__star-svg scn-big-trader-card__star-svg--half-fill">
          <path fill="currentColor" d={pathD} />
        </svg>
      </span>
    );
  }
  return (
    <svg
      className={`scn-big-trader-card__star scn-big-trader-card__star-svg${fill === 'empty' ? ' scn-big-trader-card__star--empty' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {fill === 'full' ? (
        <path fill="currentColor" d={pathD} />
      ) : (
        <path fill="none" stroke="currentColor" strokeWidth="1.5" d={pathD} />
      )}
    </svg>
  );
}

function StarRating({ score, size = 'md' }: { score: number; size?: 'md' | 'lg' }) {
  const clamped = Math.max(0, Math.min(5, score));
  return (
    <span
      className={`scn-big-trader-card__stars scn-big-trader-card__stars--${size}`}
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <StarGlyph key={i} fill={starFillAt(i, clamped)} />
      ))}
    </span>
  );
}

export function BigTraderCardView({
  initial,
}: {
  initial: BigTraderCardPayload;
}): React.JSX.Element {
  const data = initial;
  const displayUrl = data.logoRectUrl || data.faviconUrl;

  const score = Math.max(0, Math.min(5, data.overallRating));

  return (
    <article className="scn-big-trader-card">
      <div className="scn-big-trader-card__main">
        <div className="scn-big-trader-card__left">
          <div className="scn-big-trader-card__logo-wrap">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt=""
                className="scn-big-trader-card__logo"
                loading="lazy"
              />
            ) : (
              <div className="scn-big-trader-card__logo-placeholder" aria-hidden="true" />
            )}
          </div>

          <h3 className="scn-big-trader-card__section-label">Overview</h3>
          {data.overview ? (
            <p className="scn-big-trader-card__overview">{data.overview}</p>
          ) : (
            <p className="scn-big-trader-card__overview scn-big-trader-card__overview--muted">No overview yet.</p>
          )}

          {(data.bestForHtml || data.detailUrl) && (
            <Accordion
              type="single"
              collapsible
              className="scn-big-trader-card__details-accordion scn-accordion"
            >
              <AccordionItem value="product-details">
                <AccordionTrigger className="scn-big-trader-card__details-trigger">
                  See full product details
                </AccordionTrigger>
                <AccordionContent className="scn-big-trader-card__details-content">
                  {data.bestForHtml ? (
                    <div
                      className={cn('scn-big-trader-card__details-rich', 'scn-broker-best-for', SCN_PROSE)}
                      dangerouslySetInnerHTML={{ __html: data.bestForHtml }}
                    />
                  ) : (
                    <p className="scn-big-trader-card__details-fallback">
                      <a href={data.detailUrl}>View {data.brokerName} details</a>
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <div className="scn-big-trader-card__links">
            {data.website && (
              <a
                href={data.website}
                className="scn-broker-review-btn"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit website
              </a>
            )}
          </div>
        </div>

        <div className="scn-big-trader-card__right">
          <div className="scn-big-trader-card__score-block">
            <span className="scn-big-trader-card__score-value">{score.toFixed(1)}</span>
            <div className="scn-big-trader-card__score-meta">
              <StarRating score={score} size="lg" />
              <span className="scn-big-trader-card__score-label">
                Overall rating
                {data.reviews > 0 && (
                  <span className="scn-big-trader-card__reviews"> · {data.reviews.toLocaleString()} reviews</span>
                )}
              </span>
            </div>
          </div>

          {data.categoryRatings.length > 0 && (
            <ul className="scn-big-trader-card__categories">
              {data.categoryRatings.map((row) => (
                <li key={row.label} className="scn-big-trader-card__category-row">
                  <span className="scn-big-trader-card__category-label">{row.label}</span>
                  <StarRating score={row.score} />
                  <span className="scn-big-trader-card__category-score">{row.score.toFixed(1)} / 5</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

const bigTraderCardRoots = new WeakMap<HTMLElement, Root>();

function readPayload(jsonId: string): BigTraderCardPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) return null;
  try {
    const parsed = JSON.parse(el.textContent) as BigTraderCardPayload;
    if (parsed?.kind !== 'big_trader_card') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mountShadcnBigTraderCard(root?: ParentNode): void {
  const scope = root ?? document;
  scope.querySelectorAll<HTMLElement>('[data-shadcn-big-trader-card]').forEach((host) => {
    if (host.dataset['shadcnBigTraderCardBound'] === '1') return;
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) return;
    const payload = readPayload(jsonId);
    if (!payload) return;
    host.dataset['shadcnBigTraderCardBound'] = '1';
    let reactRoot = bigTraderCardRoots.get(host);
    if (!reactRoot) {
      reactRoot = createRoot(host);
      bigTraderCardRoots.set(host, reactRoot);
    }
    reactRoot.render(<BigTraderCardView initial={payload} />);
  });
}
