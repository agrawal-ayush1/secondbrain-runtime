/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Workload, SchedulerDecision } from '../types';
import { INITIAL_WORKLOADS, INITIAL_SCHEDULER_DECISIONS } from './mockData';
import { apiClient } from './apiClient';
import { simulationService } from './simulationService';

let workloadsStore: Workload[] = JSON.parse(JSON.stringify(INITIAL_WORKLOADS));
let decisionsStore: SchedulerDecision[] = JSON.parse(JSON.stringify(INITIAL_SCHEDULER_DECISIONS));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export const schedulerService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    const unsubGlobal = apiClient.subscribeRefresh(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
      unsubGlobal();
    };
  },

  async getWorkloads(): Promise<Workload[]> {
    const res = await apiClient.request<Workload[]>('/api/scheduler/workloads', () => [...workloadsStore]);
    return res.data;
  },

  async getWorkloadById(id: string): Promise<Workload | undefined> {
    const res = await apiClient.request<Workload | undefined>(`/api/scheduler/workloads/${id}`, () =>
      workloadsStore.find((w) => w.id === id)
    );
    return res.data;
  },

  async getDecisions(): Promise<SchedulerDecision[]> {
    const res = await apiClient.request<SchedulerDecision[]>('/api/scheduler/decisions', () => [
      ...decisionsStore,
    ]);
    return res.data;
  },

  async triggerReschedule(workloadId: string): Promise<Workload> {
    if (!apiClient.isUsingMock()) {
      // Execute real simulation step on backend
      await simulationService.step('run_step', undefined, workloadId);
      const workloads = await this.getWorkloads();
      const found = workloads.find((w) => w.id === workloadId) || workloads[0];
      return found;
    }

    const workload = workloadsStore.find((w) => w.id === workloadId);
    if (!workload) throw new Error(`Workload ${workloadId} not found`);

    workload.status = 'running';
    workload.started = 'Just now';
    workload.progress = 10;
    workload.eventTrace.unshift({
      time: new Date().toLocaleTimeString(),
      message: 'Manual reschedule triggered; re-evaluating affinity matrices & load targets',
      type: 'info',
    });

    decisionsStore.unshift({
      id: `dec-${Date.now()}`,
      title: `Manual Reschedule: ${workload.name}`,
      workloadId: workload.id,
      targetNode: workload.targetResourceName,
      description: 'Triggered immediate scheduler pass. Optimal candidate selected with lowest p99 latency.',
      timeAgo: 'Just now',
      type: 'worker',
    });

    notify();
    return workload;
  },
};
