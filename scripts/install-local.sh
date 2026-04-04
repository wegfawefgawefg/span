#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Span"
INSTALL_ROOT="${SPAN_INSTALL_ROOT:-$HOME/.local/opt}"
INSTALL_DIR="${SPAN_INSTALL_DIR:-$INSTALL_ROOT/$APP_NAME}"
BIN_DIR="${SPAN_BIN_DIR:-$HOME/.local/bin}"
DESKTOP_DIR="${SPAN_DESKTOP_DIR:-$HOME/.local/share/applications}"
WRAPPER_PATH="$BIN_DIR/span"
DESKTOP_PATH="$DESKTOP_DIR/span.desktop"
BUN_BIN="${BUN:-$HOME/.bun/bin/bun}"
ARTIFACT_PATH="$REPO_ROOT/artifacts/stable-linux-x64-Span.tar.zst"
STAGING_DIR="$(mktemp -d)"
BACKUP_DIR=""

cleanup() {
	rm -rf "$STAGING_DIR"
	if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" && ! -d "$INSTALL_DIR" ]]; then
		mv "$BACKUP_DIR" "$INSTALL_DIR"
	fi
}

trap cleanup EXIT

if [[ ! -x "$BUN_BIN" ]]; then
	echo "bun not found at $BUN_BIN" >&2
	exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
	echo "tar is required but not available" >&2
	exit 1
fi

cd "$REPO_ROOT"

"$BUN_BIN" install --frozen-lockfile
"$BUN_BIN" run build:desktop

if [[ ! -f "$ARTIFACT_PATH" ]]; then
	echo "expected desktop artifact missing: $ARTIFACT_PATH" >&2
	exit 1
fi

mkdir -p "$INSTALL_ROOT" "$BIN_DIR" "$DESKTOP_DIR"
tar --zstd -xf "$ARTIFACT_PATH" -C "$STAGING_DIR"

if [[ ! -d "$STAGING_DIR/$APP_NAME" ]]; then
	echo "extracted bundle missing: $STAGING_DIR/$APP_NAME" >&2
	exit 1
fi

if [[ -d "$INSTALL_DIR" ]]; then
	BACKUP_DIR="${INSTALL_DIR}.bak.$$"
	mv "$INSTALL_DIR" "$BACKUP_DIR"
fi

mv "$STAGING_DIR/$APP_NAME" "$INSTALL_DIR"

if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
	rm -rf "$BACKUP_DIR"
	BACKUP_DIR=""
fi

cat >"$WRAPPER_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$INSTALL_DIR/bin"
exec ./launcher "\$@"
EOF
chmod 755 "$WRAPPER_PATH"

cat >"$DESKTOP_PATH" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Span
Comment=Standalone spritesheet annotator
Exec=$WRAPPER_PATH
TryExec=$WRAPPER_PATH
Terminal=false
Categories=Graphics;Development;
StartupWMClass=Span
EOF
chmod 644 "$DESKTOP_PATH"

echo "Installed $APP_NAME to $INSTALL_DIR"
echo "Launcher command: $WRAPPER_PATH"
echo "Desktop entry: $DESKTOP_PATH"
echo "Update flow: git pull && bun run install:local"
