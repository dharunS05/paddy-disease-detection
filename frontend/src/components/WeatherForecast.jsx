import { useState, useEffect, useRef } from 'react'
import { getDistricts, searchLocation, getWeatherForecast } from '../services/api'

const RISK_STYLE = {
  Low:    'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  High:   'bg-red-100 text-red-700 border-red-200',
}
const RISK_ICON = { Low: '🟢', Medium: '🟡', High: '🔴' }

const DISEASES = ['Leaf Blast', 'Brown Spot', 'BLB', 'Tungro']

export default function WeatherForecast() {
  const [districts, setDistricts]   = useState([])
  const [mode, setMode]             = useState('district') // district | gps | search
  const [selected, setSelected]     = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [chosenLocation, setChosenLocation] = useState(null)
  const [forecast, setForecast]     = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [searching, setSearching]   = useState(false)
  const searchTimer                 = useRef(null)

  useEffect(() => {
    getDistricts().then(setDistricts).catch(() => {})
  }, [])

  // Debounced location search
  useEffect(() => {
    if (mode !== 'search' || searchQuery.length < 2) {
      setSearchResults([]); return
    }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchLocation(searchQuery)
        setSearchResults(results)
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 500)
  }, [searchQuery, mode])

  async function handleGPS() {
    if (!navigator.geolocation) { setError('GPS not supported'); return }
    setLoading(true); setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords
        setChosenLocation({ lat, lon, name: `GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})` })
        try {
          const data = await getWeatherForecast({ lat, lon, location: 'My Location' })
          setForecast(data)
        } catch (e) {
          setError(e?.response?.data?.detail || 'Forecast failed')
        }
        setLoading(false)
      },
      () => { setError('GPS permission denied'); setLoading(false) }
    )
  }

  async function handleDistrictFetch() {
    if (!selected) return
    setLoading(true); setError(null); setForecast(null)
    try {
      const data = await getWeatherForecast({ district: selected })
      setForecast(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Forecast failed')
    }
    setLoading(false)
  }

  async function handleSearchSelect(result) {
    setChosenLocation(result)
    setSearchResults([])
    setSearchQuery(result.name)
    setLoading(true); setError(null); setForecast(null)
    try {
      const data = await getWeatherForecast({ lat: result.lat, lon: result.lon, location: result.name })
      setForecast(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Forecast failed')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200">
        {[['district','🗺️ District'],['gps','📍 GPS'],['search','🔍 Search']].map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setForecast(null); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium transition-colors
              ${mode === m ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-green-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* District mode */}
      {mode === 'district' && (
        <div className="flex gap-2">
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
            <option value="">Select district...</option>
            {districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <button onClick={handleDistrictFetch} disabled={!selected || loading}
            className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
            {loading ? '⏳' : 'Forecast'}
          </button>
        </div>
      )}

      {/* GPS mode */}
      {mode === 'gps' && (
        <button onClick={handleGPS} disabled={loading}
          className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
          {loading ? '⏳ Fetching...' : '📍 Use My Current Location'}
        </button>
      )}

      {/* Search mode */}
      {mode === 'search' && (
        <div className="relative">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search any location (e.g. Thanjavur, Punjab...)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">⚠️ {error}</div>
      )}

      {/* Forecast table */}
      {forecast && <ForecastTable data={forecast} />}
    </div>
  )
}

function ForecastTable({ data }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🌦️</span>
        <div>
          <p className="font-semibold text-gray-800 text-sm">{data.location}</p>
          <p className="text-xs text-gray-400">7-Day Disease Risk Forecast · XGBoost + TCN Ensemble</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-gray-500 font-semibold">Date</th>
              {['Leaf Blast','Brown Spot','BLB','Tungro'].map(d => (
                <th key={d} className="px-3 py-2 text-center text-gray-500 font-semibold">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.forecast.map((day, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
                  {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                </td>
                {['Leaf Blast','Brown Spot','BLB','Tungro'].map(disease => {
                  const d = day.diseases[disease]
                  return (
                    <td key={disease} className="px-2 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${RISK_STYLE[d.risk]}`}>
                        {RISK_ICON[d.risk]} {d.risk}
                      </span>
                      <p className="text-gray-400 text-xs mt-0.5">{Math.round(d.confidence * 100)}%</p>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs text-gray-500 px-1">
        <span>🟢 Low risk</span>
        <span>🟡 Medium risk</span>
        <span>🔴 High risk</span>
        <span className="ml-auto">% = confidence</span>
      </div>
    </div>
  )
}
