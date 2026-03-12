import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import ResearchHub from '@/components/dashboard/research-hub/ResearchHub'

export default function ResearchHubPage() {
  var router = useRouter()
  var [authChecked, setAuthChecked] = useState(false)

  useEffect(function() {
    var checkAuth = async function() {
      var result = await supabase.auth.getSession()
      var session = result.data.session
      if (!session) {
        router.push('/login')
        return
      }
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  if (!authChecked) {
    return (
      <DashboardLayout title="Research Hub">
        <div className="w-full h-screen bg-gray-950 flex items-center justify-center">
          <div className="space-y-4">
            <div className="h-8 w-48 bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-96 w-96 bg-gray-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Research Hub">
      <ResearchHub />
    </DashboardLayout>
  )
}
