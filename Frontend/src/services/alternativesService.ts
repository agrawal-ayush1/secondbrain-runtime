/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alternative, AlternativeStatus } from '../types';
import { INITIAL_ALTERNATIVES } from './mockData';
import { apiClient } from './apiClient';

let alternativesStore: Alternative[] = JSON.parse(JSON.stringify(INITIAL_ALTERNATIVES));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export const alternativesService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  async getAll(): Promise<Alternative[]> {
    const res = await apiClient.request<Alternative[]>('/alternatives', () => [...alternativesStore]);
    return res.data;
  },

  async getById(id: string): Promise<Alternative | undefined> {
    const res = await apiClient.request<Alternative | undefined>(`/alternatives/${id}`, () =>
      alternativesStore.find((a) => a.id === id)
    );
    return res.data;
  },

  async getByPrimaryResourceId(resourceId: string): Promise<Alternative[]> {
    const all = await this.getAll();
    return all.filter((a) => a.primaryResourceId === resourceId);
  },

  async promoteToActive(id: string, trafficPercent: number = 100): Promise<Alternative> {
    const alt = alternativesStore.find((a) => a.id === id);
    if (!alt) throw new Error(`Alternative ${id} not found`);
    alt.status = 'active_fallback';
    alt.trafficDiverted = trafficPercent;
    alt.trafficVolume = `${trafficPercent}% diverted (${trafficPercent === 100 ? '18,412 req/s' : '5,200 req/s'})`;
    alt.lastHealthCheck = 'Just now';
    notify();
    return alt;
  },

  async testFailover(id: string): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const alt = alternativesStore.find((a) => a.id === id);
    if (!alt) throw new Error(`Alternative ${id} not found`);
    // Simulated synthetic dry-run
    await new Promise((r) => setTimeout(r, 200));
    alt.lastHealthCheck = 'Just now';
    notify();
    return {
      success: true,
      latencyMs: 11.4,
      message: `Health probe passed for ${alt.fallbackEndpoint}. Switchover latency verified at < 100ms.`,
    };
  },

  async updateStatus(id: string, status: AlternativeStatus): Promise<Alternative> {
    const alt = alternativesStore.find((a) => a.id === id);
    if (!alt) throw new Error(`Alternative ${id} not found`);
    alt.status = status;
    if (status !== 'active_fallback') {
      alt.trafficDiverted = 0;
      alt.trafficVolume = '0 req/sec (Standby)';
    }
    notify();
    return alt;
  },
};
