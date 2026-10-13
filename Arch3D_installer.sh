#!/bin/bash
set -e

REPO_URL="https://github.com/pudepiedj/Arch3D.git"
INSTALL_DIR="$HOME/Arch3D"             # where the repo will be cloned

echo "=== 1. Homebrew ==="
if ! command -v brew >/dev/null 2>&1; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add brew to PATH (Apple Silicon location; harmless on Intel)
    if [ -f /opt/homebrew/bin/brew ]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "Homebrew already installed, skipping."
fi

echo "=== 2. Node.js ==="
if ! command -v node >/dev/null 2>&1; then
    brew install node
else
    echo "Node already installed ($(node --version)), skipping."
fi

echo "=== 3. Clone repo ==="
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Repo already cloned, pulling latest instead."
    git -C "$INSTALL_DIR" pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

echo "=== 4. Install dependencies ==="
cd "$INSTALL_DIR"
npm install

echo "=== 5. Start dev server ==="

# Start the server in the background, then open the browser
npm run dev &
SERVER_PID=$!

# Give Vite a moment to start, then open the browser tab
sleep 3
open "http://localhost:5173"

# Wait until the server exits (Ctrl-C in this window stops the app)
wait $SERVER_PID

# Keep the window open so any error or exit message can be read
echo ""
echo "Server stopped. You can close this window."
read -n 1 -s -r -p "Press any key to close..."
