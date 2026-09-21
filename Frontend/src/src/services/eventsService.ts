/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RuntimeEvent, EventSeverity, EventType } from '../types';
import { INITIAL_RUNTIME_EVENTS } from './mockData';
import { apiClient } from './apiClient';

let eventsStore: RuntimeEvent[] = JSON.parse(JSON.stringify(INITIAL_RUNTIME_EVENTS));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export interface EventFilters {
  search?: string;
  severity?: EventSeverity | 'all';
  type?: EventType | 'all';
  resourceId?: string;
}

export const eventsService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  async getEvents(filters?: EventFilters): Promise<RuntimeEvent[]> {
    const res = await apiClient.request<RuntimeEvent[]>('/events', () => {
      let result = [...eventsStore];
      if (!filters) return result;

      if (filters.search && filters.search.trim()) {
        const query = filters.search.toLowerCase();
        result = result.filter(
          (e) =>
            e.id.toLowerCase().includes(query) ||
            e.description.toLowerCase().includes(query) ||
            e.resource.toLowerCase().includes(query) ||
            e.type.toLowerCase().includes(query)
        );
      }

      if (filters.severity && filters.severity !== 'all') {
        result = result.filter((e) => e.severity === filters.severity);
      }

      if (filters.type && filters.type !== 'all') {
        result = result.filter((e) => e.type === filters.type);
      }

      if (filters.resourceId) {
        result = result.filter((e) => e.resourceId === filters.resourceId || e.resource === filters.resourceId);
      }

      return result;
    });
    return res.data;
  },

  async getById(id: string): Promise<RuntimeEvent | undefined> {
    const res = await apiClient.request<RuntimeEvent | undefined>(`/events/${id}`, () =>
      eventsStore.find((e) => e.id === id)
    );
    return res.data;
  },

  async acknowledgeEvent(id: string): Promise<RuntimeEvent> {
    const evt = eventsStore.find((e) => e.id === id);
    if (!evt) throw new Error(`Event ${id} not found`);
    evt.acknowledged = true;
    notify();
    return evt;
  },

  async addEvent(newEvent: Omit<RuntimeEvent, 'id' | 'timestamp' | 'relativeTime'>): Promise<RuntimeEvent> {
    const fullEvent: RuntimeEvent = {
      ...newEvent,
      id: `evt-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      relativeTime: 'Just now',
    };
    eventsStore.unshift(fullEvent);
    notify();
    return fullEvent;
  },
};
