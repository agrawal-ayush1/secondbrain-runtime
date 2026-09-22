/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ScrollText,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  Check,
  X,
  ExternalLink,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { eventsService } from '../services/eventsService';
import { RuntimeEvent, EventSeverity, EventType } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';

export const EventsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [severityFilter, setSeverityFilter] = useState<EventSeverity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    searchParams.get('id') || null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      const evts = await eventsService.getEvents({
        search: searchQuery,
        severity: severityFilter,
        type: typeFilter,
        resourceId: searchParams.get('resourceId') || undefined,
      });
      setEvents(evts);
      if (!selectedEventId && evts.length > 0) {
        setSelectedEventId(evts[0].id);
      }
    }
    loadData();

    const unsub = eventsService.subscribe(loadData);
    return () => unsub();
  }, [searchQuery, severityFilter, typeFilter, searchParams]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];

  const handleCopyJson = () => {
    if (selectedEvent) {
      navigator.clipboard.writeText(JSON.stringify(selectedEvent.rawJson, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAcknowledge = async (id: string) => {
    await eventsService.acknowledgeEvent(id);
  };

  return (
    <div id="events-page" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div>
          <span className="text-label-caps text-outline font-mono uppercase tracking-widest">
            Telemetry Audit & State Transitions
          </span>
          <h1 className="text-xl font-bold font-mono text-on-surface tracking-tight flex items-center gap-2">
            Events & Audit Logs
            <span className="text-label-caps px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/40 text-on-surface font-normal">
              {events.length} RECORDED
            </span>
          </h1>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, ID, resource..."
              className="w-56 pl-8 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs font-mono text-on-surface placeholder:text-outline/70 focus:outline-none focus:border-primary"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="all">All Event Types</option>
            <option value="Alternative Selected">Alternative Selected</option>
            <option value="Dependency Failure">Dependency Failure</option>
            <option value="Self-Healing Recovery">Self-Healing Recovery</option>
            <option value="Scheduling Decision">Scheduling Decision</option>
            <option value="Health Check Sweep">Health Check Sweep</option>
            <option value="Resource Started">Resource Started</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Event List (Left 2 cols) & Event Detail Inspector (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        {/* Event List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-label-caps text-outline uppercase tracking-wider">
            <span>AUDIT STREAM</span>
            <span>FILTERED: {events.length}</span>
          </div>

          <div className="space-y-2.5">
            {events.map((evt) => {
              const isSelected = selectedEventId === evt.id;

              return (
                <div
                  key={evt.id}
                  onClick={() => setSelectedEventId(evt.id)}
                  className={`p-4 rounded-xl border bg-surface-container-low cursor-pointer transition-all space-y-2 ${
                    isSelected
                      ? 'border-primary shadow-[0_0_14px_rgba(208,188,255,0.2)] bg-surface-container'
                      : 'border-outline-variant/30 hover:border-outline'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={evt.severity} size="sm" />
                      <span className="font-semibold text-on-surface">{evt.type}</span>
                      <span className="text-secondary">[{evt.resource}]</span>

                      {/* Source Indicator Tag */}
                      {(evt.description?.includes('[OFFLINE]') || evt.type?.includes('OFFLINE') || (evt as any).source === 'OFFLINE RUNTIME') ? (
                        <span className="text-label-caps px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                          OFFLINE RUNTIME
                        </span>
                      ) : (evt.description?.includes('SYNC') || evt.type?.includes('SYNC')) ? (
                        <span className="text-label-caps px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                          SYNC
                        </span>
                      ) : (
                        <span className="text-label-caps px-2 py-0.5 rounded bg-surface-container-highest text-outline border border-outline-variant/30">
                          ONLINE
                        </span>
                      )}
                    </div>
                    <span className="text-label-caps text-outline">{evt.relativeTime}</span>
                  </div>

                  <p className="text-on-surface-variant text-xs leading-relaxed">
                    {evt.description}
                  </p>

                  {/* Attribute Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {evt.chips.map((chip, i) => (
                      <span
                        key={i}
                        className={`text-label-caps px-2 py-0.5 rounded border ${
                          chip.isError
                            ? 'bg-error/20 text-error border-error/40'
                            : 'bg-surface-container-highest text-on-surface border-outline-variant/40'
                        }`}
                      >
                        <span className="text-outline mr-1">{chip.label}:</span>
                        <strong>{chip.value}</strong>
                      </span>
                    ))}
                    {evt.acknowledged && (
                      <span className="text-label-caps text-tertiary flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event Detail Inspector */}
        {selectedEvent ? (
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-5 space-y-5 flex flex-col h-fit sticky top-24">
            <div className="space-y-1 pb-3 border-b border-outline-variant/20">
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedEvent.severity} size="sm" />
                <span className="text-label-caps text-outline">{selectedEvent.timestamp}</span>
              </div>
              <h2 className="text-sm font-bold text-on-surface pt-1">{selectedEvent.type}</h2>
              <div className="text-secondary text-label-caps">Target: {selectedEvent.resource}</div>
            </div>

            {/* Description */}
            <div className="text-on-surface text-xs leading-relaxed">
              {selectedEvent.description}
            </div>

            {/* State Transition if available */}
            {selectedEvent.stateTransition && (
              <div className="space-y-2">
                <span className="text-label-caps text-outline uppercase tracking-wider block">
                  State Transition Delta
                </span>
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 space-y-2">
                  <div className="text-label-caps text-outline">
                    FROM: <span className="text-on-surface font-semibold">{selectedEvent.stateTransition.from}</span>
                  </div>
                  <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>{selectedEvent.stateTransition.action}</span>
                  </div>
                  <div className="text-label-caps text-outline">
                    TO: <span className="text-secondary font-semibold">{selectedEvent.stateTransition.to}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Technical Context Details */}
            <div className="space-y-2">
              <span className="text-label-caps text-outline uppercase tracking-wider block">
                Telemetry Diagnostics
              </span>
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 space-y-1 text-label-caps text-outline">
                {Object.entries(selectedEvent.details).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-0.5 border-b border-outline-variant/10 last:border-none">
                    <span className="uppercase">{k}:</span>
                    <span className="text-on-surface font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw JSON Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-label-caps text-outline uppercase tracking-wider">
                  Raw Structured Payload
                </span>
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 text-label-caps text-primary hover:underline"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg p-3 text-[11px] font-mono text-on-surface-variant overflow-x-auto max-h-48">
                {JSON.stringify(selectedEvent.rawJson, null, 2)}
              </pre>
            </div>

            {/* Acknowledge Button */}
            {!selectedEvent.acknowledged && (
              <button
                onClick={() => handleAcknowledge(selectedEvent.id)}
                className="w-full py-2 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-tertiary" />
                <span>Acknowledge Event</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
