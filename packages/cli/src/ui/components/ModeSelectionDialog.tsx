/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

export type BmadMode = 'normal' | 'bmad-expert';

export interface ModeOption {
  id: BmadMode;
  label: string;
  description: string;
  icon: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'normal',
    label: 'Normal Mode',
    description: 'Standard Qwen Code experience',
    icon: '📝',
  },
  {
    id: 'bmad-expert',
    label: 'BMAD Expert Mode',
    description: 'Full autonomous project development with BMAD Method',
    icon: '🎭',
  },
];

export interface ModeSelectionDialogProps {
  currentMode: BmadMode;
  onSelect: (mode: BmadMode) => void;
  onCancel: () => void;
}

export const ModeSelectionDialog: React.FC<ModeSelectionDialogProps> = ({
  currentMode,
  onSelect,
  onCancel,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<BmadMode>> = MODE_OPTIONS.map(
    (mode) => {
      const currentIndicator = mode.id === currentMode ? ' (current)' : '';
      return {
        label: `${mode.icon} ${mode.label}${currentIndicator} - ${mode.description}`,
        value: mode.id,
      };
    },
  );

  const initialIndex = Math.max(
    0,
    MODE_OPTIONS.findIndex((mode) => mode.id === currentMode),
  );

  const handleSelect = (modeId: BmadMode) => {
    onSelect(modeId);
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Select Mode</Text>
        <Text>Choose your Qwen Code mode:</Text>
      </Box>

      <Box marginBottom={1}>
        <RadioButtonSelect
          items={options}
          initialIndex={initialIndex}
          onSelect={handleSelect}
          isFocused
        />
      </Box>

      <Box>
        <Text color={Colors.Gray}>Press Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
};