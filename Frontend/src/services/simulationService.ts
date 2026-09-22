/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { apiClient } from './apiClient';

export interface SimulationStepRequest {
  action?: 'run_step' | 'rate_limit' | 'quota_exhausted' | 'live';
  resource_id?: string;
  workflow_id?: string;
}

export interface GenericTask {
  name: string;
  resource: string;
}

export interface WorkflowCreateRequest {
  id?: string;
  workflow_id?: string;
  name: string;
  priority?: number;
  tasks?: GenericTask[];
  task_sequence?: string[];
}

export const simulationService = {
  async step(action: 'run_step' | 'rate_limit' | 'quota_exhausted' | 'live' = 'run_step', resourceId?: string, workflowId?: string) {
    const payload: SimulationStepRequest = {
      action,
      resource_id: resourceId || 'gemini-2.5-flash',
      workflow_id: workflowId || 'W1',
    };

    const res = await apiClient.post<{ status: string; sim_time: string; action: string; recent_events: any[]; message?: string }>(
      '/api/v1/simulate/step',
      payload,
      () => ({
        status: 'success',
        sim_time: '10:01',
        action,
        recent_events: [],
      })
    );

    apiClient.showToast(res.data.message || `Simulation Action '${action.toUpperCase()}' executed at ${res.data.sim_time}`, 'info');
    return res.data;
  },

  async stepLive() {
    const res = await apiClient.post<{ status: string; step: number; sim_time: string; message: string }>(
      '/api/v1/simulate/step',
      { action: 'live' },
      () => ({
        status: 'success',
        step: 1,
        sim_time: '10:01',
        message: 'Live simulation tick (mock)',
      })
    );

    if (res.data.message) {
      apiClient.showToast(res.data.message, 'info');
    }
    return res.data;
  },

  async reset() {
    const res = await apiClient.post<{ status: string; message: string; sim_time: string }>(
      '/api/v1/simulate/reset',
      {},
      () => ({
        status: 'reset_complete',
        message: 'Simulation reset to initial state.',
        sim_time: '10:00',
      })
    );

    apiClient.showToast('Runtime Controller reset to initial deterministic state.', 'success');
    return res.data;
  },

  async createWorkflow(workflowId: string, name: string, priority: number = 1.0, taskSequence: string[] = ['search', 'gemini-2.5-flash', 'postgres-db'], tasks?: GenericTask[]) {
    const payload: WorkflowCreateRequest = {
      id: workflowId,
      workflow_id: workflowId,
      name,
      priority,
      tasks,
      task_sequence: taskSequence,
    };

    const res = await apiClient.post<{ success: boolean; workflow: any; message: string }>(
      '/api/v1/workflows',
      payload,
      () => ({
        success: true,
        workflow: {
          id: workflowId,
          name,
          priority,
          current_task: taskSequence[0] || 'search',
        },
        message: `Workflow ${workflowId} submitted`,
      })
    );

    apiClient.showToast(res.data.message || `Workflow ${workflowId} submitted`, 'success');
    return res.data;
  },
};
