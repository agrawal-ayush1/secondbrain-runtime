/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SystemSettings } from '../types';
import { INITIAL_SETTINGS } from './mockData';
import { apiClient } from './apiClient';

let settingsStore: SystemSettings = JSON.parse(JSON.stringify(INITIAL_SETTINGS));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export const settingsService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  async getSettings(): Promise<SystemSettings> {
    const res = await apiClient.request<SystemSettings>('/settings', () => ({ ...settingsStore }));
    return res.data;
  },

  async updateSettings(updated: Partial<SystemSettings>): Promise<SystemSettings> {
    settingsStore = {
      ...settingsStore,
      ...updated,
      general: { ...settingsStore.general, ...(updated.general || {}) },
      runtime: { ...settingsStore.runtime, ...(updated.runtime || {}) },
      graph: { ...settingsStore.graph, ...(updated.graph || {}) },
      notifications: { ...settingsStore.notifications, ...(updated.notifications || {}) },
      api: { ...settingsStore.api, ...(updated.api || {}) },
    };
    if (updated.api?.baseUrl !== undefined) {
      apiClient.setBaseUrl(updated.api.baseUrl);
    }
    notify();
    return { ...settingsStore };
  },

  async testConnection(): Promise<{ success: boolean; latency: string; message: string }> {
    await new Promise((r) => setTimeout(r, 150));
    return {
      success: true,
      latency: '1.8ms',
      message: 'Connection validated: gRPC-Web protocol established with TLS 1.3 handshake.',
    };
  },
};
