'use client'

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts'
import { FileText, Users, MapPin, TrendingUp, Calendar, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import StatsCard from '@/components/StatsCard'

interface CategoryCount {
  category: PhenomenonCategory
  count: number
}

interface CountryCount {
  country: string
  count: number
}

interface MonthlyCount {
  month: string
  count: number
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalReports: 0,
    totalViews: 0,
    countriesCount: 0,
    thisMonthReports: 0,
  })
  const [categoryData, setCategoryData] = useState<CategoryCount[]>([])
  const [countryData, setCountryData] = useState<CountryCount[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyCount[]>([])
  const [credibilityData, setCredibilityData] = useState<any[]>([])

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    try {
      // Total reports
      const { count: totalReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      // Total views
      const { data: viewsData } = await supabase
        .from('reports')
        .select('view_count')
        .eq('status', 'approved')
      const totalViews = viewsData?.reduce((sum, r) => sum + r.view_count, 0) || 0

      // Countries count
      const { data: countries } = await supabase
        .from('reports')
        .select('country')
        .eq('status', 'approved')
        .not('country', 'is', null)
      const uniqueCountries = new Set(countries?.map(r => r.country)).size

      // This month
      const thisMonth = new Date()
      thisMonth.setDate(1)
      const { count: thisMonthReports } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('created_at', thisMonth.toISOString())

      setStats({
        totalReports: totalReports || 0,
        totalViews,
        countriesCount: uniqueCountries,
        thisMonthReports: thisMonthReports || 0,
      })

      // Category breakdown
      const { data: catData } = await supabase
        .from('reports')
        .select('category')
        .eq('status', 'approved')

      const catCounts: Record<string, number> = {}
      catData?.forEach(r => {
        catCounts[r.category] = (catCounts[r.category] || 0) + 1
      })
      setCategoryData(
        Object.entries(catCounts).map(([category, count]) => ({
          category: category as PhenomenonCategory,
          count,
        })).sort((a, b) => b.count - a.count)
      )

      // Country breakdown (top 10)
      const countryCounts: Record<string, number> = {}
      countries?.forEach(r => {
        if (r.country) {
          countryCounts[r.country] = (countryCounts[r.country] || 0) + 1
        }
      })
      setCountryData(
        Object.entries(countryCounts)
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      )

      // Monthly trend (last 12 months)
      const { data: allReports } = await supabase
        .from('reports')
        .select('created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })

      const monthCounts: Record<string, number> = {}
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = d.toISOString().slice(0, 7) // YYYY-MM
        monthCounts[key] = 0
      }

      allReports?.forEach(r => {
        const key = r.created_at.slice(0, 7)
        if (key in monthCounts) {
          monthCounts[key]++
        }
      })

      setMonthlyData(
        Object.entries(monthCounts).map(([month, count]) => ({
          month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          count,
        }))
      )

      // Credibility breakdown
      const { data: credData } = await supabase
        .from('reports')
        .select('credibility')
        .eq('status', 'approved')

      const credCounts: Record<string, number> = {}
      credData?.forEach(r => {
        credCounts[r.credibility] = (credCounts[r.credibility] || 0) + 1
      })
      setCredibilityData(
        Object.entries(credCounts).map(([name, value]) => ({ name, value }))
      )

    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const COLORS = ['#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#3b82f6', '#14b8a6', '#6b7280']

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-48 mb-8" />
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="skeleton h-80" />
          <div className="skeleton h-80" />
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Analytics - ParaDocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white">Analytics</h1>
          <p className="mt-2 text-gray-400">
            Discover patterns and trends across paranormal phenomena
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Reports"
            value={stats.totalReports.toLocaleString()}
            icon={FileText}
            color="primary"
          />
          <StatsCard
            title="Total Views"
            value={stats.totalViews.toLocaleString()}
            icon={Eye}
            color="green"
          />
          <StatsCard
            title="Countries"
            value={stats.countriesCount}
            icon={MapPin}
            color="amber"
          />
          <StatsCard
            title="This Month"
            value={`+${stats.thisMonthReports}`}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Category breakdown */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4">Reports by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#6b7280" />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke="#6b7280"
                  width={100}
                  tickFormatter={(cat) => CATEGORY_CONFIG[cat as PhenomenonCategory]?.label || cat}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20,20,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    value,
                    CATEGORY_CONFIG[props.payload.category as PhenomenonCategory]?.label || props.payload.category
                  ]}
                />
                <Bar
                  dataKey="count"
                  fill="#5b63f1"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-medium text-white mb-4">Category Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="category"
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20,20,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    CATEGORY_CONFIG[name as PhenomenonCategory]?.label || name
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {categoryData.slice(0, 4).map((item, i) => (
                <div key={item.category} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: COLORS[i] }}
                  />
                  <span className="text-xs text-gray-400">
                    {CATEGORY_CONFIG[item.category]?.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly trend */}
        <div className="glass-card p-6 mb-6">
          <h3 className="text-lg font-medium text-white mb-4">Monthly Reports Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  background: 'rgba(20,20,35,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                }}
              />
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5b63f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#5b63f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                stroke="#5b63f1"
                strokeWidth={2}
                fill="url(#colorCount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top countries */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-white mb-4">Top Reporting Countries</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={countryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="country" stroke="#6b7280" angle={-45} textAnchor="end" height={80} />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  background: 'rgba(20,20,35,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
