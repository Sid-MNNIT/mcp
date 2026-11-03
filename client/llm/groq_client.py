import os
import time
import threading
from dotenv import load_dotenv
from groq import Groq, RateLimitError

load_dotenv()


class GroqKeyRotator:
    """
    Rotates across multiple Groq API keys to spread token usage.
    On a 429 RateLimitError, marks the current key as exhausted and
    switches to the next available one automatically.

    Keys are read from env vars:
        GROQ_API_KEY_1, GROQ_API_KEY_2, GROQ_API_KEY_3, ...
    Falls back to GROQ_API_KEY if none of the numbered ones are set.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._keys = self._load_keys()
        # 30s per call, one built-in retry: a hung Groq call must not block a sync forever
        self._clients = [Groq(api_key=k, timeout=30.0, max_retries=1) for k in self._keys]
        self._index = 0
        self._cooldowns: dict[int, float] = {}  # index → timestamp when it cools down
        print(f"🔑 [Groq] Loaded {len(self._keys)} API key(s)")

    def _load_keys(self) -> list[str]:
        keys = []
        # Try numbered keys first: GROQ_API_KEY_1, _2, _3 ...
        i = 1
        while True:
            key = os.getenv(f"GROQ_API_KEY_{i}")
            if not key:
                break
            keys.append(key)
            i += 1

        # Fall back to single GROQ_API_KEY
        if not keys:
            key = os.getenv("GROQ_API_KEY")
            if key:
                keys.append(key)

        if not keys:
            raise RuntimeError("No Groq API keys found. Set GROQ_API_KEY or GROQ_API_KEY_1, GROQ_API_KEY_2, ...")

        return keys

    def _get_available_index(self) -> int | None:
        """Return the next available (non-cooled-down) key index."""
        now = time.time()
        total = len(self._clients)
        for offset in range(total):
            idx = (self._index + offset) % total
            cooldown_until = self._cooldowns.get(idx, 0)
            if now >= cooldown_until:
                return idx
        return None  # all keys are rate-limited

    def get_client(self) -> Groq:
        with self._lock:
            idx = self._get_available_index()
            if idx is None:
                # All keys exhausted — return the one whose cooldown expires soonest
                idx = min(self._cooldowns, key=lambda i: self._cooldowns[i])
                print(f"⚠️  [Groq] All keys rate-limited. Using key {idx + 1} anyway (will likely 429)")
            self._index = idx
            return self._clients[idx]

    def mark_rate_limited(self, cooldown_seconds: int = 120):
        """Call this when a 429 is received to cool down the current key."""
        with self._lock:
            idx = self._index
            self._cooldowns[idx] = time.time() + cooldown_seconds
            print(f"🚫 [Groq] Key {idx + 1} rate-limited — cooling down for {cooldown_seconds}s")
            # Advance to next key immediately
            next_idx = self._get_available_index()
            if next_idx is not None and next_idx != idx:
                self._index = next_idx
                print(f"🔄 [Groq] Switched to key {next_idx + 1}")


# Singleton rotator
_rotator: GroqKeyRotator | None = None
_rotator_lock = threading.Lock()


def get_groq_rotator() -> GroqKeyRotator:
    global _rotator
    if _rotator is None:
        with _rotator_lock:
            if _rotator is None:
                _rotator = GroqKeyRotator()
    return _rotator


def get_groq_client() -> Groq:
    """
    Drop-in replacement for the old get_groq_client().
    Returns the currently active Groq client from the rotator.
    """
    return get_groq_rotator().get_client()


def groq_chat_with_fallback(model: str, messages: list, **kwargs) -> object:
    """
    Wrapper around client.chat.completions.create() that automatically
    rotates to the next key on a 429 and retries once.

    Usage:
        response = groq_chat_with_fallback(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "..."}],
            temperature=0,
            max_tokens=120,
        )
        text = response.choices[0].message.content
    """
    rotator = get_groq_rotator()

    for attempt in range(len(rotator._keys) + 1):  # try each key at most once
        client = rotator.get_client()
        try:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
        except RateLimitError as e:
            print(f"⚡ [Groq] 429 on key {rotator._index + 1} — rotating...")
            rotator.mark_rate_limited(cooldown_seconds=120)
            if attempt == len(rotator._keys):
                raise  # all keys exhausted, re-raise

    raise RuntimeError("Groq: exhausted all retries across all keys")
