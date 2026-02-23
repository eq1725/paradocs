'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ChevronDown, Plus, X, Search } from 'lucide-react'
import { getConstellations, getConstellationById } from '@/lib/store'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function Constellations() {
  const router = useRouter()
  const [constellations, setConstellations] = useState([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    const consts = getConstellations()
    setConstellations(consts)
  }, [])

  const filtered = constellations.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSelection = (cId: string) => {
    setSelected(prev =>
      prev.includes(cId) ? prev.filter(c => c !== cId) : [...prev, cId]
    )
  }

  return (
    <main className="bg-white min-h-screen">
      <Head>
        <title>My Constellations | ParaDocs</title>
      </Head>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Constellations</h1>
          <Link href="/dashboard" className="text-brand hover:underline">
  P±F6†&BÒg&öÒrâõ6†&VD6ö×öæVçG2õF6·2B6öæ7W'&VçBÂ×WF&ÆRÂf–æÆ—¦VBÒg&öÒv¦fçWF–Âæ6öæ7W'&VçB