#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/.logs"
LOG_PATH="${SPAN_DEV_LOG:-$LOG_DIR/span-dev.log}"
BUN_BIN="${BUN:-$HOME/.bun/bin/bun}"

# Parse --port from arguments, default to 5173
VITE_PORT=5173
while [[ $# -gt 0 ]]; do
	case "$1" in
		--port) VITE_PORT="$2"; shift 2 ;;
		*) shift ;;
	esac
done

VITE_URL="${SPAN_HMR_URL:-http://localhost:$VITE_PORT}"

vite_pid=""
electrobun_pid=""

mkdir -p "$LOG_DIR"

exec > >(tee "$LOG_PATH") 2>&1

echo "[span-dev] logging to $LOG_PATH"
echo "[span-dev] mode: vite hmr + electrobun watch"

cd "$REPO_ROOT"

cleanup() {
	if [[ -n "$electrobun_pid" ]]; then
		kill "$electrobun_pid" 2>/dev/null || true
	fi
	if [[ -n "$vite_pid" ]]; then
		kill "$vite_pid" 2>/dev/null || true
	fi
}

trap cleanup EXIT INT TERM

kill_stale_dev_processes() {
	local line
	while IFS= read -r line; do
		local pid
		pid="$(echo "$line" | awk '{print $1}')"
		if [[ -n "$pid" && "$pid" != "$$" ]]; then
			echo "[span-dev] stopping stale vite pid=$pid"
			kill "$pid" 2>/dev/null || true
		fi
	done < <(pgrep -af "vite --port" | grep "$REPO_ROOT" || true)

	while IFS= read -r line; do
		local pid
		pid="$(echo "$line" | awk '{print $1}')"
		if [[ -n "$pid" && "$pid" != "$$" ]]; then
			echo "[span-dev] stopping stale electrobun watcher pid=$pid"
			kill "$pid" 2>/dev/null || true
		fi
	done < <(pgrep -af "electrobun dev --watch" | grep "$REPO_ROOT" || true)
}

if [[ ! -x "$BUN_BIN" ]]; then
	echo "[span-dev] bun not found at $BUN_BIN" >&2
	exit 1
fi

kill_stale_dev_processes
sleep 0.5

vite build

vite --port "$VITE_PORT" &
vite_pid=$!
echo "[span-dev] started vite dev server pid=$vite_pid"

for _ in {1..60}; do
	if curl -fsS "$VITE_URL" >/dev/null 2>&1; then
		echo "[span-dev] vite dev server ready at $VITE_URL"
		break
	fi
	sleep 0.5
done

if ! curl -fsS "$VITE_URL" >/dev/null 2>&1; then
	echo "[span-dev] vite dev server did not become ready" >&2
	exit 1
fi

electrobun dev --watch &
electrobun_pid=$!
echo "[span-dev] started electrobun watcher pid=$electrobun_pid"

wait "$vite_pid" "$electrobun_pid"
