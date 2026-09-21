/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { OverviewPage } from './pages/OverviewPage';
import { ServiceGraphPage } from './pages/ServiceGraphPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { AlternativesPage } from './pages/AlternativesPage';
import { SchedulerPage } from './pages/SchedulerPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-surface text-on-surface flex font-body-md selection:bg-primary-container selection:text-on-primary-container">
        {/* Left Persistent Navigation Sidebar */}
        <Sidebar />

        {/* Right Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Sticky Header */}
          <Header />

          {/* Page Routing Views */}
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/service-graph" element={<ServiceGraphPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/alternatives" element={<AlternativesPage />} />
              <Route path="/scheduler" element={<SchedulerPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
