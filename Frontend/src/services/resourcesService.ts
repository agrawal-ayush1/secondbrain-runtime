/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Resource, ResourceCategory, ResourceStatus } from '../types';
import { INITIAL_RESOURCES } from './mockData';
import { apiClient } from './apiClient';
import { simulationService } from './simulationService';

let resourcesStore: Resource[] = JSON.parse(JSON.stringify(INITIAL_RESOURCES));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export const resourcesService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    const unsubGlobal = apiClient.subscribeRefresh(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
      unsubGlobal();
    };
  },

  async getAll(): Promise<Resource[]> {
    const res = await apiClient.request<Resource[]>('/api/resources', () => [...resourcesStore]);
    return res.data;
  },

  async getById(id: string): Promise<Resource | undefined> {
    const res = await apiClient.request<Resource | undefined>(`/api/resources/${id}`, () =>
      resourcesStore.find((r) => r.id === id)
    );
    return res.data;
  },

  async getByCategory(category: ResourceCategory): Promise<Resource[]> {
    const all = await this.getAll();
    if (category === 'all') return all;
    return all.filter((r) => r.category === category);
  },

  async updateStatus(id: string, status: ResourceStatus): Promise<Resource> {
    if (!apiClient.isUsingMock()) {
      if (status === 'degraded' || status === 'offline') {
        await simulationService.step('rate_limit', id);
      } else {
        await simulationService.step('run_step');
      }
      const res = await this.getById(id);
      return res || ({ id, status } as any);
    }

    const resource = resourcesStore.find((r) => r.id === id);
    if (!resource) throw new Error(`Resource ${id} not found`);
    resource.status = status;
    resource.lastUpdated = 'Just now';
    notify();
    return resource;
  },

  async restartResource(id: string): Promise<Resource> {
    if (!apiClient.isUsingMock()) {
      await simulationService.step('run_step', id);
      apiClient.showToast(`Resource ${id} rolling restart requested on backend controller`, 'info');
      const res = await this.getById(id);
      return res || ({ id, status: 'healthy' } as any);
    }

    const resource = resourcesStore.find((r) => r.id === id);
    if (!resource) throw new Error(`Resource ${id} not found`);
    resource.status = 'running';
    resource.uptime = '0m 10s';
    resource.lastUpdated = 'Just now';
    notify();
    return resource;
  },

  async getSummaryStats() {
    const all = await this.getAll();
    return {
      total: all.length,
      healthy: all.filter((r) => r.status === 'healthy' || r.status === 'running').length,
      running: all.filter((r) => r.status === 'healthy' || r.status === 'running').length,
      degraded: all.filter((r) => r.status === 'degraded').length,
      offline: all.filter((r) => r.status === 'offline').length,
    };
  },
};
