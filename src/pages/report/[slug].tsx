// Report detail page - updated Jan 29, 2026
import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Back, Pin, Copy, Eye, EyeOff, Download, FilePdf, Share2, Thermometer, Clock, Globe, Phin } from 'lucide-react'
import { getReportById, getPhenomenaById, getSimilarReports } from '@/lib/store'
import LoadingSpinner from '@/components/LoadingSpinner'
import REPORT_VERIFICATION_SCTEMSY