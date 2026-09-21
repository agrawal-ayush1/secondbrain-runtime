/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ResourceStatus = 'healthy' | 'running' | 'degraded' | 'offline';

export type ResourceCategory =
  | 'all'
  | 'ingress'
  | 'db'
  | 'cache'
  | 'compute'
  | 'service'
  | 'storage'
  | 'queue';

export interface Resource {
  id: string;
  name: string;
  type: string;
  category: ResourceCategory;
  status: ResourceStatus;
  runtime: string;
  endpoint: string;
  namespace: string;
  protocols: string[];
  dependencies: string[]; // IDs or names
  dependents: string[];
  alternatives: string[]; // alternative IDs
  upstreamInflow?: string;
  upstreamClients?: string[];
  downstreamDeps?: { name: string; target: string; role: string; status: ResourceStatus }[];
  uptime?: string;
  lastUpdated: string;
  metrics: {
    cpu?: number | string;
    memory?: string;
    p99Latency?: string;
    replicas?: string;
    crashDetails?: string;
    errorRate?: string;
    conns?: number;
    qps?: string;
  };
  crashDetails?: string;
}

export type AlternativeStatus = 'active_fallback' | 'available' | 'standby' | 'disabled';
export type AlternativeTier = 'Tier-1' | 'Tier-2' | 'Tier-3';

export interface Alternative {
  id: string;
  name: string;
  primaryResourceId: string;
  primaryResourceName: string;
  primaryEndpoint: string;
  fallbackEndpoint: string;
  tier: AlternativeTier;
  substitutionType: string;
  status: AlternativeStatus;
  trafficDiverted: number; // 0 - 100
  trafficVolume?: string;
  compatibility: number; // 0 - 100
  syncLag: string;
  lastHealthCheck: string;
  readinessSla: string;
  zone: string;
  hardwareMatch: string;
  runtimeDaemon?: string;
  affinityHost?: string;
  livenessStatus?: string;
  readinessStatus?: string;
  canaryStatus?: string;
  p95p99Latency?: string;
  triggerCondition?: string;
}

export interface GraphNode {
  id: string;
  resourceId: string;
  label: string;
  subtitle: string;
  type: string;
  status: ResourceStatus | 'standby';
  x: number;
  y: number;
  metrics: {
    p99?: string;
    cpu?: string;
    replicas?: string;
    hit?: string;
    mem?: string;
    conns?: number;
    lag?: string;
    io?: string;
    jobs?: string;
    avail?: string;
    vol?: string;
    weight?: string;
  };
  isStandby?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'in_band' | 'fallback' | 'sync';
  animated?: boolean;
  dashArray?: string;
  label?: string;
}

export interface ServiceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalActive: number;
  totalStandby: number;
  healthyCount: number;
  degradedCount: number;
  offlineCount: number;
  activeWireFlows: number;
  alternativesConfigured: number;
}

export type WorkloadStatus = 'running' | 'queued' | 'completed' | 'failed' | 'retry_pending';

export interface Workload {
  id: string;
  name: string;
  targetResourceId: string;
  targetResourceName: string;
  targetEndpoint: string;
  status: WorkloadStatus;
  started: string;
  duration: string;
  estimatedRemaining?: string;
  progress?: number;
  schedulerDecision: string;
  selectedResource: string;
  alternativesEvaluated: {
    name: string;
    score?: number;
    note: string;
    status: 'ready' | 'ineligible' | 'reserve';
  }[];
  eventTrace: {
    time: string;
    message: string;
    type?: 'info' | 'success' | 'warn';
  }[];
}

export type EventSeverity = 'info' | 'success' | 'warning' | 'error';
export type EventType =
  | 'Alternative Selected'
  | 'Dependency Failure'
  | 'Self-Healing Recovery'
  | 'Scheduling Decision'
  | 'Retry Initiated'
  | 'Resource Started'
  | 'Health Check Sweep'
  | 'Resource Stopped';

export interface RuntimeEvent {
  id: string;
  timestamp: string;
  relativeTime: string;
  severity: EventSeverity;
  type: EventType;
  resource: string;
  resourceId: string;
  description: string;
  chips: { label: string; value: string; isError?: boolean }[];
  details: {
    latency?: string;
    trigger?: string;
    scope?: string;
    exitCode?: number;
    namespace?: string;
    host?: string;
    replicationOffset?: number;
    nodesInSync?: string;
    strategy?: string;
    weight?: number;
    iops?: string;
    reroute?: string;
    attempt?: string;
    grpcStatus?: string;
    warmupTime?: string;
    readiness?: string;
    passed?: number;
    degraded?: number;
  };
  stateTransition?: {
    from: string;
    fromDetail: string;
    to: string;
    toDetail: string;
    action: string;
    latency: string;
  };
  rootCauseAnalysis?: string;
  rawJson: Record<string, any>;
  acknowledged?: boolean;
}

export interface SchedulerDecision {
  id: string;
  title: string;
  workloadId: string;
  targetNode: string;
  description: string;
  timeAgo: string;
  type: 'worker' | 'backup' | 'replica' | 'retry';
}

export interface SystemSettings {
  general: {
    projectName: string;
    clusterId: string;
    environment: string;
    region: string;
    timeStandard: string;
    displayLocalTime: boolean;
  };
  runtime: {
    refreshInterval: string;
    healthCheckInterval: number;
    grpcTimeout: number;
    retryStrategy: string;
    maxRetries: number;
    baseDelay: string;
    maxDelay: string;
    circuitBreakerEnabled: boolean;
  };
  graph: {
    layoutAlgorithm: 'hierarchical' | 'force' | 'radial';
    showDependencies: boolean;
    showAlternatives: boolean;
    packetFlowAnimation: boolean;
    targetFps: string;
  };
  notifications: {
    rules: {
      id: string;
      eventTrigger: string;
      description: string;
      severity: 'CRITICAL' | 'WARNING' | 'INFO';
      escalation: string;
      enabled: boolean;
    }[];
    slackWebhook: string;
    pagerDutyKey: string;
  };
  api: {
    baseUrl: string;
    backendStatus: 'connected' | 'degraded' | 'disconnected';
    protocol: string;
    rttLatency: string;
    lastSync: string;
    activeChannels: number;
    memoryBuffer: string;
    certExpiryDays: number;
    shaValidated: string;
  };
}
