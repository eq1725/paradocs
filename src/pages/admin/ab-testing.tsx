import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface ABEvent {
  id: string
  test_name: string
  variant: string
  event_type: string
  session_id: string
  page_path: string
  metadata: Record<string, unknown>
  created_at: string
}

interface TestReport {
  test_name: string
  variants: Record<string, {
    views: number
    clicks: number
    conversions: number
    unique_sessions: number
  }>
  total_events: number
}

export default function ABTestingDashboard() {
  var router = useRouter()
  var [user, setUser] = useState<any>(null)
  var [authLoading, setAuthLoading] = useState(true)
  var [isAdmin, setIsAdmin] = useState(false)
  var [tests, setTests] = useState<TestReport[]>([])
  var [events, setEvents] = useState<ABEvent[]>([])
  var [loading, setLoading] = useState(true)
  var [selectedTest, setSelectedTest] = useState<string | null>(null)

  useEffect(function() {
    async function getUser() {
      var { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }
    getUser()

    var { data: { subscription } } = supabase.auth.onAuthStateChange(function(_event, session) {
      setUser(session?.user ?? null)
    })

    return function() { subscription.unsubscribe() }
  }, [])

  useEffect(function() {
    async function checkAdmin() {
      if (!user) {
        if (!authLoading) router.push('/login?redirect=/admin/ab-testing')
        return
      }
      if (user.email !== 'williamschaseh@gmail.com') {
        router.push('/')
        return
      }
      var { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }
      setIsAdmin(true)
      loadABData()
    }
    checkAdmin()
  }, [user, authLoading, router])

  async function loadABData() {
    setLoading(true)
    try {
      var { data: allEvents, error } = await supabase
        .from('ab_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000)

      if (error) throw error
      setEvents(allEvents || [])

      // Aggregate into test reports
      var testMap: Record<string, TestReport> = {}
      ;(allEvents || []).forEach(function(ev: ABEvent) {
        if (!testMap[ev.test_name]) {
          testMap[ev.test_name] = {
            test_name: ev.test_name,
            variants: {},
            total_events: 0
          }
        }
        var test = testMap[ev.test_name]
        test.total_events++
        if (!test.variants[ev.variant]) {
          test.variants[ev.variant] = { views: 0, clicks: 0, conversions: 0, unique_sessions: 0 }
        }
        var v = test.variants[ev.variant]
        if (ev.event_type === 'view') v.views++
        if (ev.event_type === 'click') v.clicks++
        if (ev.event_type === 'conversion') v.conversions++
      })

      // Count unique sessions per variant
      Object.values(testMap).forEach(function(test) {
        Object.keys(test.variants).forEach(function(variantName) {
          var sessions = new Set<string>()
          ;(allEvents || []).filter(function(e: ABEvent) {
            return e.test_name === test.test_name && e.variant === variantName
          }).forEach(function(e: ABEvent) { sessions.add(e.session_id) })
          test.variants[variantName].unique_sessions = sessions.size
        })
      })

      setTests(Object.values(testMap))
      if (Object.keys(testMap).length > 0 && !selectedTest) {
        setSelectedTest(Object.keys(testMap)[0])
      }
    } catch (err) {
      console.error('Failed to load A/B data:', err)
    }
    setLoading(false)
  }

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    )
  }

  var selectedTestData = tests.find(function(t) { return t.test_name === selectedTest })

  function calcRate(num: number, den: number): string {
    if (den === 0) return '0.00%'
    return (num / den * 100).toFixed(2) + '%'
  }

  function getWinner(test: TestReport): string | null {
    var variants = Object.entries(test.variants)
    if (variants.length < 2) return null
    var best = variants[0]
    variants.forEach(function(v) {
      var bestRate = best[1].views > 0 ? best[1].clicks / best[1].views : 0
      var thisRate = v[1].views > 0 ? v[1].clicks / v[1].views : 0
      if (thisRate > bestRate) best = v
    })
    // Only declare winner if there's meaningful data
    var totalViews = variants.reduce(function(sum, v) { return sum + v[1].views }, 0)
    if (totalViews < 20) return null
    return best[0]
  }

  return (
    <>
      <Head>
        <title>A/B Testing Dashboard - Paradocs Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
                  ← Admin Dashboard
                </Link>
              </div>
              <h1 className="text-3xl font-bold">🧪 A/B Testing Dashboard</h1>
              <p className="text-gray-400 mt-1">Monitor experiments and conversion rates</p>
            </div>
            <button
              onClick={function() { loadABData() }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors"
            >
              🔄 Refresh Data
            </button>
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-400">Loading A/B test data...</div>
          ) : tests.length === 0 ? (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-12 text-center">
              <p className="text-gray-400 text-lg">No A/B tests have recorded events yet.</p>
              <p className="text-gray-500 mt-2">Events will appear here once visitors start viewing the landing page.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Test Selector */}
              <div className="flex gap-3">
                {tests.map(function(test) {
                  return (
                    <button
                      key={test.test_name}
                      onClick={function() { setSelectedTest(test.test_name) }}
                      className={'px-4 py-2 rounded-lg font-medium transition-colors ' +
                        (selectedTest === test.test_name
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700')}
                    >
                      {test.test_name}
                      <span className="ml-2 text-xs opacity-70">({test.total_events} events)</span>
                    </button>
                  )
                })}
              </div>

              {selectedTestData && (
                <>
                  {/* Variant Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(selectedTestData.variants).map(function([variantName, data]) {
                      var winner = getWinner(selectedTestData!)
                      var isWinning = winner === variantName
                      var clickRate = calcRate(data.clicks, data.views)
                      var convRate = calcRate(data.conversions, data.views)

                      return (
                        <div
                          key={variantName}
                          className={'bg-gray-800/50 rounded-lg border p-6 ' +
                            (isWinning ? 'border-green-500/50 ring-1 ring-green-500/20' : 'border-gray-700/50')}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold capitalize">
                              {({A: '🎨 Variant A', B: '🏢 Variant B', C: '🔮 Variant C', D: '🤝 Variant D', E: '⚡ Variant E', control: '🎨 Control (A)', variant_b: '🧪 Variant B'}[variantName] || variantName)}
                            </h3>
                            {isWinning && (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                                🏆 Leading
                              </span>
                            )}
                          </div>

                          {(() => {
                            const labels: Record<string, { angle: string; headline: string }> = {
                              A: { angle: "Identity/Emotional", headline: "Have You Experienced Something You Can\u2019t Explain?" },
                              B: { angle: "Authority/Scale", headline: "The World\u2019s Largest Database of Unexplained Encounters" },
                              C: { angle: "Curiosity/Mystery", headline: "What If Everything You\u2019ve Been Told Is Wrong?" },
                              D: { angle: "Community/Belonging", headline: "Join the Researchers Tracking What Can\u2019t Be Explained" },
                              E: { angle: "Action/Urgency", headline: "Something Strange Is Happening \u2014 And We\u2019re Documenting It" },
                              control: { angle: "Identity/Emotional", headline: "Have You Experienced Something You Can\u2019t Explain?" },
                              variant_b: { angle: "Authority/Scale", headline: "The World\u2019s Largest Database of Unexplained Encounters" },
                            };
                            const info = labels[variantName];
                            return info ? (
                              <div className="mt-3 text-xs text-gray-500">
                                <span className="text-gray-400 font-medium">{info.angle}:</span> &quot;{info.headline}&quot;
                              </div>
                            ) : null;
                          })()}

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 rounded-lg p-4">
                              <div className="text-2xl font-bold text-blue-400">{data.views}</div>
                              <div className="text-sm text-gray-400">Views</div>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-4">
                              <div className="text-2xl font-bold text-purple-400">{data.unique_sessions}</div>
                              <div className="text-sm text-gray-400">Unique Sessions</div>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-4">
                              <div className="text-2xl font-bold text-yellow-400">{data.clicks}</div>
                              <div className="text-sm text-gray-400">Clicks</div>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-4">
                              <div className="text-2xl font-bold text-green-400">{data.conversions}</div>
                              <div className="text-sm text-gray-400">Conversions</div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-700/50 flex gap-6">
                            <div>
                              <span className="text-gray-400 text-sm">Click Rate:</span>
                              <span className="ml-2 font-semibold text-yellow-400">{clickRate}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 text-sm">Conversion Rate:</span>
                              <span className="ml-2 font-semibold text-green-400">{convRate}</span>
                            </div>
                          </div>

                          
                          
                        </div>
                      )
                    })}
                  </div>

                  {/* Recent Events Table */}
                  <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
                    <div className="p-4 border-b border-gray-700/50">
                      <h3 className="font-semibold">Recent Events</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-700/30">
                          <tr>
                            <th className="text-left p-3 text-sm text-gray-400">Time</th>
                            <th className="text-left p-3 text-sm text-gray-400">Variant</th>
                            <th className="text-left p-3 text-sm text-gray-400">Event</th>
                            <th className="text-left p-3 text-sm text-gray-400">Session</th>
                            <th className="text-left p-3 text-sm text-gray-400">Page</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events
                            .filter(function(e) { return e.test_name === selectedTest })
                            .slice(0, 50)
                            .map(function(ev) {
                              return (
                                <tr key={ev.id} className="border-t border-gray-700/30 hover:bg-gray-700/20">
                                  <td className="p-3 text-sm text-gray-300">
                                    {new Date(ev.created_at).toLocaleString()}
                                  </td>
                                  <td className="p-3">
                                    <span className={'px-2 py-0.5 rounded text-xs font-medium ' +
                                      (ev.variant === 'control' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')}>
                                      {ev.variant}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <span className={'px-2 py-0.5 rounded text-xs font-medium ' +
                                      (ev.event_type === 'view' ? 'bg-gray-600/30 text-gray-300' :
                                       ev.event_type === 'click' ? 'bg-yellow-500/20 text-yellow-400' :
                                       'bg-green-500/20 text-green-400')}>
                                      {ev.event_type}
                                    </span>
                                  </td>
                                  <td className="p-3 text-sm text-gray-500 font-mono">{ev.session_id.substring(0, 12)}...</td>
                                  <td className="p-3 text-sm text-gray-400">{ev.page_path || '/'}</td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
