'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import LaptopMockup from './LaptopMockup'

/**
 * "Investigate the unknown" — laptop mockup showing the Lab workspace.
 * Mirrors the FeedShowcase / MapShowcase pattern but uses a laptop frame
 * to signal desktop-class research tooling.
 *
 * Placeholder workspace shows: sidebar with case files, main area with
 * a case detail view including connected reports and constellation.
 *
 * TODO: Replace static placeholder with looped video capture of real Lab.
 */

/* Mock case files for sidebar */
var mockCases = [
  { name: 'Hudson Valley Triangles', count: 14, color: '#22d3ee', active: true },
  { name: 'Skinwalker Ranch Cluster', count: 8, color: '#fb923c', active: false },
  { name: 'Gulf Breeze Sightings', count: 23, color: '#c084fc', active: false },
  { name: 'Pine Bush Phenomena', count: 11, color: '#4ade80', active: false },
]

/* Mock saved reports for the active case */
var mockReports = [
  { tag: 'UFO', location: 'New Paltz, NY', date: 'Mar 2024', hook: 'Silent triangle with amber lights observed for 4 minutes' },
  { tag: 'UFO', location: 'Brewster, NY', date: 'Jan 2024', hook: 'V-shaped craft, estimated 300ft wingspan, no sound' },
  { tag: 'High Strangeness', location: 'Pine Bush, NY', date: 'Feb 2024', hook: 'Electromagnetic interference during sighting, car stalled' },
]

/* Mock credibility tags */
var mockCredTags = ['Multiple witnesses', 'Photo evidence', 'Radar confirmed']

export default function LabShowcase() {
  return (
    <section className="py-16 md:py-24 overflow-hidden border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-14">

          {/* Text content — left on desktop */}
          <div className="flex-1 order-2 md:order-1 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-tight">
              Investigate the unknown
            </h2>
            <p className="mt-4 text-base md:text-lg text-gray-400 max-w-lg">
              Build case files, save reports, and cross-reference evidence against your own experience. Your research workspace surfaces the patterns the Index already sees — across tens of thousands of first-person accounts.
            </p>

            <Link
              href="/lab"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              Start investigating
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Laptop mockup — right on desktop */}
          <div className="flex-shrink-0 order-1 md:order-2 w-full md:w-auto md:-my-12">
            <LaptopMockup>
              <div className="absolute inset-0 flex">

                {/* Sidebar — case files list */}
                <div className="w-[30%] border-r border-white/[0.06] bg-gray-950 flex flex-col">
                  {/* Sidebar header */}
                  <div className="px-2.5 py-2 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-semibold text-white">Case Files</span>
                      <div className="w-3 h-3 rounded bg-primary-500/20 flex items-center justify-center">
                        <span className="text-[7px] text-primary-400">+</span>
                      </div>
                    </div>
                  </div>

                  {/* Case list */}
                  <div className="flex-1 overflow-hidden py-1">
                    {mockCases.map(function(c, i) {
                      return (
                        <div
                          key={i}
                          className={'px-2.5 py-1.5 cursor-pointer ' + (c.active ? 'bg-white/[0.04]' : '')}
                          style={{ borderLeft: c.active ? '2px solid ' + c.color : '2px solid transparent' }}
                        >
                          <p className={'text-[8px] font-medium leading-tight ' + (c.active ? 'text-white' : 'text-gray-500')}>
                            {c.name}
                          </p>
                          <p className="text-[7px] text-gray-600 mt-0.5">
                            {c.count + ' reports'}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Sidebar footer — saved count */}
                  <div className="px-2.5 py-1.5 border-t border-white/[0.06]">
                    <p className="text-[7px] text-gray-600">4 case files</p>
                  </div>
                </div>

                {/* Main content area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Top bar */}
                  <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
                      <span className="text-[9px] font-semibold text-white">Hudson Valley Triangles</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7px] px-1.5 py-0.5 rounded bg-white/[0.05] text-gray-500">Timeline</span>
                      <span className="text-[7px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400">Reports</span>
                      <span className="text-[7px] px-1.5 py-0.5 rounded bg-white/[0.05] text-gray-500">Map</span>
                    </div>
                  </div>

                  {/* Reports content */}
                  <div className="flex-1 overflow-hidden px-3 py-2">
                    {/* Credibility summary bar */}
                    <div className="flex gap-1 mb-2">
                      {mockCredTags.map(function(tag, i) {
                        return (
                          <span key={i} className="text-[7px] px-1.5 py-0.5 rounded-full border border-white/[0.08] text-gray-500">
                            {tag}
                          </span>
                        )
                      })}
                    </div>

                    {/* Report cards */}
                    {mockReports.map(function(r, i) {
                      return (
                        <div
                          key={i}
                          className="mb-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[7px] font-semibold text-cyan-400">{r.tag}</span>
                            <span className="text-[7px] text-gray-600">{r.location}</span>
                            <span className="text-[7px] text-gray-700 ml-auto">{r.date}</span>
                          </div>
                          <p className="text-[8px] text-gray-400 leading-snug">{r.hook}</p>
                        </div>
                      )
                    })}

                    {/* Constellation mini-visualization */}
                    <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
                      <p className="text-[7px] text-gray-600 mb-1.5 font-medium">Pattern connections</p>
                      <svg className="w-full" viewBox="0 0 200 50" fill="none">
                        {/* Nodes */}
                        <circle cx="30" cy="25" r="4" fill="#22d3ee" opacity="0.8" />
                        <circle cx="70" cy="15" r="3" fill="#22d3ee" opacity="0.6" />
                        <circle cx="100" cy="35" r="3.5" fill="#c084fc" opacity="0.7" />
                        <circle cx="140" cy="20" r="3" fill="#22d3ee" opacity="0.6" />
                        <circle cx="170" cy="30" r="4" fill="#fb923c" opacity="0.8" />
                        {/* Connection lines */}
                        <line x1="30" y1="25" x2="70" y2="15" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />
                        <line x1="70" y1="15" x2="100" y2="35" stroke="#c084fc" strokeWidth="0.5" opacity="0.3" />
                        <line x1="100" y1="35" x2="140" y2="20" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />
                        <line x1="140" y1="20" x2="170" y2="30" stroke="#fb923c" strokeWidth="0.5" opacity="0.3" />
                        <line x1="30" y1="25" x2="100" y2="35" stroke="#c084fc" strokeWidth="0.3" opacity="0.2" strokeDasharray="2 2" />
                        <line x1="70" y1="15" x2="170" y2="30" stroke="#fb923c" strokeWidth="0.3" opacity="0.2" strokeDasharray="2 2" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </LaptopMockup>
          </div>

        </div>
      </div>
    </section>
  )
}
