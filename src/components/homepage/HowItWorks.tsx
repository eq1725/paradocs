'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * "How It Works" + FAQ section.
 * Three-step process overview followed by expandable FAQ accordion.
 * Provides SEO-rich crawlable text and answers common visitor questions.
 */

var steps = [
  {
    number: '01',
    title: 'We aggregate the data',
    description: 'Reports from hundreds of sources—NUFORC, MUFON, BFRO, historical archives, and community submissions—are collected, deduplicated, and standardized into a single unified database.',
  },
  {
    number: '02',
    title: 'AI detects the patterns',
    description: 'Our analysis pipeline scans for geographic clusters, temporal correlations, and phenomenological links that are invisible when data is scattered across dozens of siloed databases.',
  },
  {
    number: '03',
    title: 'You explore and investigate',
    description: 'Search, filter, and map millions of reports. Save what matters to case files. Cross-reference evidence and uncover connections no one else has found.',
  },
]

var faqs = [
  {
    question: 'What kind of reports are in the database?',
    answer: 'Paradocs covers the full spectrum of anomalous and unexplained phenomena—UFO and UAP sightings, cryptid encounters, ghost and apparition reports, psychic experiences, high strangeness, and more. We catalog over 4,792 distinct phenomena types across hundreds of source archives.',
  },
  {
    question: 'Where does the data come from?',
    answer: 'We aggregate reports from established research organizations like NUFORC, MUFON, and BFRO, along with historical archives, academic collections, and community submissions. Every report is deduplicated, geocoded, and standardized for consistency.',
  },
  {
    question: 'Is Paradocs free to use?',
    answer: 'Yes. Searching the database, browsing reports, and exploring the interactive map are completely free. No credit card required. Advanced research tools like case files and AI-powered analysis are available to registered users.',
  },
  {
    question: 'Does Paradocs take a position on whether phenomena are real?',
    answer: 'No. Paradocs is a research utility, not a belief system. We document and analyze reports with intellectual honesty—without assuming phenomena are real or dismissing them as fake. Our role is to surface patterns and let you draw your own conclusions.',
  },
  {
    question: 'How does the AI analysis work?',
    answer: 'Our pipeline analyzes thousands of reports to identify geographic clusters, temporal patterns, and cross-phenomenon correlations. It detects connections that are invisible in any single database but emerge clearly when millions of cases are analyzed together.',
  },
]

function FAQItem({ faq }: { faq: typeof faqs[0] }) {
  var [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-white/5">
      <button
        onClick={function() { setIsOpen(!isOpen) }}
        className="w-full flex items-center justify-between py-5 text-left cursor-pointer group"
      >
        <span className="text-sm md:text-base font-medium text-gray-200 group-hover:text-white transition-colors pr-4">
          {faq.question}
        </span>
        <ChevronDown
          className={'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ' + (isOpen ? 'rotate-180' : '')}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? '200px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <p className="pb-5 text-sm text-gray-400 leading-relaxed">
          {faq.answer}
        </p>
      </div>
    </div>
  )
}

export default function HowItWorks() {
  return (
    <section className="py-16 md:py-24 border-t border-white/5">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* How it works — 3 steps */}
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">
            How Paradocs works
          </h2>
          <p className="mt-3 text-gray-400 text-sm md:text-base max-w-xl mx-auto">
            From raw data to research-ready insights in three steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-20">
          {steps.map(function(step) {
            return (
              <div key={step.number} className="text-center md:text-left">
                <div className="text-2xl font-display font-bold text-primary-500/40 mb-2">
                  {step.number}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* FAQ accordion */}
        <div>
          <h3 className="text-lg md:text-xl font-display font-semibold text-white mb-2">
            Frequently asked questions
          </h3>
          <div className="mt-4">
            {faqs.map(function(faq, i) {
              return <FAQItem key={i} faq={faq} />
            })}
          </div>
        </div>

      </div>
    </section>
  )
}
