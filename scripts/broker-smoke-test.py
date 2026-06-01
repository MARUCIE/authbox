#!/usr/bin/env python3
"""End-to-end smoke test for the Auth Box authorization broker.

Acts as a real agent client: connects to the broker's loopback WebSocket, sends
a signed AccessIntent, and prints the AccessEffect the broker returns. Exercises
the full authorize -> (step-up consent) -> audit path against the running app.

Prerequisites:
  - Auth Box is running and UNLOCKED.
  - In the app: Authorizations -> Start broker -> Grant agent. Copy the bearer
    token shown once at grant time.
  - Python `websockets` (pip install websockets).

Usage:
  python3 scripts/broker-smoke-test.py <token>
  python3 scripts/broker-smoke-test.py <token> --agent agent_claude_agent_0 --action read

If the granted agent requires Touch ID step-up, this client BLOCKS on recv while
the app shows a "Pending consent" card. Click "Allow once" and approve with
Touch ID; the effect (allowed=true) then arrives here and a Fact is sealed into
the app's audit log. The agentId follows the app's rule:
  agent_<name lowercased, spaces->_>_<grant index>   e.g. "Claude Agent" -> agent_claude_agent_0
"""
import argparse
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    sys.exit("ERROR: pip install websockets")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Auth Box broker smoke test")
    p.add_argument("token", help="bearer token shown once at grant time")
    p.add_argument("--agent", default="agent_claude_agent_0", help="agentId (default: agent_claude_agent_0)")
    p.add_argument("--action", default="read", choices=["read", "use", "proxy"], help="requested action")
    p.add_argument("--item-id", default=None, help="optional itemId to request")
    p.add_argument("--port", type=int, default=19876, help="broker port (default 19876)")
    p.add_argument("--timeout", type=float, default=120.0, help="seconds to wait for the effect")
    return p.parse_args()


async def run(args: argparse.Namespace) -> int:
    intent = {"agentId": args.agent, "action": args.action, "token": args.token}
    if args.item_id:
        intent["itemId"] = args.item_id
    uri = f"ws://127.0.0.1:{args.port}"
    try:
        async with websockets.connect(uri) as ws:
            await ws.send(json.dumps(intent))
            print(f"SENT  {json.dumps(intent)}", flush=True)
            print(f"WAIT  up to {args.timeout:.0f}s for effect (approve step-up in the app if prompted)...", flush=True)
            raw = await asyncio.wait_for(ws.recv(), timeout=args.timeout)
            text = raw.decode() if isinstance(raw, (bytes, bytearray)) else raw
            print(f"EFFECT {text}", flush=True)
            effect = json.loads(text)
            return 0 if effect.get("allowed") else 1
    except asyncio.TimeoutError:
        print(f"TIMEOUT no effect within {args.timeout:.0f}s", flush=True)
        return 2
    except ConnectionRefusedError:
        print(f"REFUSED nothing listening on {uri} — is the broker started and the vault unlocked?", flush=True)
        return 3


if __name__ == "__main__":
    sys.exit(asyncio.run(run(parse_args())))
