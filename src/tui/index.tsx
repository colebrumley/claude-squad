import React, { useState } from 'react';
import { render, useInput, useApp } from 'ink';
import type { OrchestratorState, LoopState } from '../types/index.js';
import { Layout } from './Layout.js';

interface TUIProps {
  initialState: OrchestratorState;
  onQuit?: () => void;
}

function TUI({ initialState, onQuit }: TUIProps) {
  const { exit } = useApp();
  const [state] = useState(initialState);
  const [loops] = useState<LoopState[]>(initialState.activeLoops);

  useInput((input) => {
    if (input === 'q') {
      onQuit?.();
      exit();
    }
  });

  return <Layout state={state} loops={loops} />;
}

export function startTUI(state: OrchestratorState): void {
  render(<TUI initialState={state} />);
}

export { Layout } from './Layout.js';
export { Header } from './Header.js';
export { Column } from './Column.js';
