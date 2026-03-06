'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Image, Check, X, Download, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { classNames } from '@/lib/utils'
import { CATEGORY_CONFIG } from '@/lib/constants'

interface PhenomenonMediaItem {
  id: string;
  phenomenon_id: string;
  phenomenon_name: string;
  phenomenon_slug: string;
  category: string;
  url: string;
  thumbnail_url: string | null;
  source: string | null;
  license: string | null;
  ai_confidence: number;
  caption: string | null;
  status: 'pending' | 'approved' | 'rejected';
  is_profile: boolean;
  created_at: string;
}

interface PhenomenonWithMedia {
  id: string;
  name: string;
  slug: string;
  category: string;
  primary_image_url: string | null;
  media_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  media_items: PhenomenonMediaItem[];
}

interface ReviewStats {
  total_phenomena: number;
  with_profile_image: number;
  pending_review: number;
  no_candidates: number;
}

interface ProfileReviewItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  primary_image_url: string | null;
  profile_review_status: string;
}

interface ProfileReviewStats {
  total: number;
  reviewed: number;
  approved: number;
  denied: number;
  unreviewed: number;
}

export default function MediaReviewPage() {
  var router = useRouter();

  // Shared state
  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  // View mode: profile-review or candidates
  var viewModeState = useState('profile-review');
  var viewMode = viewModeState[0];
  var setViewMode = viewModeState[1];

  // ===== Candidate Review state (existing) =====
  var statsState = useState(null);
  var stats = statsState[0];
  var setStats = statsState[1];
  var phenomenaState = useState([]);
  var phenomena = phenomenaState[0];
  var setPhenomena = phenomenaState[1];
  var selectedPhenomenonState = useState(null);
  var selectedPhenomenon = selectedPhenomenonState[0];
  var setSelectedPhenomenon = selectedPhenomenonState[1];
  var filteringState = useState(false);
  var filtering = filteringState[0];
  var setFiltering = filteringState[1];
  var categoryState = useState('');
  var category = categoryState[0];
  var setCategory = categoryState[1];
  var statusState = useState('pending');
  var status = statusState[0];
  var setStatus = statusState[1];
  var searchQueryState = useState('');
  var searchQuery = searchQueryState[0];
  var setSearchQuery = searchQueryState[1];
  var currentPageState = useState(1);
  var currentPage = currentPageState[0];
  var setCurrentPage = currentPageState[1];
  var isSearchingState = useState(false);
  var isSearching = isSearchingState[0];
  var setIsSearching = isSearchingState[1];

  // ===== Profile Review state (new) =====
  var profileItemsState = useState([]);
  var profileItems = profileItemsState[0];
  var setProfileItems = profileItemsState[1];
  var profileStatsState = useState(null);
  var profileStats = profileStatsState[0];
  var setProfileStats = profileStatsState[1];
  var profilePageState = useState(1);
  var profilePage = profilePageState[0];
  var setProfilePage = profilePageState[1];
  var profileTotalCountState = useState(0);
  var profileTotalCount = profileTotalCountState[0];
  var setProfileTotalCount = profileTotalCountState[1];
  var profileFilterState = useState('all');
  var profileFilter = profileFilterState[0];
  var setProfileFilter = profileFilterState[1];
  var profileCategoryState = useState('');
  var profileCategory = profileCategoryState[0];
  var setProfileCategory = profileCategoryState[1];
  var profileSearchState = useState('');
  var profileSearch = profileSearchState[0];
  var setProfileSearch = profileSearchState[1];
  var profileActionLoadingState = useState('');
  var profileActionLoading = profileActionLoadingState[0];
  var setProfileActionLoading = profileActionLoadingState[1];
  var profileLoadingState = useState(false);
  var profileLoading = profileLoadingState[0];
  var setProfileLoading = profileLoadingState[1];

  useEffect(function() {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      var { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        router.push('/');
        return;
      }

      var { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || user.email !== 'williamschaseh@gmail.com') {
        router.push('/');
        return;
      }

      loadProfileReviewData();
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/');
    }
  }

  async function getAuthHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var { data: { session } } = await supabase.auth.getSession();
    if (session && session.access_token) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    }
    return headers;
  }

  // ===== Profile Review functions =====

  async function loadProfileReviewData() {
    try {
      setProfileLoading(true);
      var queryParams = new URLSearchParams();
      queryParams.append('mode', 'profile-review');
      queryParams.append('page', String(profilePage));
      queryParams.append('limit', '50');
      if (profileCategory) queryParams.append('category', profileCategory);
      if (profileSearch) queryParams.append('search', profileSearch);
      if (profileFilter && profileFilter !== 'all') queryParams.append('profile_status', profileFilter);

      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review?' + queryParams.toString(), {
        headers: authHeaders
      });
      if (!response.ok) {
        console.error('Failed to load profile review data');
        return;
      }

      var data = await response.json();
      setProfileStats(data.stats);
      setProfileItems(data.phenomena);
      setProfileTotalCount(data.total_count || 0);
    } catch (error) {
      console.error('Error loading profile review data:', error);
    } finally {
      setProfileLoading(false);
      setLoading(false);
    }
  }

  async function handleApproveProfile(phenomenonId) {
    try {
      setProfileActionLoading(phenomenonId);
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'approve-profile',
          phenomenon_id: phenomenonId
        })
      });

      if (response.ok) {
        // Update local state immediately for responsiveness
        setProfileItems(function(prev) {
          return prev.map(function(item) {
            if (item.id === phenomenonId) {
              return Object.assign({}, item, { profile_review_status: 'approved' });
            }
            return item;
          });
        });
        // Update stats
        if (profileStats) {
          setProfileStats(function(prev) {
            if (!prev) return prev;
            return Object.assign({}, prev, {
              approved: prev.approved + 1,
              unreviewed: prev.unreviewed > 0 ? prev.unreviewed - 1 : 0,
              reviewed: prev.reviewed + 1
            });
          });
        }
      }
    } catch (error) {
      console.error('Error approving profile:', error);
    } finally {
      setProfileActionLoading('');
    }
  }

  async function handleDenyProfile(phenomenonId) {
    try {
      setProfileActionLoading(phenomenonId);
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'deny-profile',
          phenomenon_id: phenomenonId
        })
      });

      if (response.ok) {
        // Update local state immediately
        setProfileItems(function(prev) {
          return prev.map(function(item) {
            if (item.id === phenomenonId) {
              return Object.assign({}, item, { profile_review_status: 'denied', primary_image_url: null });
            }
            return item;
          });
        });
        // Update stats
        if (profileStats) {
          setProfileStats(function(prev) {
            if (!prev) return prev;
            return Object.assign({}, prev, {
              denied: prev.denied + 1,
              unreviewed: prev.unreviewed > 0 ? prev.unreviewed - 1 : 0,
              reviewed: prev.reviewed + 1
            });
          });
        }
      }
    } catch (error) {
      console.error('Error denying profile:', error);
    } finally {
      setProfileActionLoading('');
    }
  }

  // ===== Candidate Review functions (existing) =====

  async function loadData() {
    try {
      setLoading(true);
      var queryParams = new URLSearchParams();
      if (category) queryParams.append('category', category);
      if (status) queryParams.append('status', status);
      if (searchQuery) queryParams.append('search', searchQuery);
      queryParams.append('page', String(currentPage));

      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review?' + queryParams.toString(), {
        headers: authHeaders
      });
      if (!response.ok) {
        console.error('Failed to load media review data');
        return;
      }

      var data = await response.json();
      setStats(data.stats);
      setPhenomena(data.phenomena);
      if (data.phenomena.length > 0) {
        setSelectedPhenomenon(data.phenomena[0]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setCurrentPage(1);
    loadData();
  }

  async function handleFilterChange(field, value) {
    if (field === 'category') {
      setCategory(value);
    } else if (field === 'status') {
      setStatus(value);
    }
    setCurrentPage(1);
    setFiltering(true);
  }

  async function handleApprove(mediaId) {
    try {
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'approve',
          media_id: mediaId
        })
      });

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Error approving media:', error);
    }
  }

  async function handleReject(mediaId) {
    try {
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'reject',
          media_id: mediaId
        })
      });

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Error rejecting media:', error);
    }
  }

  async function handleSetAsProfile(mediaId) {
    try {
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/media-review', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'set_profile',
          media_id: mediaId
        })
      });

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Error setting profile image:', error);
    }
  }

  async function handleSearchWikimedia(categoryFilter) {
    try {
      setIsSearching(true);
      var authHeaders = await getAuthHeaders();
      var response = await fetch('/api/admin/phenomena/search-images', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          category: categoryFilter || category
        })
      });

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Error searching Wikimedia:', error);
    } finally {
      setIsSearching(false);
    }
  }

  function getMedioBadge(item) {
    if (item.status === 'approved') {
      return 'bg-green-900/30 text-green-400';
    } else if (item.status === 'rejected') {
      return 'bg-red-900/30 text-red-400';
    }
    return 'bg-yellow-900/30 text-yellow-400';
  }

  function getPhenomenonBadges(phenomenon) {
    var badges = [];
    if (phenomenon.primary_image_url) {
      badges.push({ text: 'has-profile', color: 'bg-green-900/30 text-green-400' });
    }
    if (phenomenon.pending_count > 0) {
      badges.push({ text: 'pending', color: 'bg-yellow-900/30 text-yellow-400' });
    }
    if (phenomenon.media_count === 0) {
      badges.push({ text: 'needs-image', color: 'bg-red-900/30 text-red-400' });
    }
    return badges;
  }

  function getProfileBorderClass(reviewStatus) {
    if (reviewStatus === 'approved') return 'border-green-500';
    if (reviewStatus === 'denied') return 'border-red-500';
    return 'border-gray-700';
  }

  function handleProfileSearchSubmit() {
    setProfilePage(1);
    loadProfileReviewData();
  }

  function handleProfileFilterChange(newFilter) {
    setProfileFilter(newFilter);
    setProfilePage(1);
    // Trigger reload after state updates
    setTimeout(function() { loadProfileReviewData(); }, 0);
  }

  function handleProfileCategoryChange(newCategory) {
    setProfileCategory(newCategory);
    setProfilePage(1);
    setTimeout(function() { loadProfileReviewData(); }, 0);
  }

  function handleTabSwitch(mode) {
    setViewMode(mode);
    if (mode === 'profile-review') {
      loadProfileReviewData();
    } else {
      loadData();
    }
  }

  var profileTotalPages = Math.ceil(profileTotalCount / 50) || 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  var categoryConfig = CATEGORY_CONFIG;

  return (
    <>
      <Head>
        <title>Media Review - Admin - Paradocs</title>
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-white">Media Review</h1>
              <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
                Back to Admin
              </Link>
            </div>

            {/* Profile Review Stats (shown when in profile-review mode) */}
            {viewMode === 'profile-review' && profileStats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Total</div>
                  <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                    {profileStats.total}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Reviewed</div>
                  <div className="text-2xl sm:text-3xl font-bold text-blue-400 mt-1">
                    {profileStats.reviewed}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Approved</div>
                  <div className="text-2xl sm:text-3xl font-bold text-green-400 mt-1">
                    {profileStats.approved}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Denied</div>
                  <div className="text-2xl sm:text-3xl font-bold text-red-400 mt-1">
                    {profileStats.denied}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Unreviewed</div>
                  <div className="text-2xl sm:text-3xl font-bold text-yellow-400 mt-1">
                    {profileStats.unreviewed}
                  </div>
                </div>
              </div>
            )}

            {/* Candidate Review Stats (shown when in candidates mode) */}
            {viewMode === 'candidates' && stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Total Phenomena</div>
                  <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                    {stats.total_phenomena || 0}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">With Profile Image</div>
                  <div className="text-2xl sm:text-3xl font-bold text-green-400 mt-1">
                    {stats.with_profile_image || 0}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">Pending Review</div>
                  <div className="text-2xl sm:text-3xl font-bold text-yellow-400 mt-1">
                    {stats.pending_review || 0}
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs sm:text-sm">No Candidates</div>
                  <div className="text-2xl sm:text-3xl font-bold text-red-400 mt-1">
                    {stats.no_candidates || 0}
                  </div>
                </div>
              </div>
            )}

            {/* Tab Bar */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={function() { handleTabSwitch('profile-review'); }}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  viewMode === 'profile-review'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                )}
              >
                Profile Review
              </button>
              <button
                onClick={function() { handleTabSwitch('candidates'); }}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  viewMode === 'candidates'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                )}
              >
                Candidate Review
              </button>
            </div>

            {/* Profile Review Filters */}
            {viewMode === 'profile-review' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={profileSearch}
                      onChange={function(e) { setProfileSearch(e.target.value); }}
                      onKeyDown={function(e) { if (e.key === 'Enter') handleProfileSearchSubmit(); }}
                      className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <button
                    onClick={handleProfileSearchSubmit}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                  >
                    Search
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={profileFilter}
                    onChange={function(e) { handleProfileFilterChange(e.target.value); }}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="approved">Approved</option>
                    <option value="denied">Denied</option>
                    <option value="has-image">Has Image</option>
                    <option value="no-image">No Image</option>
                  </select>

                  <select
                    value={profileCategory}
                    onChange={function(e) { handleProfileCategoryChange(e.target.value); }}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
                  >
                    <option value="">All Categories</option>
                    {Object.entries(categoryConfig).map(function(entry) {
                      var key = entry[0];
                      var cfg = entry[1];
                      return (
                        <option key={key} value={key}>
                          {cfg.icon} {cfg.label}
                        </option>
                      );
                    })}
                  </select>

                  {profileStats && (
                    <div className="flex items-center px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                      {profileStats.reviewed} / {profileStats.total} reviewed ({profileStats.total > 0 ? Math.round((profileStats.reviewed / profileStats.total) * 100) : 0}%)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Candidate Review Filters */}
            {viewMode === 'candidates' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={searchQuery}
                      onChange={function(e) { setSearchQuery(e.target.value); }}
                      className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                  >
                    Search
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={category}
                    onChange={function(e) { handleFilterChange('category', e.target.value); }}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
                  >
                    <option value="">All Categories</option>
                    {Object.entries(categoryConfig).map(function(entry) {
                      var key = entry[0];
                      var cfg = entry[1];
                      return (
                        <option key={key} value={key}>
                          {cfg.icon} {cfg.label}
                        </option>
                      );
                    })}
                  </select>

                  <select
                    value={status}
                    onChange={function(e) { handleFilterChange('status', e.target.value); }}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <button
                    onClick={function() { handleSearchWikimedia(); }}
                    disabled={isSearching}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
                  >
                    {isSearching ? 'Searching...' : 'Search All'}
                  </button>

                  {category && (
                    <button
                      onClick={function() { handleSearchWikimedia(category); }}
                      disabled={isSearching}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm whitespace-nowrap"
                    >
                      {isSearching ? 'Searching...' : 'Search Category'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* ===== PROFILE REVIEW MODE ===== */}
          {viewMode === 'profile-review' && (
            <div>
              {profileLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                </div>
              ) : profileItems.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                  <Image className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-2">No phenomena found</p>
                  <p className="text-gray-500 text-sm">Try adjusting your filters.</p>
                </div>
              ) : (
                <>
                  {/* Profile Review Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {profileItems.map(function(item) {
                      var cfg = categoryConfig[item.category];
                      var borderClass = getProfileBorderClass(item.profile_review_status);
                      var isActionLoading = profileActionLoading === item.id;

                      return (
                        <div
                          key={item.id}
                          className={classNames(
                            'bg-gray-900 border-2 rounded-xl overflow-hidden transition-all hover:shadow-lg hover:shadow-purple-900/20',
                            borderClass
                          )}
                        >
                          {/* Image */}
                          <div className="relative aspect-square bg-gray-800 overflow-hidden">
                            {item.primary_image_url ? (
                              <img
                                src={item.primary_image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="w-10 h-10 text-gray-700" />
                              </div>
                            )}

                            {/* Status badge overlay */}
                            {item.profile_review_status === 'approved' && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}
                            {item.profile_review_status === 'denied' && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                                <X className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="p-3">
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-xs">{cfg?.icon}</span>
                              <h3 className="text-xs font-medium text-white truncate">{item.name}</h3>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-1 mt-2">
                              <button
                                onClick={function() { handleApproveProfile(item.id); }}
                                disabled={isActionLoading || item.profile_review_status === 'approved'}
                                className={classNames(
                                  'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1',
                                  item.profile_review_status === 'approved'
                                    ? 'bg-green-600 text-white cursor-default'
                                    : 'bg-green-900/30 hover:bg-green-900/50 text-green-400'
                                )}
                              >
                                <Check className="w-3 h-3" />
                                {item.profile_review_status === 'approved' ? 'OK' : 'Approve'}
                              </button>
                              <button
                                onClick={function() { handleDenyProfile(item.id); }}
                                disabled={isActionLoading || item.profile_review_status === 'denied'}
                                className={classNames(
                                  'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1',
                                  item.profile_review_status === 'denied'
                                    ? 'bg-red-600 text-white cursor-default'
                                    : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                                )}
                              >
                                <X className="w-3 h-3" />
                                {item.profile_review_status === 'denied' ? 'Denied' : 'Deny'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-8">
                    <button
                      onClick={function() {
                        var newPage = profilePage - 1;
                        setProfilePage(newPage);
                        setTimeout(function() { loadProfileReviewData(); }, 0);
                      }}
                      disabled={profilePage <= 1}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-white rounded-lg text-sm flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <span className="text-sm text-gray-400">
                      Page {profilePage} of {profileTotalPages} ({profileTotalCount} items)
                    </span>
                    <button
                      onClick={function() {
                        var newPage = profilePage + 1;
                        setProfilePage(newPage);
                        setTimeout(function() { loadProfileReviewData(); }, 0);
                      }}
                      disabled={profilePage >= profileTotalPages}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-white rounded-lg text-sm flex items-center gap-1 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== CANDIDATE REVIEW MODE ===== */}
          {viewMode === 'candidates' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Sidebar - Phenomena List */}
              <div className="lg:col-span-1">
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col h-[600px]">
                  <div className="p-4 border-b border-gray-800 bg-gray-800/50">
                    <h2 className="text-lg font-semibold text-white">Phenomena</h2>
                    <p className="text-xs text-gray-400 mt-1">{phenomena.length} items</p>
                  </div>

                  <div className="overflow-y-auto flex-1">
                    {phenomena.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">
                        No phenomena found
                      </div>
                    ) : (
                      phenomena.map(function(phenomenon) {
                        var isSelected = selectedPhenomenon?.id === phenomenon.id;
                        var cfg = categoryConfig[phenomenon.category];
                        var badges = getPhenomenonBadges(phenomenon);

                        return (
                          <button
                            key={phenomenon.id}
                            onClick={function() { setSelectedPhenomenon(phenomenon); }}
                            className={classNames(
                              'w-full text-left p-4 border-b border-gray-800 transition-colors hover:bg-gray-800/50',
                              isSelected ? 'bg-purple-900/30 border-l-2 border-l-purple-500' : ''
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {phenomenon.primary_image_url ? (
                                <img
                                  src={phenomenon.primary_image_url}
                                  alt={phenomenon.name}
                                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                                  <Image className="w-5 h-5 text-gray-600" />
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{cfg?.icon}</span>
                                  <h3 className="font-medium text-white truncate">{phenomenon.name}</h3>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {badges.map(function(badge) {
                                    return (
                                      <span
                                        key={badge.text}
                                        className={classNames('text-xs px-2 py-0.5 rounded', badge.color)}
                                      >
                                        {badge.text}
                                      </span>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {phenomenon.media_count} items
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Panel - Detail View */}
              <div className="lg:col-span-2">
                {selectedPhenomenon ? (
                  <div className="space-y-6">
                    {/* Phenomenon Header */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                      <div className="flex items-start gap-4 mb-4">
                        {selectedPhenomenon.primary_image_url ? (
                          <img
                            src={selectedPhenomenon.primary_image_url}
                            alt={selectedPhenomenon.name}
                            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <Image className="w-10 h-10 text-gray-600" />
                          </div>
                        )}

                        <div className="flex-1">
                          <h2 className="text-2xl font-bold text-white mb-2">{selectedPhenomenon.name}</h2>
                          <p className="text-sm text-gray-400 mb-4">Current profile image: {selectedPhenomenon.primary_image_url ? 'Set' : 'None'}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded text-sm">
                              {selectedPhenomenon.media_count} total
                            </span>
                            <span className="px-3 py-1 bg-green-900/30 text-green-400 rounded text-sm">
                              {selectedPhenomenon.approved_count} approved
                            </span>
                            <span className="px-3 py-1 bg-yellow-900/30 text-yellow-400 rounded text-sm">
                              {selectedPhenomenon.pending_count} pending
                            </span>
                            <span className="px-3 py-1 bg-red-900/30 text-red-400 rounded text-sm">
                              {selectedPhenomenon.rejected_count} rejected
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Media Grid */}
                    {selectedPhenomenon.media_items.length > 0 ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Candidate Images</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedPhenomenon.media_items.map(function(media) {
                            return (
                              <div
                                key={media.id}
                                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-colors"
                              >
                                {/* Image */}
                                <div className="relative aspect-video bg-gray-800 overflow-hidden">
                                  <img
                                    src={media.thumbnail_url || media.url}
                                    alt={media.caption || 'Media'}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>

                                {/* Info */}
                                <div className="p-4 space-y-3">
                                  {/* Badge */}
                                  <div className="flex items-center justify-between">
                                    <span className={classNames('text-xs px-2 py-1 rounded', getMedioBadge(media))}>
                                      {media.status}
                                    </span>
                                    {media.is_profile && (
                                      <span className="text-xs px-2 py-1 rounded bg-purple-900/30 text-purple-400">
                                        Profile
                                      </span>
                                    )}
                                  </div>

                                  {/* Source & License */}
                                  {(media.source || media.license) && (
                                    <div className="text-xs text-gray-400 space-y-1">
                                      {media.source && <div>Source: {media.source}</div>}
                                      {media.license && <div>License: {media.license}</div>}
                                    </div>
                                  )}

                                  {/* AI Confidence */}
                                  <div className="space-y-1">
                                    <div className="text-xs text-gray-400">AI Confidence</div>
                                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all"
                                        style={{ width: media.ai_confidence * 100 + '%' }}
                                      ></div>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {(media.ai_confidence * 100).toFixed(1)}%
                                    </div>
                                  </div>

                                  {/* Caption */}
                                  {media.caption && (
                                    <div className="text-xs text-gray-300 line-clamp-2">
                                      {media.caption}
                                    </div>
                                  )}

                                  {/* Actions */}
                                  <div className="flex gap-2 pt-2">
                                    <button
                                      onClick={function() { handleApprove(media.id); }}
                                      className="flex-1 px-3 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                    >
                                      <Check className="w-4 h-4" />
                                      Approve
                                    </button>
                                    <button
                                      onClick={function() { handleReject(media.id); }}
                                      className="flex-1 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                    >
                                      <X className="w-4 h-4" />
                                      Reject
                                    </button>
                                  </div>

                                  <button
                                    onClick={function() { handleSetAsProfile(media.id); }}
                                    className="w-full px-3 py-2 bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Download className="w-4 h-4" />
                                    Set as Profile
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                        <Image className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 mb-2">No candidate images</p>
                        <p className="text-gray-500 text-sm">Upload images or search Wikimedia to get started.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <p className="text-gray-400">Select a phenomenon to view candidates</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
