import * as React from 'react';
import { Card } from '../components/ui/card';

export type FxBrokerPayload = {
  kind: 'fxbroker';
  brokerName: string;
  logoUrl?: string;
  faviconUrl?: string;
  overallRating: number;
  website?: string;
  visitUrl?: string;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`scn-fx-broker-card__star${filled ? '' : ' scn-fx-broker-card__star--empty'}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {filled ? (
        <path
          fill="currentColor"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        />
      )}
    </svg>
  );
}

function StarRating({ score }: { score: number }) {
  const filled = Math.round(Math.max(0, Math.min(5, score)));
  const empty = 5 - filled;
  return (
    <span
      className="scn-fx-broker-card__stars"
      aria-label={`${score.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: filled }, (_, i) => <StarIcon key={`f${i}`} filled />)}
      {Array.from({ length: empty }, (_, i) => <StarIcon key={`e${i}`} filled={false} />)}
    </span>
  );
}

export function FxBrokerCardView({ data }: { data: FxBrokerPayload }): React.JSX.Element {
  const score = Math.max(0, Math.min(5, data.overallRating));
  const logoUrl = data.logoUrl || data.faviconUrl;

  return (
    <Card className="scn-fx-broker-card">
      <div className="scn-fx-broker-card__header">
        <div className="scn-fx-broker-card__identity">
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              width={40}
              height={40}
              className="scn-fx-broker-card__logo"
              loading="lazy"
            />
          )}
          <span className="scn-fx-broker-card__name">{data.brokerName}</span>
        </div>
      </div>

      <div className="scn-fx-broker-card__body">
        <div className="scn-fx-broker-card__rating">
          <span className="scn-fx-broker-card__score">{score.toFixed(1)}</span>
          <StarRating score={score} />
        </div>
        {data.website && (
          <a href={data.website} className="scn-fx-broker-card__review-link" target="_blank" rel="noopener noreferrer">
            Visit website
          </a>
        )}
      </div>

      {data.visitUrl && (
        <div className="scn-fx-broker-card__footer">
          <a
            href={data.visitUrl}
            className="scn-fx-broker-card__visit-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit Site
          </a>
        </div>
      )}
    </Card>
  );
}
