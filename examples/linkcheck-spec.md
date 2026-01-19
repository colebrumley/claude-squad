# Markdown Link Checker

CLI tool that finds broken links in markdown files.

## Requirements

### Core Functionality

1. Scan markdown files for links (both `[text](url)` and raw URLs)
2. Check each link via HTTP HEAD request (fall back to GET if HEAD fails)
3. Report results: working, broken (4xx/5xx), or unreachable (timeout/DNS)

### CLI Interface

```
linkcheck <glob-pattern>
linkcheck "docs/**/*.md"
linkcheck README.md
```

### Output Format

```
Checking 12 links in 3 files...

✓ https://example.com
✗ https://broken.link (404)
⚠ https://timeout.site (timeout)

Summary: 10 ok, 1 broken, 1 unreachable
```

### Constraints

- Node.js/TypeScript
- No external markdown parsing libraries - use regex
- 5 second timeout per link
- Exit code 0 if all links ok, 1 if any broken
