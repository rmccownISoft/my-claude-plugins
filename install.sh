#!/usr/bin/env bash
# install.sh — Install packaged skills to Claude's skills directory
#
# Usage:
#   ./install.sh              # install all skills in dist/
#   ./install.sh skill-name   # install a single skill
#   ./install.sh --build      # build first, then install all

# Claude Code stores skills at ~/.claude/skills/ (each skill is a directory with a SKILL.md inside)
SKILLS_INSTALL_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$REPO_DIR/dist"

# Handle --build flag
if [ "${1:-}" = "--build" ]; then
  echo "🔨 Building first..."
  "$REPO_DIR/build.sh"
  echo ""
  shift
fi

# Validate install dir
if [ ! -d "$SKILLS_INSTALL_DIR" ]; then
  echo "📁 Skills directory not found: $SKILLS_INSTALL_DIR"
  echo ""
  echo "   Create it with:  mkdir -p \"$SKILLS_INSTALL_DIR\""
  echo "   Or override:     CLAUDE_SKILLS_DIR=/your/path ./install.sh"
  exit 1
fi

install_skill() {
  local skill_file="$1"
  local skill_name
  skill_name="$(basename "$(dirname "$skill_file")")"

  echo "📥 Installing: $skill_name"
  unzip -o -q "$skill_file" -d "$SKILLS_INSTALL_DIR"
  echo "   ✅ Installed to: $SKILLS_INSTALL_DIR/$skill_name/"
}

# Install a single skill or all
if [ $# -eq 1 ]; then
  target="$DIST_DIR/$1/$1.skill"
  if [ ! -f "$target" ]; then
    echo "❌ No packaged skill found: $target"
    echo "   Run ./build.sh $1 first"
    exit 1
  fi
  install_skill "$target"
else
  echo "📥 Installing all skills from dist/ → $SKILLS_INSTALL_DIR"
  echo ""
  count=0
  for skill_file in "$DIST_DIR"/*/*.skill; do
    [ -f "$skill_file" ] || { echo "⚠️  No .skill files found in dist/"; exit 1; }
    install_skill "$skill_file"
    ((count++))
  done
  echo ""
  echo "✅ Installed $count skill(s)"
fi
