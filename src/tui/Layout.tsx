import { Box, Text } from 'ink';
import type { LoopState, OrchestratorState } from '../types/index.js';
import { Column } from './Column.js';
import { Header } from './Header.js';
import { StatusArea } from './StatusArea.js';

interface LayoutProps {
  state: OrchestratorState;
  loops: LoopState[];
  isLoading: boolean;
  statusMessage: string;
  phaseOutput: string[];
}

export function Layout({ state, loops, isLoading, statusMessage, phaseOutput }: LayoutProps) {
  const activeLoops = loops.filter((l) => l.status === 'running' || l.status === 'pending');
  // Minimize status area during build phase when loops are active
  const minimizeStatus = state.phase === 'build' && activeLoops.length > 0;

  return (
    <Box flexDirection="column">
      <Header state={state} activeLoopCount={activeLoops.length} />
      <StatusArea
        phase={state.phase}
        isLoading={isLoading}
        statusMessage={statusMessage}
        output={phaseOutput}
        minimized={minimizeStatus}
      />

      {/* Loop columns */}
      <Box>
        {loops.slice(0, state.maxLoops).map((loop) => {
          const task = state.tasks.find((t) => t.id === loop.taskIds[0]);
          return <Column key={loop.loopId} loop={loop} taskTitle={task?.title || 'Unknown'} />;
        })}

        {/* Empty columns if fewer loops than max */}
        {Array.from({ length: Math.max(0, state.maxLoops - loops.length) }).map((_, i) => (
          <Box key={`empty-${i}`} borderStyle="single" width="33%" minHeight={15}>
            <Box paddingX={1}>
              <Text dimColor>No active loop</Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>[q]uit [p]ause [r]eview now [1-4] focus</Text>
      </Box>
    </Box>
  );
}
