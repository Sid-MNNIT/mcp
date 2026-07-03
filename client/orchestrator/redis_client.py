import os
import redis

# Prefer the full connection URL (production — Upstash) and fall back to
# the local Docker Redis on port 6380 for dev.
#   Production: REDIS_URL=rediss://default:<token>@<host>.upstash.io:6379
#   Local dev:  no env var needed — defaults to localhost:6380
REDIS_URL = os.getenv("REDIS_URL")

try:
    if REDIS_URL:
        _r = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    else:
        _r = redis.Redis(
            host="localhost",
            port=6380,
            decode_responses=True,
            socket_connect_timeout=2,
        )

    _r.ping()
    print(
        f"🟢 Redis connected ({'Upstash' if REDIS_URL else 'local dev on port 6380'})"
    )
    redis_client = _r
except Exception as e:
    print(f"⚠️  Redis unavailable ({e}). Conversation memory disabled — chat still works.")
    redis_client = None
