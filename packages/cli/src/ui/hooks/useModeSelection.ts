/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { type HistoryItem, MessageType } from '../types.js';
import type { BmadMode } from '../components/ModeSelectionDialog.js';

interface UseModeSelectionReturn {
  isModeDialogOpen: boolean;
  openModeDialog: () => void;
  handleModeSelect: (mode: BmadMode) => void;
  closeModeDialog: () => void;
}

export const useModeSelection = (
  loadedSettings: LoadedSettings,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseModeSelectionReturn => {
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);

  const openModeDialog = useCallback(() => {
    setIsModeDialogOpen(true);
  }, []);

  const handleModeSelect = useCallback(
    (mode: BmadMode) => {
      try {
        // Save mode to settings (user scope by default)
        loadedSettings.setValue(SettingScope.User, 'bmadMode', mode);
        
        const modeLabel = mode === 'bmad-expert' ? 'BMAD Expert Mode' : 'Normal Mode';
        const modeInfo = mode === 'bmad-expert'
          ? 'BMAD Expert Mode activated with autonomous workflow management and specialized agents.'
          : 'Normal Mode activated with standard Qwen Code experience.';
        
        addItem(
          {
            type: MessageType.INFO,
            text: `✓ Switched to ${modeLabel}\n  ${modeInfo}`,
          },
          Date.now(),
        );
        
        setIsModeDialogOpen(false);
      } catch (error) {
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to change mode: ${error}`,
          },
          Date.now(),
        );
      }
    },
    [loadedSettings, addItem],
  );

  const closeModeDialog = useCallback(() => {
    setIsModeDialogOpen(false);
  }, []);

  return {
    isModeDialogOpen,
    openModeDialog,
    handleModeSelect,
    closeModeDialog,
  };
};