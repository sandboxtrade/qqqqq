# Release v0.20.31

Base: v0.20.30. SCHEMA_VERSION remains 4.

## Fix: WaveSpeed balance-aware key failover

WaveSpeed can accept a task and only later finish it with `status=failed` and an account-credit error such as `A top-up is required. Please top up your account to continue.`

Previously this was treated as an ordinary terminal generation failure, so multi-key failover never moved to the next WaveSpeed key.

Now:
- terminal WaveSpeed failures are inspected for balance/credit/top-up errors;
- if another configured key exists, the frontend asks the Worker to retry the same WaveSpeed model using the next key;
- the Worker independently re-checks the failed task before allowing the retry;
- MiniMax retries MiniMax on the next key first;
- direct WAN retries WAN on the next key;
- API keys remain only in Cloudflare secrets and are never returned to the frontend.

Unchanged:
- Firebase/Auth/Firestore/App Check/live-sync/persistence;
- SCHEMA_VERSION=4;
- photo provider order from v0.20.30.
