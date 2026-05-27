"""US equity session windows (Eastern Time) for Alpaca snapshot labeling."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

_PRE_START = time(4, 0)
_REGULAR_START = time(9, 30)
_REGULAR_END = time(16, 0)
_POST_END = time(20, 0)
_OVERNIGHT_START = time(20, 0)


@dataclass(frozen=True)
class UsMarketSessionInfo:
    """Current or historical US cash-equity session bucket."""

    id: str
    label: str
    price_basis: str

    @property
    def is_extended(self) -> bool:
        return self.price_basis == "extended"


def classify_us_market_session(at: datetime | None = None) -> UsMarketSessionInfo:
    """
    Classify the US equity session at ``at`` (default: now in ET).

    Weekends: Saturday all day and Sunday before 20:00 ET are ``closed``.
    Sunday 20:00+ starts overnight (24/5). Friday 20:00+ is ``closed`` (end of week).
    """
    if at is None:
        at = datetime.now(tz=ET)
    elif at.tzinfo is None:
        at = at.replace(tzinfo=ZoneInfo("UTC")).astimezone(ET)
    else:
        at = at.astimezone(ET)

    wd = at.weekday()
    t = at.time()

    if wd == 5:
        return _closed()
    if wd == 6:
        if t < _OVERNIGHT_START:
            return _closed()
        return _overnight()
    if wd == 4 and t >= _OVERNIGHT_START:
        return _closed()

    if t >= _OVERNIGHT_START or t < _PRE_START:
        return _overnight()
    if t < _REGULAR_START:
        return _pre()
    if t < _REGULAR_END:
        return _regular()
    if t < _POST_END:
        return _post()
    return _overnight()


def _pre() -> UsMarketSessionInfo:
    return UsMarketSessionInfo("pre", "Pre-market", "extended")


def _regular() -> UsMarketSessionInfo:
    return UsMarketSessionInfo("regular", "Regular", "regular")


def _post() -> UsMarketSessionInfo:
    return UsMarketSessionInfo("post", "After-hours", "extended")


def _overnight() -> UsMarketSessionInfo:
    return UsMarketSessionInfo("overnight", "Overnight", "extended")


def _closed() -> UsMarketSessionInfo:
    return UsMarketSessionInfo("closed", "Closed", "regular")
