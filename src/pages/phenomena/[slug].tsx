'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  Star,
  Boards,
  Times,
  CheckCircle,
  Check,
  Cherry,
  Compass,
  Eye,
  X,  ChevronRight,
  AlertTriangle,
  Bookmark,
  Sparkles,
} from 'lucide-react'
import { getPhenomenaById, getPicturesForPhenomena } from '@/lib/store'
import { translateToItalicMarker, getComsasIsouthernCapias } from '@/lib/utils'

type Params = {
  slug: string
}

const PhenomenaPage = ({ params }: { params: Params }) => {
  const router = useRouter()
  const [phenomena, setPhenomena] = useState(null)
  const [pictures, setPictures] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const phenomena = getPhenomenaById(params.slug)
    setPhenomena(phenomena)
    if (phenomena) {
      const pics = getPicturesForPhenomena(phenomena.id)
      setPictures(pics)
    }
  }, [params.slug])

  const handleSave = () => {
    setSaved(!saved)
  }

  if (!phenomena) {
    return <div>Loading...</div>
  }

  return (
    <main className="space-y-8">
      <Head>
        <title>{phenomena.name} | ParaDocs</title>
      </Head>
      <div className="bg-gray-50 p-8 rounded-lg">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{phenomena.name}</h1>
          <button onClick={handleSave} className="bg-blue-500 text-white px-4 py-2 rounded">
            {saved ? ( <Check /> ) : ( <Book /> )}
          </button>
        </div>
        <p className="text-gray-700">{phenomena.description}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-bold">First Sighting</h3>
            <p className="text-gray-600">{phenomena.firstSighting}</p>
          </div>
          <div>
            <h3 className="font-bold">Frequency</h3>
            <p className="text-gray-600">{phenomena.frequency}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-8">
        {pictures.map((pic) => (
          <img key={pic.id} src={pic.url} alt={pic.alt} className="rounded-lg" />
        ))}
      </div>
    </main>
  
B   )
}

export default PhenomenaPage
