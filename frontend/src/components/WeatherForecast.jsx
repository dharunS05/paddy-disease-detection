import { useState, useEffect, useRef } from 'react'
import { getDistricts, searchLocation, getWeatherForecast } from '../services/api'

const RISK_STYLE = {
  Low:    'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  High:   'bg-red-100 text-red-700 border-red-200',
}
const RISK_ICON  = { Low: '🟢', Medium: '🟡', High: '🔴' }
const DISEASES   = ['Leaf Blast', 'Brown Spot', 'BLB', 'Tungro']

function WeatherCard({ day, isToday }) {
  const date   = new Date(day.date)
  const label  = isToday ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
  const temp   = day.weather
  const risks  = Object.entries(day.diseases)
  const maxRisk = risks.some(([,v]) => v.risk === 'High')
    ? 'High' : risks.some(([,v]) => v.risk === 'Medium') ? 'Medium' : 'Low'

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-3 min-w-[160px]
      ${isToday ? 'bg-primary text-white border-primary shadow-lg scale-105' : 'bg-white border-gray-100 shadow-sm'}`}>

      {/* Date */}
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-green-200' : 'text-gray-400'}`}>
          {label}
        </p>
      </div>

      {/* Weather info */}
      {temp && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getWeatherIcon(temp.rainfall, temp.humidity)}</span>
            <div>
              <p className={`text-xl font-bold leading-none ${isToday ? 'text-white' : 'text-gray-800'}`}>
                {Math.round(temp.temp_max)}°
                <span className={`text-sm font-normal ml-1 ${isToday ? 'text-green-200' : 'text-gray-400'}`}>
                  / {Math.round(temp.temp_min)}°C
                </span>
              </p>
            </div>
          </div>
          <div className={`flex gap-3 text-xs ${isToday ? 'text-green-100' : 'text-gray-500'}`}>
            <span>💧 {Math.round(temp.humidity)}%</span>
            <span>🌧 {temp.rainfall.toFixed(1)}mm</span>
            <span>💨 {Math.round(temp.wind_speed)}km/h</span>
          </div>
        </div>
      )}

      {/* Overall risk badge */}
      <div className={`flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 w-fit
        ${isToday
          ? 'bg-white/20 text-white'
          : RISK_STYLE[maxRisk]}`}>
        {RISK_ICON[maxRisk]} {maxRisk} Risk
      </div>

      {/* Per-disease risks */}
      <div className="space-y-1">
        {DISEASES.map(d => {
          const r = day.diseases[d]
          return (
            <div key={d} className="flex justify-between items-center text-xs">
              <span className={`truncate max-w-[90px] ${isToday ? 'text-green-100' : 'text-gray-500'}`}>
                {d}
              </span>
              <span className={`text-xs font-medium ${
                isToday
                  ? r.risk === 'High' ? 'text-red-300' : r.risk === 'Medium' ? 'text-yellow-300' : 'text-green-300'
                  : r.risk === 'High' ? 'text-red-600' : r.risk === 'Medium' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {RISK_ICON[r.risk]} {r.risk}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getWeatherIcon(rainfall, humidity) {
  if (rainfall > 10) return '⛈️'
  if (rainfall > 2)  return '🌧️'
  if (humidity > 85) return '🌫️'
  if (humidity > 70) return '⛅'
  return '☀️'
}

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

 useEffect(() => {
  getDistricts().then(setDistricts).catch(() => {})
  pollUntilReady()
}, [])

async function pollUntilReady() {
  setLoading(true)
  // Poll /api/weather/ready every 3 seconds until model loaded
  for (let i = 0; i < 20; i++) {
    try {
      const resp = await fetch('/api/weather/ready')
      const data = await resp.json()
      if (data.ready) {
        loadForecast({ district: 'Thanjavur' })
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, 3000))
  }
  setError('Weather model took too long to load. Please refresh.')
  setLoading(false)
}

  async function loadForecast(params) {
    setLoading(true); setError(null)
    try {
      const data = await getWeatherForecast(params)
      // merge weather info into forecast days
      setForecast(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Forecast failed')
    }
    setLoading(false)
  }

  function handleDistrictChange(e) {
    const d = e.target.value
    setSelected(d)
    if (d) loadForecast({ district: d })
  }

  function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported'); return }
    setLoading(true); setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => loadForecast({ lat: pos.coords.latitude, lon: pos.coords.longitude, location: 'My Location' }),
      ()  => { setError('GPS permission denied'); setLoading(false) }
    )
  }

  function handleSearchSelect(r) {
    setSearchQuery(r.name); setSearchResults([])
    loadForecast({ lat: r.lat, lon: r.lon, location: r.name })
  }

  const today = forecast?.forecast?.[0]

  return (
    <div className="space-y-5">

      {/* Location selector */}
      <div className="flex flex-col gap-3">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {[['district','🗺️ District'],['gps','📍 GPS'],['search','🔍 Search']].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-2 text-sm font-medium transition-colors
                ${mode === m ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-green-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'district' && (
          <select value={selected} onChange={handleDistrictChange}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
            {districts.map(d => <option key={d.name} value={d.name}>{d.name}, {d.state}</option>)}
          </select>
        )}

        {mode === 'gps' && (
          <button onClick={handleGPS} disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
            {loading ? '⏳ Fetching...' : '📍 Use My Current Location'}
          </button>
        )}

        {mode === 'search' && (
          <div className="relative">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search any location..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            {searching && <p className="text-xs text-gray-400 mt-1 px-1">Searching...</p>}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 border-b border-gray-100 last:border-0">
                    📍 {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">⚠️ {error}</div>}

      {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-primary">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
    <p className="text-sm font-medium">Loading weather model...</p>
    <p className="text-xs text-gray-400">Downloading from HuggingFace, please wait</p>
  </div>
)}

      {forecast && !loading && (
        <>
          {/* Location + model info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">📍 {forecast.location}</p>
              <p className="text-xs text-gray-400">XGBoost + TCN Ensemble · 7-Day Outlook</p>
            </div>
            {today && (
              <div className="text-right text-xs text-gray-500">
                <p>Updated: {new Date().toLocaleDateString('en-IN')}</p>
              </div>
            )}
          </div>

          {/* Today highlight */}
          {today && today.weather && (
            <div className="bg-gradient-to-r from-primary to-green-400 rounded-2xl p-5 text-white">
              <p className="text-green-200 text-xs font-semibold uppercase tracking-wide mb-2">Today's Overview</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-5xl">{getWeatherIcon(today.weather.rainfall, today.weather.humidity)}</span>
                  <div>
                    <p className="text-4xl font-bold">{Math.round(today.weather.temp_max)}°C</p>
                    <p className="text-green-200 text-sm">Low {Math.round(today.weather.temp_min)}°C</p>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-sm">💧 Humidity: {Math.round(today.weather.humidity)}%</p>
                  <p className="text-sm">🌧 Rain: {today.weather.rainfall.toFixed(1)}mm</p>
                  <p className="text-sm">💨 Wind: {Math.round(today.weather.wind_speed)} km/h</p>
                </div>
              </div>
              {/* Today disease risks */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {DISEASES.map(d => (
                  <div key={d} className="bg-white/20 rounded-xl p-2 text-center">
                    <p className="text-xs text-green-100 truncate">{d}</p>
                    <p className={`text-sm font-bold mt-0.5 ${
                      today.diseases[d].risk === 'High' ? 'text-red-300'
                      : today.diseases[d].risk === 'Medium' ? 'text-yellow-300'
                      : 'text-green-300'}`}>
                      {RISK_ICON[today.diseases[d].risk]} {today.diseases[d].risk}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7-day scroll */}
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-3">📅 7-Day Forecast</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {forecast.forecast.map((day, i) => (
                <WeatherCard key={day.date} day={day} isToday={i === 0} />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-400 px-1">
            <span>🟢 Low</span><span>🟡 Medium</span><span>🔴 High</span>
            <span className="ml-auto">% = model confidence</span>
          </div>
        </>
      )}
    </div>
  )
}
