import React, { useState, useEffect, useRef } from 'react'
import { getDistricts, searchLocation, getWeatherForecast } from '../services/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const DISEASES = ['Leaf Blast', 'Brown Spot', 'BLB', 'Tungro']

const RISK_CONFIG = {
  Low:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  Medium: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 ring-amber-200'   },
  High:   { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700 ring-red-200'         },
}

function getWeatherIcon(rainfall, humidity) {
  if (rainfall > 10) return '⛈'
  if (rainfall > 2)  return '🌧'
  if (humidity > 85) return '🌫'
  if (humidity > 70) return '⛅'
  return '☀'
}

function getOverallRisk(diseases) {
  const risks = Object.values(diseases).map(d => d.risk)
  if (risks.includes('High'))   return 'High'
  if (risks.includes('Medium')) return 'Medium'
  return 'Low'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskBadge({ risk, size = 'sm' }) {
  const cfg = RISK_CONFIG[risk] ?? RISK_CONFIG.Low
  const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${sizeClass} ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {risk}
    </span>
  )
}

function StatPill({ icon, value, label }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base">{icon}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function DayCard({ day, isToday }) {
  const date      = new Date(day.date)
  const label     = isToday
    ? 'Today'
    : date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
  const w         = day.weather
  const overRisk  = getOverallRisk(day.diseases)
  const cfg       = RISK_CONFIG[overRisk]

  return (
    <div className={`
      relative flex-shrink-0 w-44 rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-200
      ${isToday
        ? 'bg-gradient-to-b from-green-600 to-green-700 border-green-500 shadow-lg shadow-green-200 scale-[1.03]'
        : 'bg-white border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'}
    `}>
      {/* Date label */}
      <p className={`text-[10px] font-bold uppercase tracking-widest ${isToday ? 'text-green-200' : 'text-gray-400'}`}>
        {label}
      </p>

      {/* Temperature + icon */}
      {w && (
        <div className="flex items-start justify-between">
          <div>
            <p className={`text-2xl font-bold leading-none ${isToday ? 'text-white' : 'text-gray-800'}`}>
              {Math.round(w.temp_max)}°
            </p>
            <p className={`text-xs mt-0.5 ${isToday ? 'text-green-200' : 'text-gray-400'}`}>
              /{Math.round(w.temp_min)}°C
            </p>
          </div>
          <span className="text-2xl">{getWeatherIcon(w.rainfall, w.humidity)}</span>
        </div>
      )}

      {/* Micro stats */}
      {w && (
        <div className={`flex gap-2 text-[11px] ${isToday ? 'text-green-100' : 'text-gray-500'}`}>
          <span>💧{Math.round(w.humidity)}%</span>
          <span>🌧{w.rainfall.toFixed(1)}mm</span>
        </div>
      )}

      {/* Overall risk */}
      {isToday ? (
        <span className={`self-start text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white`}>
          {overRisk} Risk
        </span>
      ) : (
        <RiskBadge risk={overRisk} size="xs" />
      )}

      {/* Disease breakdown */}
      <div className="space-y-1.5 pt-1 border-t border-white/10">
        {DISEASES.map(d => {
          const r = day.diseases[d]
          return (
            <div key={d} className="flex items-center justify-between gap-1">
              <span className={`text-[10px] truncate ${isToday ? 'text-green-100' : 'text-gray-500'}`}>{d}</span>
              <span className={`text-[10px] font-semibold shrink-0 ${
                isToday
                  ? r.risk === 'High' ? 'text-red-300' : r.risk === 'Medium' ? 'text-yellow-300' : 'text-green-300'
                  : RISK_CONFIG[r.risk]?.text
              }`}>{r.risk}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Error boundary
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError)
      return (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600 flex items-center gap-2">
          <span>⚠️</span> Something went wrong loading the forecast. Please refresh.
        </div>
      )
    return this.props.children
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeatherForecast() {
  const [districts, setDistricts]         = useState([])
  const [mode, setMode]                   = useState('district')
  const [selected, setSelected]           = useState('Thanjavur')
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [forecast, setForecast]           = useState(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [searching, setSearching]         = useState(false)
  const searchTimer                       = useRef(null)
  const searchRef                         = useRef(null)

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    getDistricts()
      .then(d => { setDistricts(d); loadForecast({ district: 'Thanjavur' }) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (mode !== 'search' || searchQuery.length < 2) { setSearchResults([]); return }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try { setSearchResults(await searchLocation(searchQuery)) }
      catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 500)
  }, [searchQuery, mode])

  async function loadForecast(params) {
    setLoading(true)
    setError(null)
    try {
      setForecast(await getWeatherForecast(params))
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load forecast. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleDistrictChange(e) {
    const d = e.target.value
    setSelected(d)
    if (d) loadForecast({ district: d })
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported on this device'); return }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => loadForecast({ lat: pos.coords.latitude, lon: pos.coords.longitude, location: 'My Location' }),
      ()  => { setError('GPS access denied. Please allow location permission.'); setLoading(false) }
    )
  }

  function handleSearchSelect(r) {
    setSearchQuery(r.name)
    setSearchResults([])
    loadForecast({ lat: r.lat, lon: r.lon, location: r.name })
  }

  const today = forecast?.forecast?.[0]

  const MODE_TABS = [
    { key: 'district', icon: '🗺', label: 'District' },
    { key: 'gps',      icon: '📍', label: 'GPS'      },
    { key: 'search',   icon: '🔍', label: 'Search'   },
  ]

  return (
    <ErrorBoundary>
      <div className="space-y-5 font-sans">

        {/* ── Location Selector ── */}
        <div className="space-y-3">
          {/* Mode tabs */}
          <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
            {MODE_TABS.map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${mode === key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* District picker */}
          {mode === 'district' && (
            <select
              value={selected}
              onChange={handleDistrictChange}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {districts.map(d => (
                <option key={d.name} value={d.name}>{d.name}, {d.state}</option>
              ))}
            </select>
          )}

          {/* GPS button */}
          {mode === 'gps' && (
            <button
              onClick={handleGPS}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Detecting location…
                </>
              ) : (
                <> 📍 Use My Current Location </>
              )}
            </button>
          )}

          {/* Search input */}
          {mode === 'search' && (
            <div className="relative" ref={searchRef}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search any city or location…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-8 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {searching && (
                <svg className="animate-spin absolute right-3 top-3 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
              {searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearchSelect(r)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <span className="text-gray-400">📍</span> {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-green-600">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm font-medium text-gray-500">Loading forecast…</p>
          </div>
        )}

        {/* ── Forecast body ── */}
        {forecast && !loading && (
          <div className="space-y-5">

            {/* Stale data banner */}
            {forecast.is_fallback && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
                <span>⚠️</span> Live weather unavailable — showing estimated data
              </div>
            )}

            {/* Location header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1.5">
                  <span className="text-green-600">📍</span> {forecast.location}
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">XGBoost Model · 7-Day Disease Risk Outlook</p>
              </div>
              <p className="text-[11px] text-gray-400">
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            {/* Today hero card */}
            {today?.weather && (
              <div className="rounded-2xl bg-gradient-to-br from-green-600 via-green-600 to-green-700 p-5 text-white shadow-lg shadow-green-100">
                <p className="text-[10px] font-bold text-green-200 uppercase tracking-widest mb-4">Today's Overview</p>

                <div className="flex items-start justify-between">
                  {/* Temp */}
                  <div className="flex items-center gap-3">
                    <span className="text-5xl leading-none">
                      {getWeatherIcon(today.weather.rainfall, today.weather.humidity)}
                    </span>
                    <div>
                      <p className="text-5xl font-bold leading-none">{Math.round(today.weather.temp_max)}°</p>
                      <p className="text-green-200 text-sm mt-1">Low {Math.round(today.weather.temp_min)}°C</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-x-5 gap-y-2 text-right">
                    <StatPill icon="💧" value={`${Math.round(today.weather.humidity)}%`}   label="Humidity" />
                    <StatPill icon="🌧" value={`${today.weather.rainfall.toFixed(1)}mm`}   label="Rain"     />
                    <StatPill icon="💨" value={`${Math.round(today.weather.wind_speed)}km/h`} label="Wind"  />
                  </div>
                </div>

                {/* Disease risk grid */}
                <div className="mt-5 grid grid-cols-4 gap-2">
                  {DISEASES.map(d => {
                    const r = today.diseases[d]
                    const textColor = r.risk === 'High' ? 'text-red-300' : r.risk === 'Medium' ? 'text-yellow-300' : 'text-green-300'
                    return (
                      <div key={d} className="bg-white/15 rounded-xl p-2.5 text-center backdrop-blur-sm">
                        <p className="text-[10px] text-green-100 truncate font-medium">{d}</p>
                        <p className={`text-sm font-bold mt-1 ${textColor}`}>{r.risk}</p>
                        <p className="text-[9px] text-green-200/70 mt-0.5">{Math.round(r.confidence * 100)}% conf</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 7-day forecast strip */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">7-Day Forecast</p>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-0.5 px-0.5"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {forecast.forecast.map((day, i) => (
                  <DayCard key={day.date} day={day} isToday={i === 0} />
                ))}
              </div>
            </div>

            {/* Risk legend */}
            <div className="flex items-center gap-4 text-[11px] text-gray-400 pt-1">
              {['Low', 'Medium', 'High'].map(r => (
                <span key={r} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${RISK_CONFIG[r].dot}`} />
                  {r}
                </span>
              ))}
              <span className="ml-auto">conf = model confidence</span>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  )
}