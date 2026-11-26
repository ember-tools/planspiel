import unittest

from services.budget import TokenBudget


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class TokenBudgetTest(unittest.TestCase):
    def test_everyone_shares_one_bucket(self):
        budget = TokenBudget((5, 1.0), (100, 1.0), Clock())
        taken = sum(budget.take(f"client-{n}") for n in range(15))
        self.assertEqual(5, taken)

    def test_one_client_cannot_use_up_everyone_s_bucket(self):
        budget = TokenBudget((100, 1.0), (3, 1.0), Clock())
        self.assertEqual(3, sum(budget.take("greedy") for _ in range(10)))
        self.assertTrue(budget.take("other"))

    def test_buckets_refill_over_time(self):
        clock = Clock()
        budget = TokenBudget((2, 0.5), (2, 0.5), clock)
        while budget.take("one"):
            pass
        clock.now += 2
        self.assertTrue(budget.take("one"))
        self.assertFalse(budget.take("one"))
