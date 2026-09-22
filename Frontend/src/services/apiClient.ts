/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { offlineStore } from './offlineStore';
import { offlineController } from './offlineRuntimeController';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ApiResponse<T> {
  data: T;
  source: 'remote' | 'mock' | 'offline';
  timestamp: string;
}

export type ConnectivityMode = 'ONLINE' | 'OFFLINE RUNTIME' | 'SYNCING' | 'SYNCED';

type Listener = () => void;
type ToastCallback = (message: string, type: 'info' | 'success' | 'warn' | 'error') => void;

class ApiClient {
  private baseUrl: string;
  private isMockMode: boolean;
  private listeners: Listener[] = [];
  private toastCallbacks: ToastCallback[] = [];

  // Offline resilience state
  private mode: ConnectivityMode = 'ONLINE';
  private isSimulatedOffline: boolean = false;
  private offlineStartTimestamp: number | null = null;
  private offlineDurationSeconds: number = 0;
  private durationInterval: any = null;
  private healthCheckInterval: any = null;
  private pendingOpsCount: number = 0;
  private offlineEventsCount: number = 0;
  private lastSyncTime: string = 'Never';

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.isMockMode = !this.baseUrl || this.baseUrl.trim() === '';
    this.initConnectivityListeners();
  }

  private initConnectivityListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isSimulatedOffline && this.mode === 'OFFLINE RUNTIME') {
          this.attemptReconnectionAndSync();
        }
      });
    }

    // Start background health monitor to detect backend recovery
    this.healthCheckInterval = setInterval(() => {
      if (this.mode === 'OFFLINE RUNTIME' && !this.isSimulatedOffline) {
        this.checkBackendReachability();
      }
    }, 4000);
  }

  public getBaseUrl(): string {
    return this.baseUrl || '(Local Mock Engine)';
  }

  public isUsingMock(): boolean {
    return this.isMockMode;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
    this.isMockMode = !url || url.trim() === '';
  }

  // --- Offline Mode Controls & Getters ---
  public getMode(): ConnectivityMode {
    return this.mode;
  }

  public isSimulatedOfflineMode(): boolean {
    return this.isSimulatedOffline;
  }

  public getOfflineDurationSeconds(): number {
    return this.offlineDurationSeconds;
  }

  public getPendingOpsCount(): number {
    return this.pendingOpsCount;
  }

  public getOfflineEventsCount(): number {
    return this.offlineEventsCount;
  }

  public getLastSyncTime(): string {
    return this.lastSyncTime;
  }

  public async setSimulatedOffline(enable: boolean) {
    if (this.isSimulatedOffline === enable) return;
    this.isSimulatedOffline = enable;

    if (enable) {
      // 1. Take a fresh snapshot before going offline
      await this.captureAndSaveSnapshot();
      await offlineController.initFromSnapshot();

      this.mode = 'OFFLINE RUNTIME';
      this.offlineStartTimestamp = Date.now();
      this.startDurationCounter();
      await offlineController.recordOfflineEvent(
        'OFFLINE_MODE_ENTERED',
        'Simulated offline mode enabled by developer'
      );
      this.showToast('OFFLINE RUNTIME: Local orchestration active', 'warn');
    } else {
      // Exiting simulated offline mode -> attempt auto-sync
      this.showToast('Exiting simulated offline mode: Reconnecting to backend...', 'info');
      await this.attemptReconnectionAndSync();
    }
    this.updateCounts();
    this.notifyRefresh();
  }

  private startDurationCounter() {
    this.stopDurationCounter();
    this.offlineDurationSeconds = 0;
    this.durationInterval = setInterval(() => {
      if (this.offlineStartTimestamp) {
        this.offlineDurationSeconds = Math.floor((Date.now() - this.offlineStartTimestamp) / 1000);
        this.updateCounts();
        this.notifyRefresh();
      }
    }, 1000);
  }

  private stopDurationCounter() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  private async updateCounts() {
    try {
      const ops = await offlineStore.getPendingOperations();
      this.pendingOpsCount = ops.length;
      const evts = await offlineStore.getOfflineEvents();
      this.offlineEventsCount = evts.length;
    } catch (e) {
      // ignore
    }
  }

  private async enterOfflineRuntimeMode() {
    if (this.mode === 'OFFLINE RUNTIME') return;
    this.mode = 'OFFLINE RUNTIME';
    this.offlineStartTimestamp = Date.now();
    this.startDurationCounter();

    await offlineController.initFromSnapshot();
    await offlineController.recordOfflineEvent(
      'API_UNREACHABLE',
      'Backend connectivity lost: Local orchestration engine activated'
    );
    this.showToast('OFFLINE RUNTIME: Local orchestration active', 'warn');
    this.notifyRefresh();
  }

  private async checkBackendReachability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        await this.attemptReconnectionAndSync();
      }
    } catch (e) {
      // Still unreachable
    }
  }

  public async attemptReconnectionAndSync() {
    if (this.isSimulatedOffline) return;
    if (this.mode === 'SYNCING') return;

    this.mode = 'SYNCING';
    this.notifyRefresh();
    this.showToast('SYNCING: Synchronizing pending offline operations...', 'info');

    try {
      const pendingOps = await offlineStore.getPendingOperations();
      const offlineEvts = await offlineStore.getOfflineEvents();

      // Send batch sync request
      const syncBody = {
        clientId: 'browser-client',
        baseVersion: 0,
        operations: pendingOps.map((op) => ({
          operationId: op.operationId,
          type: op.type,
          timestamp: op.timestamp,
          payload: op.payload,
        })),
      };

      const response = await fetch(`${this.baseUrl}/api/v1/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(syncBody),
      });

      if (!response.ok) {
        throw new Error(`Sync failed with HTTP ${response.status}`);
      }

      const syncRes = await response.json();
      const syncedIds: string[] = syncRes.syncedOperations || [];

      // Mark operations as completed
      for (const opId of syncedIds) {
        await offlineStore.markOperationCompleted(opId);
      }
      await offlineStore.clearCompletedOperations();

      // Save authoritative snapshot returned by backend
      if (syncRes.snapshot) {
        await offlineStore.saveSnapshot({
          timestamp: syncRes.snapshot.sim_time || new Date().toISOString(),
          runtimeVersion: syncRes.snapshot.runtimeVersion || 0,
          resources: syncRes.snapshot.resources || [],
          serviceGraph: syncRes.snapshot.service_graph || { nodes: [], edges: [], alternatives: [] },
          workflows: syncRes.snapshot.workflows || [],
          reservations: syncRes.snapshot.reservations || [],
          events: syncRes.snapshot.events || [],
        });
      }

      this.mode = 'SYNCED';
      this.lastSyncTime = new Date().toLocaleTimeString();
      this.stopDurationCounter();
      this.showToast(`SYNCED: Reconciled ${syncedIds.length} offline operations with backend.`, 'success');

      setTimeout(() => {
        if (this.mode === 'SYNCED') {
          this.mode = 'ONLINE';
          this.notifyRefresh();
        }
      }, 3000);
    } catch (err: any) {
      console.warn('Sync attempt failed:', err);
      this.mode = 'OFFLINE RUNTIME';
      this.showToast(`Sync Failed: ${err.message || 'Backend temporarily unavailable'}`, 'error');
    }
    this.updateCounts();
    this.notifyRefresh();
  }

  private async captureAndSaveSnapshot() {
    try {
      const [resData, graphData, wfData, eventsData] = await Promise.all([
        fetch(`${this.baseUrl}/api/v1/resources`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${this.baseUrl}/api/v1/service-graph`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${this.baseUrl}/api/v1/workflows`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${this.baseUrl}/api/v1/events`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);

      if (resData.length > 0) {
        await offlineStore.saveSnapshot({
          timestamp: new Date().toLocaleTimeString(),
          runtimeVersion: 1,
          resources: resData,
          serviceGraph: graphData || { nodes: [], edges: [], alternatives: [] },
          workflows: wfData,
          reservations: [],
          events: eventsData,
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  public subscribeRefresh(callback: Listener) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public notifyRefresh() {
    this.listeners.forEach((l) => l());
  }

  public onToast(callback: ToastCallback) {
    this.toastCallbacks.push(callback);
    return () => {
      this.toastCallbacks = this.toastCallbacks.filter((cb) => cb !== callback);
    };
  }

  public showToast(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    this.toastCallbacks.forEach((cb) => cb(message, type));
  }

  public async request<T>(endpoint: string, mockFallback: () => T | Promise<T>): Promise<ApiResponse<T>> {
    // If simulated offline or active offline runtime, serve locally
    if (this.isSimulatedOffline || this.mode === 'OFFLINE RUNTIME') {
      const offlineData = await this.getOfflineDataFallback<T>(endpoint, mockFallback);
      return {
        data: offlineData,
        source: 'offline',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Periodically store snapshot in background
      if (endpoint.includes('resources') || endpoint.includes('service-graph')) {
        this.captureAndSaveSnapshot();
      }

      return {
        data,
        source: 'remote',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`Remote API unreachable at ${this.baseUrl}${endpoint}, entering OFFLINE RUNTIME mode`, err);
      await this.enterOfflineRuntimeMode();

      const offlineData = await this.getOfflineDataFallback<T>(endpoint, mockFallback);
      return {
        data: offlineData,
        source: 'offline',
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async post<T>(endpoint: string, body: any, mockFallback: () => T | Promise<T>): Promise<ApiResponse<T>> {
    if (this.isSimulatedOffline || this.mode === 'OFFLINE RUNTIME') {
      const offlineResult = await this.handleOfflinePost<T>(endpoint, body, mockFallback);
      this.notifyRefresh();
      this.updateCounts();
      return {
        data: offlineResult,
        source: 'offline',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      this.notifyRefresh();
      return {
        data,
        source: 'remote',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.warn(`Error POSTing to ${this.baseUrl}${endpoint}, falling back to offline runtime:`, err);
      await this.enterOfflineRuntimeMode();

      const offlineResult = await this.handleOfflinePost<T>(endpoint, body, mockFallback);
      this.notifyRefresh();
      this.updateCounts();
      return {
        data: offlineResult,
        source: 'offline',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async getOfflineDataFallback<T>(endpoint: string, mockFallback: () => T | Promise<T>): Promise<T> {
    const offlineState = offlineController.getState();
    if (endpoint.includes('/resources')) {
      return (offlineState.resources.length > 0 ? offlineState.resources : await mockFallback()) as T;
    }
    if (endpoint.includes('/service-graph') || endpoint.includes('/graph')) {
      return (offlineState.serviceGraph?.nodes ? offlineState.serviceGraph : await mockFallback()) as T;
    }
    if (endpoint.includes('/workflows') || endpoint.includes('/scheduler')) {
      return (offlineState.workflows.length > 0 ? offlineState.workflows : await mockFallback()) as T;
    }
    if (endpoint.includes('/events')) {
      return (offlineState.events.length > 0 ? offlineState.events : await mockFallback()) as T;
    }
    return await mockFallback();
  }

  private async handleOfflinePost<T>(endpoint: string, body: any, mockFallback: () => T | Promise<T>): Promise<T> {
    if (endpoint.includes('/simulate/step')) {
      const stepRes = await offlineController.stepOfflineSimulation();
      return stepRes as T;
    }
    if (endpoint.includes('/workflows')) {
      const wfRes = await offlineController.submitWorkflow(body);
      return {
        success: true,
        workflow: wfRes,
        message: `Workflow ${wfRes.id} (${wfRes.name}) submitted locally (OFFLINE RUNTIME)`,
      } as T;
    }
    if (endpoint.includes('/reservations')) {
      const resObj = await offlineController.reserveResource(body.workflow_id, body.resource_id, body.dimensions);
      return {
        success: true,
        reservation: resObj,
        message: `Reservation ${resObj.id} created locally (OFFLINE RUNTIME)`,
      } as T;
    }
    if (endpoint.includes('/simulate/reset')) {
      const snap = await offlineStore.getLatestSnapshot();
      await offlineController.initFromSnapshot();
      return {
        status: 'reset_complete',
        message: 'Local offline runtime reset to latest cached snapshot.',
        sim_time: '10:00',
      } as T;
    }
    return await mockFallback();
  }
}

export const apiClient = new ApiClient();
