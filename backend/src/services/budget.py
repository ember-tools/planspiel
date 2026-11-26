"""Token buckets that limit how often the server may ask a third party on its users' behalf."""

import time
from collections.abc import Callable

Rate = tuple[float, float]
"""A bucket's burst size and how many tokens it regains per second."""


class TokenBudget:
    """Token buckets: one shared by everyone and one per client.

    Every request to the third party takes a token from the shared bucket and one from the bucket of
    the requesting client. Buckets refill continuously up to their burst size, so short bursts pass
    while the sustained rate stays low; a loop asking again and again does not get far.
    """

    def __init__(self, everyone: Rate, per_client: Rate, clock: Callable[[], float] = time.time) -> None:
        """Start with full buckets."""
        self.everyone = everyone
        self.per_client = per_client
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}

    def take(self, client: str) -> bool:
        """Take a token for `client` and for everyone, or neither when either bucket is empty."""
        now = self.clock()
        everyone = self._level("*", self.everyone, now)
        own = self._level(f"client:{client}", self.per_client, now)
        if everyone < 1 or own < 1:
            return False
        self._buckets["*"] = (everyone - 1, now)
        self._buckets[f"client:{client}"] = (own - 1, now)
        if len(self._buckets) > 10_000:
            self._buckets = {key: value for key, value in self._buckets.items() if now - value[1] < 3600}
        return True

    def _level(self, key: str, rate: Rate, now: float) -> float:
        """Return how many tokens a bucket holds right now."""
        burst, per_second = rate
        level, since = self._buckets.get(key, (burst, now))
        return min(burst, level + (now - since) * per_second)
