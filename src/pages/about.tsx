import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import {
  Compass,
  Database,
  Users,
  Shield,
  Lightbulb,
  Globe,
  BookOpen,
  ArrowRight,
  Sparkles,
  Scale
} from 'lucide-react'

function ValueCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="glass-card p-6">
      <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About | ParaDocs</title>
        <meta
          name="description"
          content="Learn about ParaDocs - the world's largest open database of paranormal phenomena. Our mission, vision, and commitment to transparent research."
        />
      </Head>

      <div className="py-12 max-w-5xl mx-auto px-4">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            Where mysteries meet discovery
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-6">
            About ParaDocs
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            ParaDocs is building the world's most comprehensive, open, and transparent
            database of paranormal phenomena—powered by community contributions and
            enhanced by modern analytical tools.
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-16">
          <div className="glass-card p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Compass className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-display font-semibold text-white">Our Mission</h2>
            </div>
            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              To create a centralized, accessible repository where anyone can explore,
              contribute to, and analyze reports of unexplained phenomena—from UFO sightings
              and cryptid encounters to ghost reports and other anomalous experiences.
            </p>
            <p className="text-gray-400 leading-relaxed">
              We believe that by collecting and organizing these accounts in one place,
              patterns may emerge that individual reports could never reveal. Whether you're
              a curious skeptic, an open-minded researcher, or someone who's had their own
              unexplained experience, ParaDocs provides the tools to explore these mysteries
              with rigor and transparency.
            </p>
          </div>
        </section>

        {/* Vision Section */}
        <section className="mb-16">
          <div className="glass-card p-8 md:p-12 border-l-4 border-primary-500">
            <h2 className="text-2xl font-display font-semibold text-white mb-6">Our Vision</h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-4">
              A world where unexplained experiences aren't dismissed or sensationalized—but
              documented, analyzed, and explored with intellectual honesty.
            </p>
            <p className="text-gray-400 leading-relaxed">
              We envision ParaDocs as the go-to resource for researchers, journalists,
              enthusiasts, and the simply curious. A place where data speaks for itself,
              methodology is transparent, and every perspective—from the deeply skeptical
              to the experientially convinced—has a seat at the table.
            </p>
          </div>
        </section>

        {/* Core Values */}
        <section className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-8 text-center">
            What We Stand For
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ValueCard
              icon={BookOpen}
              title="Transparency"
              description="Every pattern we detect comes with full methodology documentation. We show our work, acknowledge limitations, and present alternative explanations alongside our findings."
            />
            <ValueCard
              icon={Scale}
              title="Intellectual Honesty"
              description="We don't advocate for any particular explanation. Our job is to collect, organize, and analyze—not to convince. You draw your own conclusions."
            />
            <ValueCard
              icon={Users}
              title="Community-Driven"
              description="ParaDocs is built by and for its community. Every report, every correction, and every insight strengthens the collective knowledge base."
            />
            <ValueCard
              icon={Shield}
              title="Privacy & Respect"
              description="Witnesses share sensitive experiences. We protect their privacy, treat reports with respect, and never exploit personal accounts for sensationalism."
            />
            <ValueCard
              icon={Database}
              title="Data Quality"
              description="Garbage in, garbage out. We implement validation, flag quality issues, and continuously work to improve the reliability of our data."
            />
            <ValueCard
              icon={Globe}
              title="Accessibility"
              description="Paranormal research shouldn't be locked behind paywalls or gatekeepers. ParaDocs is free to explore, contribute to, and learn from."
            />
          </div>
        </section>

        {/* What We're Not */}
        <section className="mb-16">
          <div className="glass-card p-8 bg-amber-500/5 border border-amber-500/20">
            <h2 className="text-xl font-display font-semibold text-white mb-4">
              What ParaDocs Is Not
            </h2>
            <ul className="space-y-3 text-gray-400">
              <li className="flex items-start gap-3">
                <span className="text-amber-400 mt-1">•</span>
                <span>
                  <strong className="text-white">Not a belief system.</strong> We don't claim
                  that any phenomena are real or fake. We document reports.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-400 mt-1">•</span>
                <span>
                  <strong className="text-white">Not entertainment.</strong> While exploring
                  mysteries can be fascinating, we prioritize research utility over sensationalism.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-amber-400 mt-1">•</span>
                <span>
                  <strong className="text-white">Not the final word.</strong> Our analyses are
                  starting points for investigation, not definitive conclusions.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center">
          <h2 className="text-2xl font-display font-semibold text-white mb-4">
            Ready to Explore?
          </h2>
          <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
            Whether you want to browse thousands of documented experiences, submit your
            own report, or dive into our pattern analysis—there's a place for you here.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/explore"
              className="btn btn-primary"
            >
              <Compass className="w-4 h-4" />
              Explore Reports
            </Link>
            <Link
              href="/submit"
              className="btn btn-secondary"
            >
              Submit a Report
            </Link>
            <Link
              href="/insights/methodology"
              className="btn btn-secondary"
            >
              <Lightbulb className="w-4 h-4" />
              View Methodology
            </Link>
          </div>
        </section>

        {/* Contact */}
        <section className="mt-16">
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-gray-400 mb-2">
              Questions, feedback, or partnership inquiries?
            </p>
            <a
              href="mailto:contact@discoverparadocs.com"
              className="text-primary-400 hover:underline"
            >
              contact@discoverparadocs.com
            </a>
          </div>
        </section>
      </div>
    </>
  )
}
