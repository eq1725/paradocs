/**
 * Beta Access Landing Page
 *
 * Standalone signup page for open beta access.
 * Collects email and interests, submits to Mailchimp.
  
+import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { CheckCircle, ArrowRight } from 'lucide-react'

// Usage options for the signup form
const USAGE_OPTIONS = [
  { id: 'report_experiences', label: 'Report my experiences', icon: 'ğŸ“' },
  { id: 'research', label: 'Research & analysis', icon: 'ğŸ”¬' },
  { id: 'explore_reports', label: 'Explore others\\' reports', icon: 'Â~”' },
  { id: 'just_curious', label: 'Just curious', icon: 'Â~‘€' },
]
