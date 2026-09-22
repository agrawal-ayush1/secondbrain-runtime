/**
 * Local Offline Runtime Controller for SecondBrain Runtime.
 * Performs deterministic local runtime orchestration using the cached IndexedDB snapshot
 * when the backend API is unreachable or simulated offline mode is active.
 */

import { offlineStore, RuntimeSnapshotData, PendingOperation, OfflineEvent } from './offlineStore';

export class OfflineRuntimeController {
  private resources: any[] = [];
  private serviceGraph: any = { nodes: [], edges: [], alternatives: [] };
  private workflows: any[] = [];
  private reservations: any[] = [];
  private events: any[] = [];
  private eventSequence: number = 0;
  private simStepCount: number = 0;
  private simTimeMinutes: number = 600; // 10:00

  async initFromSnapshot(): Promise<boolean> {
    const snapshot = await offlineStore.getLatestSnapshot();
    if (!snapshot) return false;

    this.resources = JSON.parse(JSON.stringify(snapshot.resources || []));
    this.serviceGraph = JSON.parse(JSON.stringify(snapshot.serviceGraph || { nodes: [], edges: [], alternatives: [] }));
    this.workflows = JSON.parse(JSON.stringify(snapshot.workflows || []));
    this.reservations = JSON.parse(JSON.stringify(snapshot.reservations || []));
    this.events = JSON.parse(JSON.stringify(snapshot.events || []));
    this.simStepCount = snapshot.runtimeVersion || 0;
    return true;
  }

