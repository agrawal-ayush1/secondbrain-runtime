/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  CheckCircle2,
  RefreshCw,
  Server,
  Network,
  Bell,
  Sliders,
  Zap,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { SystemSettings } from '../types';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const data = await settingsService.getSettings();
      setSettings(data);
    }
    loadSettings();
  }, []);

  if (!settings) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await settingsService.updateSettings(settings);
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    const res = await settingsService.testConnection();
    setConnTestResult(`${res.message} (RTT: ${res.latency})`);
    setIsTestingConn(false);
    setTimeout(() => setConnTestResult(null), 5000);
  };

  return (
    <div id="settings-page" className="p-6 space-y-6 max-w-5xl mx-auto font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline uppercase tracking-widest">
            Configuration & Integration Gateway
          </span>
          <h1 className="text-xl font-bold text-on-surface tracking-tight flex items-center gap-2">
            System Settings
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="px-3 py-1.5 rounded bg-tertiary/15 border border-tertiary/40 text-tertiary flex items-center gap-1.5 animate-fade-in font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Settings Saved
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 rounded-lg flex items-center gap-2 font-semibold transition-colors disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Backend Integration Layer */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-secondary" />
              <h2 className="text-sm font-bold text-on-surface uppercase">
                Backend Service Integration Layer
              </h2>
            </div>
            <span className="text-label-caps px-2 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30">
              VITE_API_BASE_URL
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">
                API Base Endpoint URL
              </label>
              <input
                type="text"
                value={settings.api.baseUrl}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    api: { ...settings.api, baseUrl: e.target.value },
                  })
                }
                placeholder="https://api.orchestrator.internal/v1 or leave empty for local mock"
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
              <p className="text-label-caps text-outline">
                The backend is being developed separately. If left empty or unreachable, the local high-fidelity mock engine handles all mesh state.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">
                Transport Protocol
              </label>
              <input
                type="text"
                value={settings.api.protocol}
                readOnly
                className="w-full bg-surface-container-lowest/60 border border-outline-variant/30 rounded-lg px-3 py-2 text-outline cursor-not-allowed"
              />
              <p className="text-label-caps text-outline">
                Automated gRPC-Web binary framing over HTTP/2 with JSON schema fallback.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-outline-variant/20">
            <div className="flex items-center gap-4 text-label-caps text-outline">
              <span>Status: <strong className="text-tertiary uppercase">{settings.api.backendStatus}</strong></span>
              <span>•</span>
              <span>RTT Latency: <strong className="text-on-surface">{settings.api.rttLatency}</strong></span>
            </div>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingConn}
              className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isTestingConn ? 'animate-spin' : ''}`} />
              <span>Test Connection Handshake</span>
            </button>
          </div>

          {connTestResult && (
            <div className="p-2.5 rounded bg-tertiary/10 border border-tertiary/30 text-tertiary text-xs">
              {connTestResult}
            </div>
          )}
        </div>

        {/* General Environment Specs */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/20">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface uppercase">
              Cluster Environment & Region
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Project ID</label>
              <input
                type="text"
                value={settings.general.projectName}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, projectName: e.target.value },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Cluster ID</label>
              <input
                type="text"
                value={settings.general.clusterId}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, clusterId: e.target.value },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Cloud Region</label>
              <input
                type="text"
                value={settings.general.region}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: { ...settings.general, region: e.target.value },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Runtime & Self-Healing Resilience */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/20">
            <ShieldCheck className="h-4 w-4 text-tertiary" />
            <h2 className="text-sm font-bold text-on-surface uppercase">
              Runtime Orchestration & Resilience Policies
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Health Probe Interval (s)</label>
              <input
                type="number"
                value={settings.runtime.healthCheckInterval}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    runtime: { ...settings.runtime, healthCheckInterval: parseInt(e.target.value) || 5 },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">gRPC Timeout (ms)</label>
              <input
                type="number"
                value={settings.runtime.grpcTimeout}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    runtime: { ...settings.runtime, grpcTimeout: parseInt(e.target.value) || 3000 },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Max Retries</label>
              <input
                type="number"
                value={settings.runtime.maxRetries}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    runtime: { ...settings.runtime, maxRetries: parseInt(e.target.value) || 3 },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between">
            <div>
              <span className="text-on-surface font-semibold block">Circuit Breaker Auto-Trip</span>
              <span className="text-label-caps text-outline">
                Immediately isolate degraded targets and engage alternative fallbacks
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.runtime.circuitBreakerEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  runtime: { ...settings.runtime, circuitBreakerEnabled: e.target.checked },
                })
              }
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Graph Visual Settings */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/20">
            <Network className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface uppercase">
              Service Graph Rendering
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Layout Engine</label>
              <select
                value={settings.graph.layoutAlgorithm}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    graph: { ...settings.graph, layoutAlgorithm: e.target.value as any },
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="hierarchical">Hierarchical (Layered Left-to-Right)</option>
                <option value="force">Force-Directed</option>
                <option value="radial">Radial Hub</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-label-caps text-outline uppercase block">Target Framerate</label>
              <input
                type="text"
                value={settings.graph.targetFps}
                readOnly
                className="w-full bg-surface-container-lowest/60 border border-outline-variant/30 rounded-lg px-3 py-2 text-outline cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Notification Alert Rules */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/20">
            <Bell className="h-4 w-4 text-secondary" />
            <h2 className="text-sm font-bold text-on-surface uppercase">
              Notification & Escalation Rules
            </h2>
          </div>

          <div className="space-y-2">
            {settings.notifications.rules.map((rule, idx) => (
              <div
                key={rule.id}
                className="p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">{rule.eventTrigger}</span>
                    <span className="text-label-caps px-1.5 py-0.5 rounded bg-surface-container-high text-outline">
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-label-caps text-outline">{rule.description}</p>
                  <div className="text-label-caps text-secondary">Route: {rule.escalation}</div>
                </div>

                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => {
                    const newRules = [...settings.notifications.rules];
                    newRules[idx].enabled = e.target.checked;
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, rules: newRules },
                    });
                  }}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
};
