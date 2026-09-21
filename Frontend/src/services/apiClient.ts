/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface ApiResponse<T> {
  data: T;
  source: 'remote' | 'mock';
  timestamp: string;
}

class ApiClient {
  private baseUrl: string;
  private isMockMode: boolean;

  constructor() {
    this.baseUrl = API_BASE_URL;
    // If no backend URL is set, we operate in high-fidelity mock mode.
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

  public async request<T>(endpoint: string, mockFallback: () => T | Promise<T>): Promise<ApiResponse<T>> {
    if (this.isMockMode) {
      // Simulate realistic network round-trip delay (40ms - 90ms)
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
}

export const apiClient = new ApiClient();