  private getSimTimeStr(): string {
    const hours = Math.floor((this.simTimeMinutes / 60) % 24);
    const minutes = Math.floor(this.simTimeMinutes % 60);
    const hStr = hours < 10 ? `0${hours}` : `${hours}`;
    const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hStr}:${mStr}`;
  }

  async recordOfflineEvent(
    type: string,
    message: string,
    resourceId: string = 'system',
    workflowId?: string
  ): Promise<OfflineEvent> {
    this.eventSequence += 1;
    const timeStr = this.getSimTimeStr();
    const eventId = `offline-evt-${Date.now()}-${this.eventSequence}`;
    const rawMsg = `[${timeStr}] [OFFLINE] ${message}`;

    const offlineEvt: OfflineEvent = {
      id: eventId,
      sequence: this.eventSequence,
      timestamp: timeStr,
      type,
      workflowId,
      resourceId,
      raw: rawMsg,
      source: 'offline-runtime',
    };

    // Add to local state & IndexedDB
    const dtoEvent = {
      id: eventId,
      raw: rawMsg,
      title: `${type}: ${message}`,
      category: 'OFFLINE RUNTIME',
      severity: type.includes('FAILURE') || type.includes('CONSTRAINED') ? 'WARNING' : 'INFO',
      time: timeStr,
      source: 'OFFLINE RUNTIME',
      resource_id: resourceId,
    };

    this.events.unshift(dtoEvent);
    await offlineStore.addOfflineEvent(offlineEvt);
    return offlineEvt;
  }

  async submitWorkflow(wfData: { id?: string; name: string; priority?: number; task_sequence?: string[] }): Promise<any> {
    const wfId = wfData.id || `W3`;
    const name = wfData.name || 'Deep Research Agent';
    const priority = wfData.priority || 9.0;
    const taskSeq = wfData.task_sequence || ['search', 'gemini-2.5-flash', 'postgres-db'];
    const firstTarget = taskSeq[0] || 'search';

    const existingIndex = this.workflows.findIndex((w) => w.id === wfId);
    const wfObj = {
      id: wfId,
      name,
      currentTask: firstTarget,
      status: 'RUNNING',
      priority,
      waitingTime: '0.0m',
      predictions: [
        {
          id: `pred-${wfId}-1`,
          workflow_id: wfId,
          resource_id: 'gemini-2.5-flash',
          confidence: 0.95,
          reason: 'Sequential model chain prediction (Offline)',
        },
      ],
      metadata: { task_sequence: taskSeq },
    };

    if (existingIndex >= 0) {
      this.workflows[existingIndex] = wfObj;
    } else {
      this.workflows.push(wfObj);
    }

    const opId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await offlineStore.addPendingOperation({
      operationId: opId,
      type: 'CREATE_WORKFLOW',
      timestamp: this.getSimTimeStr(),
      payload: { id: wfId, name, priority, task_sequence: taskSeq },
    });

    await this.recordOfflineEvent(
      'WORKFLOW_CREATED',
      `Workflow ${wfId} (${name}) created and assigned to ${firstTarget}`,
      firstTarget,
      wfId
    );

    await this.saveLocalSnapshot();
    return wfObj;
  }

  async reserveResource(workflowId: string, resourceId: string, dimensions: any = { rpm: 1.0 }): Promise<any> {
    const res = this.resources.find((r) => r.id === resourceId);
    if (res) {
      res.usageCount = (res.usageCount || 0) + 1;
      res.health = 'HEALTHY';
    }

    const resId = `res-off-${workflowId}-${resourceId}-${Date.now()}`;
    const reservationObj = {
      id: resId,
      workflow_id: workflowId,
      resource_id: resourceId,
      dimensions,
      status: 'ACTIVE',
    };

    this.reservations.push(reservationObj);

    const opId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await offlineStore.addPendingOperation({
      operationId: opId,
      type: 'RESERVE_RESOURCE',
      timestamp: this.getSimTimeStr(),
      payload: { workflow_id: workflowId, resource_id: resourceId, dimensions, soft: false },
    });

    await this.recordOfflineEvent(
      'RESERVATION_CREATED',
      `Resource ${resourceId} reserved for workflow ${workflowId}`,
      resourceId,
      workflowId
    );

    await this.saveLocalSnapshot();
    return reservationObj;
  }

  async stepOfflineSimulation(): Promise<any> {
    this.simStepCount += 1;
    this.simTimeMinutes += 1;
    const timeStr = this.getSimTimeStr();

    let stepMsg = '';

    if (this.simStepCount === 1) {
      await this.submitWorkflow({
        id: 'W3',
        name: 'Deep Research Agent',
        priority: 9.0,
        task_sequence: ['search', 'gemini-2.5-flash', 'postgres-db'],
      });
      stepMsg = 'W3 (Deep Research Agent) submitted to Local Offline Runtime.';
    } else if (this.simStepCount === 2) {
      const w3 = this.workflows.find((w) => w.id === 'W3');
      if (w3) {
        w3.currentTask = 'gemini-2.5-flash';
      }
      await this.reserveResource('W3', 'gemini-2.5-flash', { rpm: 1.0 });
      stepMsg = 'W3 evaluated next dependency: gemini-2.5-flash reserved locally.';
    } else if (this.simStepCount === 3) {
      // Contention / Failure on gemini-2.5-flash
      const flash = this.resources.find((r) => r.id === 'gemini-2.5-flash');
      if (flash) {
        flash.health = 'CONSTRAINED';
        flash.status = 'degraded';
        flash.errorRate = '15.00%';
      }

      await this.recordOfflineEvent(
        'RESOURCE_CONSTRAINED',
        'Contention detected: gemini-2.5-flash RATE_LIMITED offline!',
        'gemini-2.5-flash',
        'W3'
      );

      // Identify fallback gemini-2.5-flash-lite
      const fallbackId = 'gemini-2.5-flash-lite';
      const w3 = this.workflows.find((w) => w.id === 'W3');
      if (w3) {
        w3.currentTask = fallbackId;
      }

      await this.reserveResource('W3', fallbackId, { rpm: 1.0 });

      await this.recordOfflineEvent(
        'FALLBACK_SELECTED',
        `Dynamic local fallback selected: gemini-2.5-flash → ${fallbackId} for W3`,
        fallbackId,
        'W3'
      );

      const opId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await offlineStore.addPendingOperation({
        operationId: opId,
        type: 'REROUTE_WORKFLOW',
        timestamp: timeStr,
        payload: { workflow_id: 'W3', resource_id: fallbackId, source_resource_id: 'gemini-2.5-flash' },
      });

      stepMsg = 'Gemini 2.5 Flash RATE_LIMITED! Dynamic local fallback to Flash Lite executed.';
    } else if (this.simStepCount === 4) {
      const w3 = this.workflows.find((w) => w.id === 'W3');
      if (w3) {
        w3.currentTask = 'postgres-db';
      }
      await this.reserveResource('W3', 'postgres-db', { connections: 1.0 });
      stepMsg = 'W3 advanced to PostgreSQL Database downstream service.';
    } else {
      stepMsg = `Local offline simulation step tick at ${timeStr}`;
      await this.recordOfflineEvent('ADVANCE_RUNTIME', stepMsg, 'system');
      const opId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await offlineStore.addPendingOperation({
        operationId: opId,
        type: 'ADVANCE_RUNTIME',
        timestamp: timeStr,
        payload: { step_count: 1 },
      });
    }

    await this.saveLocalSnapshot();
    return {
      status: 'success',
      step: this.simStepCount,
      sim_time: timeStr,
      message: stepMsg,
    };
  }

  async saveLocalSnapshot(): Promise<void> {
    await offlineStore.saveSnapshot({
      timestamp: this.getSimTimeStr(),
      runtimeVersion: this.simStepCount,
      resources: this.resources,
      serviceGraph: this.serviceGraph,
      workflows: this.workflows,
      reservations: this.reservations,
      events: this.events,
    });
  }

  getState() {
    return {
      resources: this.resources,
      serviceGraph: this.serviceGraph,
      workflows: this.workflows,
      reservations: this.reservations,
      events: this.events,
      stepCount: this.simStepCount,
      simTime: this.getSimTimeStr(),
    };
  }
}

export const offlineController = new OfflineRuntimeController();
