/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { SessionStatus } from '@qwen-code/qwen-code-core';

interface SessionIndicatorProps {
  /** Session breadcrumb path (e.g., ['root', 'analyzer', 'researcher']) */
  activePath: string[];

  /** Current session status */
  status: SessionStatus;

  /** Callback when user wants to go back to parent (currently unused in UI) */
  onBack?: () => void;

  /** Optional: show keyboard shortcuts */
  showShortcuts?: boolean;
}

/**
 * Displays current session breadcrumb and status in the UI.
 * Shows user their position in the session hierarchy.
 */
export const SessionIndicator: React.FC<SessionIndicatorProps> = ({
  activePath,
  status,
  onBack: _onBack,
  showShortcuts = true,
}) => {
  const getStatusColor = (status: SessionStatus): string => {
    switch (status) {
      case 'active':
        return 'green';
      case 'paused':
        return 'yellow';
      case 'completed':
        return 'blue';
      case 'aborted':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusSymbol = (status: SessionStatus): string => {
    switch (status) {
      case 'active':
        return '●';
      case 'paused':
        return '⏸';
      case 'completed':
        return '✓';
      case 'aborted':
        return '✗';
      default:
        return '○';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          Session:{' '}
        </Text>
        <Text color={getStatusColor(status)}>{getStatusSymbol(status)} </Text>
        <Text>{activePath.join(' › ')}</Text>
        <Text dimColor> [{status}]</Text>
      </Box>

      {showShortcuts && activePath.length > 1 && (
        <Box marginLeft={2}>
          <Text dimColor>⌥← back to parent • /session ls • /session abort</Text>
        </Box>
      )}
    </Box>
  );
};
