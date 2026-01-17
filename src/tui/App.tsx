import React, { useState, useEffect, useCallback } from 'react';
import { useApp, useInput } from 'ink';
import type { OrchestratorState, LoopState } from '../types/index.js';
import { runOrchestrator } from '../orchestrator/index.js';
import { Layout } from './Layout.js';

interface AppProps {
  initialState: OrchestratorState;
}

export function App({ initialState }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState(initialState);
  const [loops, setLoops] = useState<LoopState[]>(initialState.activeLoops);
  const [running, setRunning] = useState(true);

  useInput((input) => {
    if (input === 'q') {
      setRunning(false);
      exit();
    }
    if (input === 'p') {
      setRunning(prev => !prev);
    }
  });

  const runPhase = useCallback(async () => {
    if (!running || state.phase === 'complete') return;

    const newState = await runOrchestrator(state, {
      onLoopOutput: (loopId, text) => {
        setLoops(prev => prev.map(l =>
          l.loopId === loopId
            ? { ...l, output: [...l.output.slice(-99), text] }
            : l
        ));
      },
    });

    setState(newState);
    setLoops(newState.activeLoops);
  }, [state, running]);

  useEffect(() => {
    if (running && state.phase !== 'complete') {
      runPhase();
    }
  }, [running, state.phase, runPhase]);

  return <Layout state={state} loops={loops} />;
}
