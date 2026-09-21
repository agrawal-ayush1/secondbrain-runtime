/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceGraph, GraphNode, GraphEdge } from '../types';
import { INITIAL_GRAPH_NODES, INITIAL_GRAPH_EDGES } from './mockData';
import { apiClient } from './apiClient';

let nodesStore: GraphNode[] = JSON.parse(JSON.stringify(INITIAL_GRAPH_NODES));
let edgesStore: GraphEdge[] = JSON.parse(JSON.stringify(INITIAL_GRAPH_EDGES));
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export const graphService = {
  subscribe(callback: () => void) {
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  async getGraph(): Promise<ServiceGraph> {
    const res = await apiClient.request<ServiceGraph>('/graph', () => {
      const activeNodes = nodesStore.filter((n) => !n.isStandby);
      const standbyNodes = nodesStore.filter((n) => n.isStandby);
      const healthy = nodesStore.filter((n) => n.status === 'healthy').length;
      const degraded = nodesStore.filter((n) => n.status === 'degraded').length;
      const offline = nodesStore.filter((n) => n.status === 'offline').length;

      return {
        nodes: [...nodesStore],
        edges: [...edgesStore],
        totalActive: activeNodes.length,
        totalStandby: standbyNodes.length,
        healthyCount: healthy,
        degradedCount: degraded,
        offlineCount: offline,
        activeWireFlows: edgesStore.filter((e) => e.type === 'in_band').length,
        alternativesConfigured: edgesStore.filter((e) => e.type === 'fallback').length,
      };
    });
    return res.data;
  },

  async getNodeById(nodeId: string): Promise<GraphNode | undefined> {
    const graph = await this.getGraph();
    return graph.nodes.find((n) => n.id === nodeId || n.resourceId === nodeId);
  },

  async updateNodePosition(nodeId: string, x: number, y: number) {
    const node = nodesStore.find((n) => n.id === nodeId);
    if (node) {
      node.x = x;
      node.y = y;
      notify();
    }
  },

  async toggleStandbyNodeVisibility(showStandby: boolean) {
    // Keep nodes, but caller can filter or highlight
    notify();
  },
};
