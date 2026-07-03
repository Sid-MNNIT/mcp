"""
flush_chat_history.py
Run from project root with venv activated:
    python flush_chat_history.py

Uses REDIS_URL when set (production/Upstash), falls back to local Docker
Redis on port 6380 for dev.
"""
import os
import redis

REDIS_URL = os.getenv("REDIS_URL")

if REDIS_URL:
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
else:
    r = redis.Redis(host="localhost", port=6380, decode_responses=True)

r.ping()
print(f"Connected to Redis ({'Upstash' if REDIS_URL else 'localhost:6380'})")

keys = r.keys("jobsy:conversation:*")
if keys:
    r.delete(*keys)
    print(f"Deleted {len(keys)} conversation key(s):")
    for k in keys:
        print(f"  - {k}")
else:
    print("No conversation keys found.")

print("Done.")
