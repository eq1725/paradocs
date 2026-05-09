'use client'

import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { CheckCircle, Home, PlusCircle, Eye } from 'lucide-react'

export default function SubmitSuccessPage() {
  return (
    <>
      <Head>
        <title>Report Submitted - Paradocs</title>
      </Head>

      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>

          <h1 className="text-3xl font-display font-bold text-white mb-4">
            Report Submitted!
          </h1>

          <p className="text-gray-400 mb-8">
            Thank you for trusting us with this. Your report has been submitted
            and is pending review. In the meantime, see how your experience
            connects to others.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/lab?tab=constellation" className="btn btn-primary">
              <Eye className="w-4 h-4" />
              See Your RADAR
            </Link>
            <Link href="/submit" className="btn btn-secondary">
              <PlusCircle className="w-4 h-4" />
              Submit Another
            </Link>
          </div>

          <div className="mt-8 p-4 bg-white/5 rounded-lg">
            <p className="text-sm text-gray-400">
              Track the status of your submissions in
              <Link href="/lab?tab=submissions" className="text-primary-400 hover:text-primary-300 ml-1">
                your Lab
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
