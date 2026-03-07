import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface CryptidItem {
  id: string;
  slug: string;
  name: string;
  primary_image_url: string | null;
  profile_review_status: string | null;
  category: string;
  aliases: string[] | null;
  wikipedia_source: string | null;
  confidence: number | null;
}

interface MediaRow {
  id: string;
  phenomenon_id: string;
  original_url: string;
  thumbnail_url: string | null;
  source: string;
  source_url: string | null;
  ai_confidence: number | null;
  ai_search_query: string | null;
  status: string;
  caption: string | null;
  is_profile: boolean;
}

type ReviewFilter = 'all' | 'unreviewed' | 'approved' | 'denied' | 'no_image';
type ConfidenceTier = 'all' | 'high' | 'medium' | 'low';

export default function CryptidImageReview() {
  var cryptidsState = useState([] as CryptidItem[]);
  var cryptids = cryptidsState[0];
  var setCryptids = cryptidsState[1];

  var loadingState = useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var filterState = useState('unreviewed' as ReviewFilter);
  var filter = filterState[0];
  var setFilter = filterState[1];

  var tierState = useState('all' as ConfidenceTier);
  var tier = tierState[0];
  var setTier = tierState[1];

  var searchState = useState('');
  var search = searchState[0];
  var setSearch = searchState[1];

  var statsState = useState({ total: 0, withImage: 0, noImage: 0, approved: 0, denied: 0, unreviewed: 0 });
  var stats = statsState[0];
  var setStats = statsState[1];

  var processingState = useState({} as Record<string, boolean>);
  var processing = processingState[0];
  var setProcessing = processingState[1];

  var wikiRunningState = useState(false);
  var wikiRunning = wikiRunningState[0];
  var setWikiRunning = wikiRunningState[1];

  var wikiProgressState = useState('');
  var wikiProgress = wikiProgressState[0];
  var setWikiProgress = wikiProgressState[1];

  var toastState = useState(null as { message: string; type: string } | null);
  var toast = toastState[0];
  var setToast = toastState[1];

  var pageState = useState(0);
  var page = pageState[0];
  var setPage = pageState[1];

  var PAGE_SIZE = 24;

  function getAuthHeaders(): Record<string, string> {
    // Check localStorage first (modern Supabase default)
    try {
      for (var k = 0; k < localStorage.length; k++) {
        var key = localStorage.key(k);
        if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') > -1) {
          var raw = localStorage.getItem(key);
          if (raw) {
            var tokenData = JSON.parse(raw);
            if (tokenData && tokenData.access_token) {
              return {
                'Authorization': 'Bearer ' + tokenData.access_token,
                'Content-Type': 'application/json'
              };
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Fallback: check cookies
    var allCookies = document.cookie.split(';');
    for (var i = 0; i < allCookies.length; i++) {
      var c = allCookies[i].trim();
      if (c.indexOf('sb-') === 0 && c.indexOf('-auth-token') > -1) {
        var val = c.substring(c.indexOf('=') + 1);
        try {
          var parsed = JSON.parse(decodeURIComponent(val));
          if (parsed && parsed.access_token) {
            return {
              'Authorization': 'Bearer ' + parsed.access_token,
              'Content-Type': 'application/json'
            };
          }
        } catch (e2) { /* ignore */ }
      }
    }

    return { 'Content-Type': 'application/json' };
  }

  var loadCryptids = useCallback(function() {
    setLoading(true);
    var supabase = createClient(supabaseUrl, supabaseAnonKey);

    supabase
      .from('phenomena')
      .select('id, slug, name, primary_image_url, profile_review_status, category, aliases')
      .eq('category', 'cryptids')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .range(0, 5000)
      .then(function(result) {
        if (result.error) {
          console.error('Failed to load cryptids:', result.error);
          setLoading(false);
          return;
        }

        var data = (result.data || []) as CryptidItem[];

        var s = { total: data.length, withImage: 0, noImage: 0, approved: 0, denied: 0, unreviewed: 0 };
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (item.primary_image_url) {
            s.withImage++;
          } else {
            s.noImage++;
          }
          if (item.profile_review_status === 'approved') s.approved++;
          else if (item.profile_review_status === 'denied') s.denied++;
          else s.unreviewed++;
        }

        setStats(s);
        setCryptids(data);
        setLoading(false);
      });
  }, []);

  useEffect(function() {
    loadCryptids();
  }, [loadCryptids]);

  function showToast(message: string, type: string) {
    setToast({ message: message, type: type });
    setTimeout(function() { setToast(null); }, 3000);
  }

  function handleReview(phenomenonId: string, action: 'approved' | 'denied') {
    var newProcessing = Object.assign({}, processing);
    newProcessing[phenomenonId] = true;
    setProcessing(newProcessing);

    var headers = getAuthHeaders();
    var apiAction = action === 'approved' ? 'approve-profile' : 'deny-profile';

    fetch('/api/admin/phenomena/media-review', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ phenomenon_id: phenomenonId, action: apiAction })
    })
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        if (data.error) {
          showToast('Error: ' + data.error, 'error');
        } else {
          // Update local state
          var updated = cryptids.map(function(c) {
            if (c.id === phenomenonId) {
              return Object.assign({}, c, {
                profile_review_status: action,
                primary_image_url: action === 'denied' ? null : c.primary_image_url
              });
            }
            return c;
          });
          setCryptids(updated);

          // Update stats
          var newStats = Object.assign({}, stats);
          newStats.unreviewed = Math.max(0, newStats.unreviewed - 1);
          if (action === 'approved') {
            newStats.approved++;
          } else {
            newStats.denied++;
            newStats.withImage = Math.max(0, newStats.withImage - 1);
            newStats.noImage++;
          }
          setStats(newStats);

          showToast(action === 'approved' ? 'Approved!' : 'Denied', action === 'approved' ? 'success' : 'info');
        }

        var cleared = Object.assign({}, processing);
        delete cleared[phenomenonId];
        setProcessing(cleared);
      })
      .catch(function(err) {
        showToast('Network error', 'error');
        var cleared = Object.assign({}, processing);
        delete cleared[phenomenonId];
        setProcessing(cleared);
      });
  }

  function runWikipediaLookup(replaceExisting: boolean) {
    setWikiRunning(true);
    setWikiProgress('Starting Wikipedia lookup...');

    var headers = getAuthHeaders();
    var offset = 0;
    var batchSize = 15;
    var totalFound = 0;
    var totalProcessed = 0;

    function processBatch() {
      fetch('/api/admin/phenomena/wikipedia-image-lookup', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          category: 'cryptids',
          batch_size: batchSize,
          offset: offset,
          replace_existing: replaceExisting
        })
      })
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          if (data.error) {
            setWikiProgress('Error: ' + data.error);
            setWikiRunning(false);
            return;
          }

          totalFound = totalFound + (data.summary.found || 0);
          totalProcessed = totalProcessed + (data.summary.batch_size || 0);

          setWikiProgress(
            'Processed ' + totalProcessed + ' / ' + data.summary.total_targets +
            ' | Found ' + totalFound + ' Wikipedia images'
          );

          if (data.summary.has_more) {
            offset = data.summary.next_offset;
            // Small delay to not hammer the API
            setTimeout(processBatch, 1000);
          } else {
            setWikiProgress(
              'Done! Found ' + totalFound + ' Wikipedia images across ' + totalProcessed + ' cryptids.'
            );
            setWikiRunning(false);
            // Reload data
            loadCryptids();
          }
        })
        .catch(function(err) {
          setWikiProgress('Network error: ' + err.message);
          setWikiRunning(false);
        });
    }

    proce             'Content-Type': 'application/json'
              };
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Fallback: check cookies
    var allCookies = document.cookie.split(';');
    for (var i = 0; i < allCookies.length; i++) {
      var c = allCookies[i].trim();
      if (c.indexOf('sb-') === 0 && c.indexOf('-auth-token') > -1) {
        var val = c.substring(c.indexOf('=') + 1);
        try {
          var parsed = JSON.parse(decodeURIComponent(val));
          if (parsed && parsed.access_token) {
            return {
              'Authorization': 'Bearer ' + parsed.access_token,
              'Content-Type': 'application/json'
            };
          }
        } catch (e2) { /* ignore */ }
      }
    }

    return { 'Content-Type': 'application/json' };
  }

  var loadCryptids = useCallback(function() {
    setLoading(true);
    var supabase = createClient(supabaseUrl, supabaseAnonKey);

    supabase
      .from('phenomena')
      .select('id, slug, name, primary_image_url, profile_review_status, category, aliases')
      .eq('category', 'cryptids')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .range(0, 5000)
      .then(function(result) {
        if (result.error) {
          console.error('Failed to load cryptids:', result.error);
          setLoading(false);
          return;
        }

        var data = (result.data || []) as CryptidItem[];

        var s = { total: data.length, withImage: 0, noImage: 0, approved: 0, denied: 0, unreviewed: 0 };
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (item.primary_image_url) {
            s.withImage++;
          } else {
            s.noImage++;
          }
          if (item.profile_review_status === 'approved') s.approved++;
          else if (item.profile_review_status === 'denied') s.denied++;
          else s.unreviewed++;
        }

        setStats(s);
        setCryptids(data);
        setLoading(false);
      });
  }, []);

  useEffect(function() {
    loadCryptids();
  }, [loadCryptids]);

  function showToast(message: string, type: string) {
    setToast({ message: message, type: type });
    setTimeout(function() { setToast(null); }, 3000);
  }

  function handleReview(phenomenonId: string, action: 'approved' | 'denied') {
    var newProcessing = Object.assign({}, processing);
    newProcessing[phenomenonId] = true;
    setProcessing(newProcessing);

    var headers = getAuthHeaders();
    var apiAction = action === 'approved' ? 'approve-profile' : 'deny-profile';

    fetch('/api/admin/phenomena/media-review', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ phenomenon_id: phenomenonId, action: apiAction })
    })
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        if (data.error) {
          showToast('Error: ' + data.error, 'error');
        } else {
          // Update local state
          var  },
            { label: 'No Image', value: stats.noImage, color: '#f59e0b' },
            { label: 'Approved', value: stats.approved, color: '#22c55e' },
            { label: 'Denied', value: stats.denied, color: '#ef4444' },
            { label: 'Unreviewed', value: stats.unreviewed, color: '#a78bfa' }
          ].map(function(stat) {
            return (
              <div key={stat.label} style={{
                backgroundColor: '#1a1a2e',
                border: '1px solid #2a2a4a',
                borderRadius: '8px',
                padding: '12px 20px',
                textAlign: 'center',
                minWidth: '100px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Wikipedia Lookup Controls */}
        <div style={{
          backgroundColor: '#1a1a2e',
          border: '1px solid #2a2a4a',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>Wikipedia Lookup:</span>
            <button
              onClick={function() { runWikipediaLookup(false); }}
              disabled={wikiRunning}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: wikiRunning ? '#444' : '#3b82f6',
                color: 'white',
                cursor: wikiRunning ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {wikiRunning ? 'Running...' : 'Search Missing Images'}
            </button>
            <button
              onClick={function() { runWikipediaLookup(true); }}
              disabled={wikiRunning}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #f59e0b',
                backgroundColor: 'transparent',
                color: '#f59e0b',
                cursor: wikiRunning ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              Re-search All Unreviewed
            </button>
            {wikiProgress && (
              <span style={{ color: '#60a5fa', fontSize: '14px' }}>{wikiProgress}</span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>Filter:</span>
          {(['all', 'unreviewed', 'no_image', 'approved', 'denied'] as ReviewFilter[]).map(function(f) {
            var labels: Record<string, string> = {
              all: 'All',
              unreviewed: 'Unreviewed',
              no_image: 'No Image',
              approved: 'Approved',
              denied: 'Denied'
            };
            return (
              <button
                key={f}
                onClick={function() { setFilter(f); setPage(0); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: filter === f ? '2px solid #818cf8' : '1px solid #444',
                  backgroundColor: filter === f ? '#2a2a5a' : 'transparent',
                  color: filter === f ? '#c4b5fd' : '#888',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: filter === f ? 'bold' : 'normal'
                }}
              >
                {labels[f] || f}
              </button>
            );
          })}

          <div style={{ marginLeft: 'auto' }}>
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={function(e) { setSearch(e.target.value); setPage(0); }}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #444',
                backgroundColor: '#1a1a2e',
                color: '#e0e0e0',
                width: '220px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        {/* Results count and pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>
            Showing {paged.length} of {filtered.length} cryptids
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={function() { setPage(Math.max(0, page - 1)); }}
                disabled={page === 0}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #444',
                  backgroundColor: 'transparent',
                  color: page === 0 ? '#444' : '#e0e0e0',
                  cursor: page === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Prev
              </button>
              <span style={{ color: '#888', fontSize: '14px' }}>
                Page {page + 1} / {totalPages}
              </span>
              <button
                onClick={function() { setPage(Math.min(totalPages - 1, page + 1)); }}
                disabled={page >= totalPages - 1}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #444',
                  backgroundColor: 'transparent',
                  color: page >= totalPages - 1 ? '#444' : '#e0e0e0',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: '#888' }}>
            Loading cryptids...
          </div>
        )}

        {/* Image Grid */}
        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {paged.map(function(cryptid) {
              var isProcessing = processing[cryptid.id];
              var borderColor = cryptid.profile_review_status === 'approved'
                ? '#22c55e'
                : cryptid.profile_review_status === 'denied'
                  ? '#ef4444'
                  : '#2a2a4a';

              return (
                <div
                  key={cryptid.id}
                  style={{
                    backgroundColor: '#1a1a2e',
                    border: '2px solid ' + borderColor,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    opacity: isProcessing ? 0.5 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Image */}
                  <div style={{
                    width: '100%',
                    height: '180px',
                    backgroundColor: '#0d0d1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {cryptid.primary_image_url ? (
                      <img
                        src={cryptid.primary_image_url}
                        alt={cryptid.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={function(e) {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ color: '#444', fontSize: '40px' }}>?</div>
                    )}

                    {/* Status badge */}
                    {cryptid.profile_review_status === 'approved' && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        &#10003;
                      </div>
                    )}
                    {cryptid.profile_review_status === 'denied' && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        &#10007;
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: '10px' }}>
                    <div style={{
                      fontWeight: 'bold',
                      fontSize: '13px',
                      marginBottom: '6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {cryptid.name}
                    </div>

                    {/* Action buttons */}
                    {cryptid.primary_image_url && cryptid.profile_review_status !== 'approved' && cryptid.profile_review_status !== 'denied' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={function() { handleReview(cryptid.id, 'approved'); }}
                          disabled={isProcessing}
                          style={{
                            flex: 1,
                            padding: '6px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#166534',
                            color: '#4ade80',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        >
                          &#10003; Approve
                        </button>
                        <button
                          onClick={function() { handleReview(cryptid.id, 'denied'); }}
                          disabled={isProcessing}
                          style={{
                            flex: 1,
                            padding: '6px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#7f1d1d',
                            color: '#f87171',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        >
                          &#10007; Deny
                        </button>
                      </div>
                    )}

                    {!cryptid.primary_image_url && (
                      <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic' }}>
                        No image found
                      </div>
                    )}

                    {cryptid.profile_review_status === 'approved' && (
                      <div style={{ color: '#4ade80', fontSize: '11px', fontWeight: 'bold' }}>
                        &#10003; Approved
                      </div>
                    )}
                    {cryptid.profile_review_status === 'denied' && (
                      <div style={{ color: '#f87171', fontSize: '11px', fontWeight: 'bold' }}>
                        &#10007; Denied
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && paged.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', color: '#666' }}>
            No cryptids match the current filters.
          </div>
        )}
      </div>
    </>
  );
}
