'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ChevronDown,
  ChevronUp,
  Bookmark,
  Share2,
  Sparkles,
  ArrowRight,
  X,
  AlertTriangle,
  MapPin,
  Tag,
  Calendar,
  Compass,
  LogIn,
  Eye,
} from 'lucide-react'
import { useRouter } from 'next/router';
import { getPhenomena } from '@/lib/store'
import { FilterPanel } from '@/components'
import LoadingSpinner from '@/components/LoadingSpinner'

const DiscoverAll = () => {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [phenomena, setPhenomena] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    years: [],
    countries: [],
    confirmation: [],
  })

  const handleFilterChange = useCallback((filterKey, value) => {
    setFilters(prev => ({ ...prev, [filterKey]: value }))
  }, [])

  useEffect(() => {
    setProcessing(true)
    const data = getPhenomena()
    setPhenomena(data)
    setProcessing(false)
  }, [])

  const filteredPhenomena = phenomena.filter((p) => {
    if (filters.search && !p.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <main className="space-y-6">
      <Head>
        <title>Discover All Phenomena | ParaDocs</title>
      </Head>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <FilterPanel filters={filters} onChange={handleFilterChange} />
        <div className="lg:col-span-4">
          { processing ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              { filteredPhenomena.map((p) => (
                <Link hhref={`/discover/phenomena/${p.id}`}>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="font-bold text-lg">{p.name}</div>
                    <div className="text-gray-700">{p.description}</div>
                  </div>
                </Link>
               )) }
              </div>
            )
          }
        </div>
      </div>
    </main>
  
 "Š