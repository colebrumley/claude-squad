#!/bin/sh
# Set up git hooks for the project

HOOK_DIR=".git/hooks"

# Only proceed if we're in a git repo
if [ ! -d ".git" ]; then
  exit 0
fi

# Create pre-commit hook
cat > "$HOOK_DIR/pre-commit" << 'EOF'
#!/bin/sh
# Pre-commit hook to run biome check

echo "Running biome check..."

npm run check

if [ $? -ne 0 ]; then
  echo ""
  echo "Biome check failed. Run 'npm run check -- --fix' to auto-fix issues."
  exit 1
fi
EOF

chmod +x "$HOOK_DIR/pre-commit"

echo "Git hooks installed successfully"
