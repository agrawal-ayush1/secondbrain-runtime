/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ApiResponse<T> {
  data: T;
  source: 'remote' | 'mock';
  timestamp: string;
}

type Listener = () => void;
type ToastCallback = (message: string, type: 'info' | 'success' | 'warn' | 'error') => void;

class ApiClient {
  private baseUrl: string;
  private isMockMode: boolean;
  private listeners: Listener[] = [];
  private toastCallbacks: ToastCallback[] = [];

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.isMockMode = !this.baseUrl || this.baseUrl.trim() === '';
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
    if (this.isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const data = await mockFallback();
      return {
        data,
        source: 'mock',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        data,
        source: 'remote',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`Remote API unreachable at ${this.baseUrl}${endpoint}, using mock fallback`, err);
      const data = await mockFallback();
      return {
        data,
        source: 'mock',
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async post<T>(endpoint: string, body: any, mockFallback: () => T | Promise<T>): Promise<ApiResponse<T>> {
    if (this.isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const data = await mockFallback();
      this.notifyRefresh();
      return {
        data,
        source: 'mock',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
      console.error(`Error POSTing to ${this.baseUrl}${endpoint}:`, err);
      this.showToast(`Backend Action Error: ${err.message || 'Network unreachable'}`, 'error');
      throw err;
    }
  }
}

export const apiClient = new ApiClient();
