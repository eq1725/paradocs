'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * "How It Works" + FAQ section.
 * Three-step process overview followed by expandable FAQ accordion.
 * Provides SEO-rich crawlable text and answers common visitor questions.
 */

// V11.17.3 — Round 3 rewrite. Community-language verbs replace
// researcher-language verbs throughout. "Investigate / cross-
// reference / data" → "save / find your story / accounts." The
// research-utility framing softens (without losing the
// no-position-on-truth claim that's critical for credibility).
var steps = [
  {
    number: '01',
    title: 'Reports from across the web',
    description: 'First-person accounts and moments people couldn’t quite explain — sightings, dreams, encounters, coincidences. Collected from sources across the web (NUFORC, MUFON, BFRO, historical archives, community forums), plus what people share here directly.',
  },
  {
    number: '02',
    title: 'Patterns become visible',
    description: 'Same shape over the same region. Same hour of the night. Same feeling, decades apart. Patterns become visible when tens of thousands of accounts are read alongside each other — patterns nobody could see in any single story.',
  },
  {
    number: '03',
    title: 'You find your story',
    description: 'Search what you saw, felt, dreamed, or sensed. Save the cases that match. Add your own moment. See who else has had something like it — in your area, your decade, your situation.',
  },
]

var faqs = [
  {
    question: 'What kind of reports does Paradocs collect?',
    answer: 'The full spectrum of moments people couldn’t quite explain — UFO and UAP sightings, ghost and apparition reports, cryptid encounters, near-death experiences, psychic phenomena, déjà vu, missing time, sleep paralysis, premonitions, high strangeness, and more. Over 1,400 distinct phenomena across dozens of source archives.',
  },
  {
    question: 'Where does the data come from?',
    answer: 'Reports come from established research organizations like NUFORC, MUFON, and BFRO, along with historical archives, academic collections, community forums, and submissions from people who share their experiences here directly. Every report is deduplicated, geocoded, and standardized for consistency.',
  },
  {
    question: 'Is Paradocs free to use?',
    answer: 'Yes. Searching, browsing reports, and exploring the interactive map are completely free. No credit card required. Save reports, add your own experience, follow regions and phenomena, and unlock pattern alerts by creating a free account.',
  },
  {
    question: 'Does Paradocs take a position on whether phenomena are real?',
    answer: 'No. Paradocs is for anyone who’s experienced something they can’t quite explain, and for anyone curious about what others have seen, felt, or sensed. We document without taking a position on whether phenomena are real — we surface patterns and let you draw your own conclusions.',
  },
  {
    question: 'How are patterns found across all these reports?',
    answer: 'Reports are read together — across geography, time, phenomenon type, and witness detail. Same shape over the same region. Same kind of dream in the same month. Same feeling, decades apart. Connections invisible in any single source emerge clearly when tens of thousands of accounts are read alongside each other.',
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
            How the world’s largest archive of the unexplained works.
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
