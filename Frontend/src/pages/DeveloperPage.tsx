/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Code,
  Terminal,
  Copy,
  Check,
  Globe,
  BookOpen,
  ArrowUpRight,
  Cpu,
  Layers,
  ShieldCheck,
  Play
} from 'lucide-react';
import { simulationService } from '../services/simulationService';

export const DeveloperPage: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rest' | 'python'>('rest');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const baseUrl = 'http://localhost:8000/api/v1';

  const copyToClipboard = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const jsonExample = `{
  "name": "research-agent",
  "priority": 7.0,
  "tasks": [
    { "name": "search", "resource": "search" },
    { "name": "summarize", "resource": "gemini-2.5-flash" },
    { "name": "persist", "resource": "postgres-db" },
    { "name": "generate", "resource": "pdf-generator" }
  ]
}`;

  const reservationJsonExample = `{
  "workflow_id": "W1",
  "resource_id": "gemini-2.5-flash",
  "dimensions": { "rpm": 1.0, "tpm": 50000.0 },
  "soft": false
}`;

  const pythonExample = `from secondbrain_runtime import RuntimeController

# Initialize connection to SecondBrain Runtime Controller
controller = RuntimeController(
    endpoint="http://localhost:8000/api/v1"
)

# Submit a multi-step agentic workflow
workflow = controller.submit_workflow(
    name="research-agent",
    priority=7.0,
    tasks=[
        {"name": "search", "resource": "search"},
        {"name": "summarize", "resource": "gemini-2.5-flash"},
        {"name": "persist", "resource": "postgres-db"}
    ]
)
print("Workflow submitted:", workflow["id"])

# Explicitly reserve quota-aware capacity
reservation = controller.reserve(
    workflow_id=workflow["id"],
    resource_id="gemini-2.5-flash",
    dimensions={"rpm": 1.0, "tpm": 50000.0}
)
print("Capacity Reserved:", reservation["status"])
`;

  const handleTestRun = async () => {
    setIsSubmitting(true);
    setTestResult(null);
    try {
      const res = await simulationService.createWorkflow(
        `wf-dev-${Date.now().toString().slice(-4)}`,
        'Developer Integration Workflow',
        8.5,
        ['search', 'gemini-2.5-flash', 'postgres-db']
      );
      setTestResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="developer-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
            Integration Surface
          </span>
          <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2.5">
            SECOND BRAIN RUNTIME API
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(168,85,247,0.9)]" />
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md bg-surface-container-high border border-outline-variant/40 hover:border-primary/50 text-xs font-mono font-semibold text-on-surface hover:text-primary transition-colors flex items-center gap-2"
          >
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            FastAPI OpenAPI Docs
            <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
          </a>
        </div>
      </div>

      {/* Endpoint Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-surface-container border border-outline-variant/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-semibold">Base Endpoint</span>
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div className="font-mono text-sm font-bold text-on-surface bg-surface-container-highest px-2.5 py-1.5 rounded border border-outline-variant/20 break-all">
            {baseUrl}
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            Versioned public REST API namespace.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-surface-container border border-outline-variant/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-semibold">Orchestration</span>
            <Layers className="h-4 w-4 text-tertiary" />
          </div>
          <div className="font-mono text-sm font-bold text-on-surface">
            Service-Graph & Priority Queue
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            Predictive soft reservations + aging priority scheduler.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-surface-container border border-outline-variant/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-outline uppercase font-semibold">Failure Protection</span>
            <ShieldCheck className="h-4 w-4 text-secondary" />
          </div>
          <div className="font-mono text-sm font-bold text-on-surface">
            Automated Dynamic Fallbacks
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            Automatic rerouting from Flash to Flash Lite on rate limit.
          </p>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="bg-surface-container rounded-xl border border-outline-variant/30 overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 bg-surface-container-high/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('rest')}
              className={`px-4 py-3 font-mono text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'rest'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-outline hover:text-on-surface'
              }`}
            >
              <Terminal className="h-4 w-4" />
              REST API Specification
            </button>
            <button
              onClick={() => setActiveTab('python')}
              className={`px-4 py-3 font-mono text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'python'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-outline hover:text-on-surface'
              }`}
            >
              <Code className="h-4 w-4" />
              Python SDK Example
            </button>
          </div>

          <div className="text-xs font-mono text-outline">
            Content-Type: application/json
          </div>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === 'rest' ? (
            <div className="space-y-6">
              {/* Endpoint 1: Submit Workflow */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold">POST</span>
                    <span className="font-semibold text-on-surface">/api/v1/workflows</span>
                    <span className="text-outline">— Submit Generic AI Workflow</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(jsonExample, 'wf')}
                    className="p-1.5 rounded bg-surface-container-highest hover:bg-outline-variant/30 text-outline hover:text-on-surface transition-colors"
                    title="Copy payload"
                  >
                    {copiedKey === 'wf' ? <Check className="h-3.5 w-3.5 text-tertiary" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <pre className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 font-mono text-xs text-on-surface overflow-x-auto">
                  {jsonExample}
                </pre>
              </div>

              {/* Endpoint 2: Reserve Capacity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold">POST</span>
                    <span className="font-semibold text-on-surface">/api/v1/reservations</span>
                    <span className="text-outline">— Reserve Resource Capacity</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(reservationJsonExample, 'res')}
                    className="p-1.5 rounded bg-surface-container-highest hover:bg-outline-variant/30 text-outline hover:text-on-surface transition-colors"
                    title="Copy payload"
                  >
                    {copiedKey === 'res' ? <Check className="h-3.5 w-3.5 text-tertiary" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <pre className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 font-mono text-xs text-on-surface overflow-x-auto">
                  {reservationJsonExample}
                </pre>
              </div>

              {/* Interactive Endpoint Test */}
              <div className="pt-4 border-t border-outline-variant/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase text-on-surface">
                    Test Workflow Submission Endpoint
                  </h3>
                  <button
                    onClick={handleTestRun}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-md bg-primary text-on-primary font-mono text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-[0_0_12px_rgba(168,85,247,0.4)]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {isSubmitting ? 'Sending Request...' : 'Send Live Request'}
                  </button>
                </div>

                {testResult && (
                  <pre className="p-4 rounded-lg bg-surface-container-lowest border border-primary/30 font-mono text-xs text-tertiary overflow-x-auto">
                    {testResult}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-outline">
                  Python Integration Snippet
                </span>
                <button
                  onClick={() => copyToClipboard(pythonExample, 'py')}
                  className="p-1.5 rounded bg-surface-container-highest hover:bg-outline-variant/30 text-outline hover:text-on-surface transition-colors flex items-center gap-1.5 font-mono text-xs"
                >
                  {copiedKey === 'py' ? <Check className="h-3.5 w-3.5 text-tertiary" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy Code
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 font-mono text-xs text-primary-light overflow-x-auto leading-relaxed">
                {pythonExample}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
