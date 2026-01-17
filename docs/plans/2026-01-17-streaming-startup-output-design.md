# Streaming Startup Output Design

## Problem

When running the CLI (with or without TUI), there's a long delay (2-10+ seconds) after the TUI renders before any output appears. The orchestrator is running but users see no feedback during:
1. MCP server startup
2. Claude API connection
3. First agent response

Additionally, the enumerate and plan phases stream output via `onOutput` callback, but the TUI never wires this up - only `onLoopOutput` is connected.

## Solution

Add a dedicated status area to the TUI that shows:
1. Current phase name with spinner during async operations
2. Status messages ("Starting MCP server...", "Waiting for agent...")
3. Streaming output from enumerate/plan agents

## Design

### Layout Change

```
┌─────────────────────────────────────────┐
│ Phase: enumerate  ⠋ Connecting...       │  <- StatusArea (new)
│ > Reading spec file...                  │
│ > Analyzing requirements...             │
├─────────────────────────────────────────┤
│ Loop 1 │ Loop 2 │ Loop 3 │ Loop 4       │  <- Existing columns
│        │        │        │              │
└─────────────────────────────────────────┘
```

### New Component: StatusArea

Location: `src/tui/StatusArea.tsx`

Props:
- `phase: Phase` - Current phase name
- `isLoading: boolean` - Whether to show spinner
- `statusMessage: string` - Current status ("Connecting...", "Processing...")
- `output: string[]` - Last N lines of phase output

Behavior:
- Shows spinner animation when `isLoading` is true
- Displays phase name prominently
- Shows last 3-5 lines of streaming output
- Collapses to single line during build phase (loops take focus)

### State Changes in App.tsx

Add new state:
```typescript
const [phaseOutput, setPhaseOutput] = useState<string[]>([]);
const [statusMessage, setStatusMessage] = useState<string>('');
const [isLoading, setIsLoading] = useState<boolean>(true);
```

Wire up callbacks:
```typescript
const newState = await runOrchestrator(state, {
  onPhaseStart: (phase) => {
    setIsLoading(true);
    setStatusMessage(getPhaseStartMessage(phase));
    setPhaseOutput([]);
  },
  onPhaseComplete: (phase, success) => {
    setIsLoading(false);
    setStatusMessage(success ? 'Complete' : 'Failed');
  },
  onOutput: (text) => {
    setPhaseOutput(prev => [...prev.slice(-4), text]);
  },
  onLoopOutput: (loopId, text) => { ... },
});
```

### Status Messages

Phase-specific messages:
- `enumerate`: "Reading spec and identifying tasks..."
- `plan`: "Analyzing dependencies and creating execution plan..."
- `build`: "Running parallel agents..." (then StatusArea minimizes)
- `review`: "Reviewing work quality..."
- `revise`: "Analyzing issues and planning fixes..."
- `conflict`: "Resolving merge conflicts..."

### Spinner

Use ink-spinner or simple rotating characters: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`

## Files to Modify

1. `src/tui/StatusArea.tsx` - New component
2. `src/tui/Layout.tsx` - Add StatusArea to layout
3. `src/tui/App.tsx` - Add state and wire up callbacks
4. `package.json` - Add ink-spinner dependency (if not using custom)

## Testing

Manual testing:
1. Run with `--tui` flag, observe immediate spinner and status
2. Verify enumerate phase output streams to status area
3. Verify plan phase output streams to status area
4. Verify status area minimizes during build phase
5. Run without `--tui`, verify console output still works
