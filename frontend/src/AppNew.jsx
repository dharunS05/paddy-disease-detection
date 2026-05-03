// src/AppNew.jsx — NEW FILE. Do NOT modify any existing file.
//
// ACTIVATION: change ONE line in src/main.jsx only:
//   import App from './AppNew'
//
// What this file provides:
//   Tab 1 — Home          : project overview (static, inline)
//   Tab 2 — Leaf Disease  : existing Upload + Result + GradCAM, 300 MB guard in handleUpload
//   Tab 3 — Single Risk   : same XGBoost API + same location selector as WeatherForecast.jsx,
//                           adds disease picker — shows only the chosen disease's 7-day strip
//   Tab 4 — All Disease   : existing WeatherForecast component, untouched
//   Tab 5 — Forecast      : Leaf Blast (Disease X) + Claude AI explanation
//
// 502 fix: GPS flow no longer calls getWeatherForecast with null/undefined params.
//          API is called only after coordinates are resolved.

import React, { useState, useEffect, useRef } from 'react'
import Upload          from './components/Upload'
import Result          from './components/Result'
import WeatherForecast from './components/WeatherForecast'
import { predictDisease, getDistricts, searchLocation, getWeatherForecast } from './services/api'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024   // 300 MB — enforced in handleUpload only

const TABS = [
  { id: 'home',     label: 'Home'                   },
  { id: 'leaf',     label: 'Paddy Disease Detection' },
  { id: 'single',   label: 'Single Disease Risk'     },
  { id: 'all',      label: 'All Disease Risk'        },
]
  //{ id: 'forecast', label: 'Weather Risk Forecast'   },


const WEATHER_DISEASES = ['Leaf Blast', 'Brown Spot', 'BLB', 'Tungro']

const RISK_CONFIG = {
  Low:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400', bar: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200', barW: '18%'  },
  Medium: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400',   bar: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 ring-amber-200',     barW: '55%'  },
  High:   { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-400',     bar: 'bg-red-400',     badge: 'bg-red-100 text-red-700 ring-red-200',           barW: '100%' },
}

function wxIcon(rain, hum) {
  if (rain > 10) return '⛈'
  if (rain > 2)  return '🌧'
  if (hum  > 85) return '🌫'
  if (hum  > 70) return '⛅'
  return '☀'
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: Spinner
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ size = 5, color = 'text-primary' }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} ${color}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: LocationSelector
// Mirrors the exact behaviour of WeatherForecast.jsx's location selector.
// Does NOT call getWeatherForecast internally — calls onLoad(params) only
// when valid params are available (never null/undefined → no 502).
// ─────────────────────────────────────────────────────────────────────────────

function LocationSelector({ onLoad, loading }) {
  const [mode,      setMode]      = useState('district')
  const [districts, setDistricts] = useState([])
  const [selected,  setSelected]  = useState('Thanjavur')
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [locErr,    setLocErr]    = useState(null)
  const timer  = useRef(null)
  const dropRef = useRef(null)

  // Load districts once
  useEffect(() => {
    getDistricts().then(d => setDistricts(d)).catch(() => {})
  }, [])

  // Close search dropdown on outside click
  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setResults([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Debounced location search
  useEffect(() => {
    if (mode !== 'search' || query.length < 2) { setResults([]); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSearching(true)
      try   { setResults(await searchLocation(query)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 500)
  }, [query, mode])

  function changeMode(m) { setMode(m); setLocErr(null); setResults([]) }

  function handleDistrict(e) {
    const d = e.target.value
    setSelected(d)
    if (d) onLoad({ district: d })   // always a valid string — no 502 risk
  }

  function handleGPS() {
    if (!navigator.geolocation) { setLocErr('GPS not supported on this device'); return }
    setLocErr(null)
    // ── 502 FIX: do NOT call onLoad here; wait until coordinates resolve ──
    navigator.geolocation.getCurrentPosition(
      pos => {
        onLoad({ lat: pos.coords.latitude, lon: pos.coords.longitude, location: 'My Location' })
      },
      () => setLocErr('GPS access denied. Please allow location permission.')
    )
  }

  function handleSearchSelect(r) {
    setQuery(r.name)
    setResults([])
    onLoad({ lat: r.lat, lon: r.lon, location: r.name })   // valid coords — no 502 risk
  }

  const MODE_TABS = [
    { key: 'district', icon: '🗺', label: 'District' },
    { key: 'gps',      icon: '📍', label: 'GPS'      },
    { key: 'search',   icon: '🔍', label: 'Search'   },
  ]

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
        {MODE_TABS.map(({ key, icon, label }) => (
          <button key={key} onClick={() => changeMode(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all
              ${mode === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{icon}</span> {label}
          </button>
        ))}
      </div>

      {/* District picker */}
      {mode === 'district' && (
        <select value={selected} onChange={handleDistrict}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">
          {districts.map(d => (
            <option key={d.name} value={d.name}>{d.name}, {d.state}</option>
          ))}
        </select>
      )}

      {/* GPS button */}
      {mode === 'gps' && (
        <button onClick={handleGPS} disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
          {loading
            ? <><Spinner size={4} color="text-white" /> Detecting location…</>
            : '📍 Use My Current Location'}
        </button>
      )}

      {/* Search input */}
      {mode === 'search' && (
        <div className="relative" ref={dropRef}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search any city or location…"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          {searching && (
            <span className="absolute right-3 top-3"><Spinner size={4} color="text-gray-400" /></span>
          )}
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {results.map((r, i) => (
                <button key={i} onClick={() => handleSearchSelect(r)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2 border-b border-gray-50 last:border-0 transition-colors">
                  <span className="text-gray-400">📍</span> {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {locErr && <p className="text-xs text-red-500">⚠️ {locErr}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: useForecast hook
// ─────────────────────────────────────────────────────────────────────────────

function useForecast(defaultDistrict = 'Thanjavur') {
  const [forecast, setForecast] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function load(params) {
    // Guard: never call API with null/undefined — this was the 502 root cause
    if (!params || (!params.district && params.lat == null)) return
    setLoading(true); setError(null)
    try   { setForecast(await getWeatherForecast(params)) }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to load forecast. Please try again.') }
    finally   { setLoading(false) }
  }

  useEffect(() => { load({ district: defaultDistrict }) }, [])

  return { forecast, loading, error, load }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: RiskMeter — big card showing today's risk for one disease
// ─────────────────────────────────────────────────────────────────────────────

function RiskMeter({ risk, confidence, diseaseName }) {
  const cfg = RISK_CONFIG[risk] ?? RISK_CONFIG.Low
  const pct = confidence != null ? Math.round(confidence * 100) : null
  return (
    <div className={`rounded-2xl border p-5 ${cfg.bg} ${cfg.border}`}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        {diseaseName} · Today's Risk
      </p>
      <div className="flex items-end justify-between mb-3">
        <p className={`text-4xl font-black ${cfg.text}`}>{risk}</p>
        {pct != null && <p className="text-xs text-gray-400">{pct}% confidence</p>}
      </div>
      <div className="h-2 rounded-full bg-white/70 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
          style={{ width: cfg.barW }} />
      </div>
      <p className={`text-xs mt-2 ${cfg.text}`}>
        {risk === 'High'   ? 'Immediate preventive action recommended.'
        : risk === 'Medium' ? 'Monitor closely — conditions are borderline.'
        :                    'Conditions are currently favourable.'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: SevenDayStrip — 7-day forecast for a single disease
// ─────────────────────────────────────────────────────────────────────────────

function SevenDayStrip({ forecast, diseaseName }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">
          7-Day Forecast — <span className="text-primary">{diseaseName}</span>
        </p>
        <p className="text-[11px] text-gray-400">{forecast.location}</p>
      </div>

      <div className="space-y-2">
        {forecast.forecast.map((day, i) => {
          const d   = day.diseases?.[diseaseName]
          const cfg = RISK_CONFIG[d?.risk] ?? RISK_CONFIG.Low
          const w   = day.weather
          const label = i === 0
            ? 'Today'
            : new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })

          return (
            <div key={day.date}
              className={`rounded-xl border px-4 py-2.5 flex items-center gap-3 transition-colors
                ${cfg.bg} ${cfg.border} ${i === 0 ? 'ring-1 ring-green-400/30' : ''}`}>
              {/* Date */}
              <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
              {/* Weather */}
              {w && (
                <span className="text-sm shrink-0">
                  {wxIcon(w.rainfall, w.humidity)} {Math.round(w.temp_max)}°
                </span>
              )}
              {/* Bar */}
              <div className="flex-1 h-1.5 rounded-full bg-white/70 overflow-hidden">
                <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: cfg.barW }} />
              </div>
              {/* Risk text */}
              <span className={`text-xs font-bold w-14 text-right shrink-0 ${cfg.text}`}>
                {d?.risk ?? '—'}
              </span>
              {/* Confidence */}
              {d?.confidence != null && (
                <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">
                  {Math.round(d.confidence * 100)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
        {['Low','Medium','High'].map(r => (
          <span key={r} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${RISK_CONFIG[r].dot}`} />
            {r}
          </span>
        ))}
        <span className="ml-auto">conf = model confidence</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — HOME (project overview, static)
// ─────────────────────────────────────────────────────────────────────────────

const HOME_DISEASES = [
  { name: 'Bacterial Leaf Blight',    pathogen: 'Xanthomonas oryzae pv. oryzae'    },
  { name: 'Bacterial Leaf Streak',    pathogen: 'Xanthomonas oryzae pv. oryzicola' },
  { name: 'Bacterial Panicle Blight', pathogen: 'Burkholderia glumae'               },
  { name: 'Brown Spot',               pathogen: 'Cochliobolus miyabeanus'            },
  { name: 'Dead Heart',               pathogen: 'Stem borer infestation'             },
  { name: 'Downy Mildew',             pathogen: 'Sclerophthora macrospora'           },
  { name: 'Hispa',                    pathogen: 'Dicladispa armigera (insect)'       },
  { name: 'Leaf Blast',               pathogen: 'Magnaporthe oryzae'                 },
  { name: 'Tungro',                   pathogen: 'Rice Tungro Bacilliform Virus'      },
  { name: 'Healthy Rice Leaf',        pathogen: '—'                                 },
]

const HOME_STACK = [
  { layer: 'Detection Model',  value: 'EfficientNetB3 (TensorFlow 2.x / Keras)'       },
  { layer: 'Forecast Model',   value: 'XGBoost via MultiOutputClassifier (joblib)'    },
  { layer: 'Model Registry',   value: 'HuggingFace Hub'                               },
  { layer: 'Backend API',      value: 'FastAPI 2.0 · Uvicorn · Pydantic'              },
  { layer: 'Frontend',         value: 'React 18 · Vite · TailwindCSS · Recharts'      },
  { layer: 'Weather Source',   value: 'Open-Meteo Archive & Forecast API'             },
  { layer: 'Explainability',   value: 'Grad-CAM (GradientTape · JET colourmap)'       },
  { layer: 'Deployment',       value: 'Docker Compose · Nginx reverse proxy · Ubuntu' },
]

function TabHome({ onGoto }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');
        .hp-serif { font-family:'DM Serif Display',serif; }
        .hp-mono  { font-family:'DM Mono',monospace; }
        .hp-table { width:100%; border-collapse:collapse; font-size:13px; }
        .hp-table th { font-family:'DM Mono',monospace; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#888; font-weight:500; padding:8px 12px; text-align:left; border-bottom:2px solid #e0e0da; background:#fafaf8; }
        .hp-table td { padding:9px 12px; border-bottom:1px solid #f0f0eb; color:#333; vertical-align:middle; }
        .hp-table tr:last-child td { border-bottom:none; }
        .hp-table tr:hover td { background:#fafaf8; }
        .hp-pc { background:#fff; border:1px solid #e0e0da; border-radius:10px; overflow:hidden; }
        .hp-ph { background:#1b4332; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; }
        .hp-pr { display:flex; gap:10px; padding:8px 18px; border-bottom:1px solid #f4f4f1; font-size:12.5px; }
        .hp-pr:last-child { border-bottom:none; }
        .hp-pk { font-family:'DM Mono',monospace; font-size:10px; color:#999; min-width:76px; text-transform:uppercase; letter-spacing:.04em; padding-top:2px; flex-shrink:0; }
        .hp-vt { font-family:'DM Mono',monospace; font-size:10px; color:#aaa; background:#f4f4f1; padding:2px 5px; border-radius:3px; margin-right:3px; display:inline-block; margin-bottom:2px; }
        .hp-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1px; background:#e0e0da; border:1px solid #e0e0da; border-radius:10px; overflow:hidden; }
        .hp-step { background:#fff; padding:20px 18px; }
      `}</style>

      {/* Hero */}
      <div className="bg-primary -mx-4 sm:-mx-6 px-6 py-10 mb-8 -mt-6">
        <p className="hp-mono text-[11px] tracking-widest uppercase text-green-400 mb-3">
          B.E. Computer Science &amp; Engineering · Batch 01 · April / May 2026
        </p>
        <h1 className="hp-serif text-white" style={{ fontSize:'clamp(22px,3.5vw,38px)', lineHeight:1.15, margin:'0 0 4px' }}>
          AI-Powered Paddy Disease Detection
        </h1>
        <p className="hp-serif text-green-300 mb-4" style={{ fontSize:'clamp(15px,2.5vw,26px)' }}>
          and Weather-Driven Risk Forecasting Using EfficientNetB3 and XGBoost
        </p>
        <p className="text-green-200 text-sm leading-relaxed max-w-xl mb-5">
          A dual-pipeline web application combining transfer learning–based image classification
          with meteorological risk forecasting to support Tamil Nadu smallholder farmers in
          early disease identification and outbreak preparedness.
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
          {['S Dharun · 822222104012','K Puvan · 822222104048','K Sriram · 822222104303',
            'Dr. S. Sridharan M.E., Ph.D. · HOD-CSE'].map(c => (
            <span key={c} className="hp-mono text-[11px] px-2 py-1 border border-green-600 rounded text-green-300 bg-green-900/40">{c}</span>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => onGoto('leaf')}
            className="bg-green-300 text-primary font-semibold text-sm px-5 py-2 rounded-lg hover:bg-green-200 transition-colors">
            Leaf Disease Detection
          </button>
          <button onClick={() => onGoto('forecast')}
            className="border border-green-600 text-green-200 font-medium text-sm px-5 py-2 rounded-lg hover:border-green-300 hover:text-white transition-colors">
            Weather Risk Forecast
          </button>
        </div>
      </div>

      {/* Dual Pipeline */}
      <div className="mb-8">
        <p className="hp-mono text-[10.5px] tracking-widest uppercase text-primary mb-1">System Architecture</p>
        <h2 className="hp-serif text-gray-800 text-xl mb-4">Dual-Pipeline AI System</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            {
              title:'Image-Based Disease Detection', model:'EfficientNetB3',
              rows:[
                ['Dataset',       'Pre-trained on ImageNet · Fine-tuned on Paddy Doctor Dataset'],
                ['Architecture',  'EfficientNetB3 → GlobalAvgPool2D → BatchNorm → Dense(256, ReLU) → Dropout(0.4) → Dense(10, Softmax)'],
                ['Training',      '3-phase progressive fine-tuning (head → top-100 layers → full end-to-end)'],
                ['Input',        '224 × 224 RGB · Batch size 32'],
                ['Output',       '10 disease / healthy classes · Softmax'],
                ['Explain',      'Grad-CAM spatial heatmaps'],
                ['Outperforms',  ['AlexNet','ResNet-50','MobileNetV2','VGG-16']],
              ],
            },
            {
              title:'Weather-Based Risk Forecasting', model:'XGBoost',
              rows:[
                ['Data',         'Open-Meteo Archive API · 5 TN districts · 2020–2025 · 9,125 records'],
                ['Model',        'MultiOutputClassifier · 4 independent XGBClassifier instances (one per disease)'],
                ['Config',       'n_estimators=200, max_depth=6, lr=0.05, subsample=0.8, colsample_bytree=0.8'],
                ['Features',     '21 engineered features · 7-day rolling window → flattened (N, 147)'],
                ['Labels',       'Agronomic threshold rules (humidity, temperature, rainfall, wind)'],
                ['Output',       'Low / Medium / High · 4 diseases · 7-day horizon'],
                ['Outperforms',  ['Random Forest','LSTM','GRU','TCN']],
              ],
            },
          ].map(({ title, model, rows }) => (
            <div key={title} className="hp-pc">
              <div className="hp-ph">
                <span className="hp-serif text-white text-[15px]">{title}</span>
                <span className="hp-mono text-[11px] text-green-400 bg-green-900/50 px-2 py-0.5 rounded">{model}</span>
              </div>
              {rows.map(([k, v]) => (
                <div key={k} className="hp-pr">
                  <span className="hp-pk">{k}</span>
                  <span className="text-gray-700 leading-relaxed text-[12.5px]">
                    {Array.isArray(v) ? v.map(x => <span key={x} className="hp-vt">{x}</span>) : v}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Disease table */}
      <div className="mb-8">
        <p className="hp-mono text-[10.5px] tracking-widest uppercase text-primary mb-1">Classification Scope</p>
        <h2 className="hp-serif text-gray-800 text-xl mb-4">10 Detectable Classes — Paddy Doctor Dataset</h2>
        <div style={{ overflowX:'auto' }}>
          <table className="hp-table">
            <thead><tr><th>#</th><th>Disease / Condition</th><th>Causal Pathogen / Agent</th></tr></thead>
            <tbody>
              {HOME_DISEASES.map(({ name, pathogen }, i) => (
                <tr key={name}>
                  <td><span className="hp-mono text-[11px] text-primary font-medium">0{i+1}</span></td>
                  <td>{name}</td>
                  <td><span className="hp-mono text-[11px] text-gray-500 italic">{pathogen}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hp-mono text-[11px] text-gray-400 mt-2">
          Split: 70% train · 15% validation · 15% test · stratified · seed=42 · class-balanced weighting
        </p>
      </div>

      {/* Stack table */}
      <div className="mb-8">
        <p className="hp-mono text-[10.5px] tracking-widest uppercase text-primary mb-1">Implementation</p>
        <h2 className="hp-serif text-gray-800 text-xl mb-4">Technology Stack</h2>
        <div style={{ overflowX:'auto' }}>
          <table className="hp-table">
            <thead><tr><th>Layer</th><th>Technology</th></tr></thead>
            <tbody>
              {HOME_STACK.map(({ layer, value }) => (
                <tr key={layer}>
                  <td><span className="hp-mono text-[11px] text-primary">{layer}</span></td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Steps */}
      <div>
        <p className="hp-mono text-[10.5px] tracking-widest uppercase text-primary mb-1">Usage</p>
        <h2 className="hp-serif text-gray-800 text-xl mb-4">How to Use This System</h2>
        <div className="hp-steps">
          {[
            ['STEP 01','Upload a Leaf Image',     'Go to Paddy Disease Detection. Drag & drop or select a paddy leaf photo (JPG / PNG, max 300 MB). Field-quality smartphone images are supported.'],
            ['STEP 02','Receive AI Diagnosis',    'EfficientNetB3 classifies the leaf into one of 10 categories. A Grad-CAM heatmap highlights affected regions. Bilingual (English / Tamil) disease details are returned.'],
            ['STEP 03','Check Weather Risk',      'Go to Single Disease Risk or All Disease Risk. Select a district or GPS. XGBoost returns a 7-day Low / Medium / High outlook for Leaf Blast, Brown Spot, BLB, and Tungro.'],
          ].map(([num, title, desc]) => (
            <div key={num} className="hp-step">
              <p className="hp-mono text-[11px] text-primary mb-2">{num}</p>
              <p className="font-semibold text-[13.5px] text-gray-800 mb-1">{title}</p>
              <p className="text-[12.5px] text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — LEAF DISEASE DETECTION
// 300 MB guard is in handleUpload — Upload.jsx is NOT modified.
// ─────────────────────────────────────────────────────────────────────────────

function TabLeaf({ lang }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleUpload(file) {
    // ── 300 MB guard — enforced here, Upload.jsx untouched ──
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — exceeds the 300 MB limit. Please select a smaller image.`)
      return
    }
    setLoading(true); setError(null); setResult(null)
    try   { setResult(await predictDisease(file, true)) }
    catch (e) { setError(e?.response?.data?.detail || 'Prediction failed. Please try again.') }
    finally   { setLoading(false) }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Upload panel */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Upload Leaf Image</h2>
        <p className="text-xs text-gray-400 mb-4">JPG / PNG · Max 300 MB</p>
        <Upload onUpload={handleUpload} loading={loading} />
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <span className="shrink-0">⚠️</span> {error}
          </div>
        )}
        <div className="mt-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Detectable Diseases</p>
          <div className="flex flex-wrap gap-1.5">
            {HOME_DISEASES.map(d => (
              <span key={d.name} className="text-[11px] bg-green-50 text-primary border border-green-100 rounded-full px-2 py-0.5">
                {d.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Result panel */}
      <div>
        {result
          ? <Result data={result} lang={lang} />
          : (
            <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col items-center justify-center text-center text-gray-400 min-h-[320px]">
              <span className="text-6xl mb-4">🔬</span>
              <p className="font-medium text-gray-500">Results will appear here</p>
              <p className="text-sm mt-1">Upload a rice leaf photo to get started</p>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — SINGLE DISEASE RISK
// Same XGBoost API + same location selector as WeatherForecast.jsx.
// Adds disease selector → shows only that disease's 7-day strip + risk meter.
// ─────────────────────────────────────────────────────────────────────────────

function TabSingleRisk() {
  const { forecast, loading, error, load } = useForecast('Thanjavur')
  const [disease, setDisease] = useState('Leaf Blast')

  const today   = forecast?.forecast?.[0]
  const todayDx = today?.diseases?.[disease]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Left: disease selector + location */}
      <div className="space-y-5">

        {/* Disease selector */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-1">Select Disease</h2>
          <p className="text-xs text-gray-400 mb-4">
            Choose which disease's risk forecast to display. The XGBoost model forecasts all 4 simultaneously.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WEATHER_DISEASES.map(d => (
              <button key={d} onClick={() => setDisease(d)}
                className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left
                  ${disease === d
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'}`}>
                {d}
                {disease === d && <span className="ml-1 text-green-200 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">📍 Select Location</h2>
          <LocationSelector onLoad={load} loading={loading} />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-start gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-6">
            <Spinner /><p className="text-sm text-gray-500">Loading forecast…</p>
          </div>
        )}

        {/* Risk meter */}
        {!loading && todayDx && (
          <RiskMeter risk={todayDx.risk} confidence={todayDx.confidence} diseaseName={disease} />
        )}

        {/* Weather summary */}
        {!loading && today?.weather && (
          <div className="bg-white rounded-2xl shadow-md p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Today's Weather · {forecast.location}
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { icon:'🌡️', value:`${Math.round(today.weather.temp_max)}°C`, label:'Max'      },
                { icon:'💧', value:`${Math.round(today.weather.humidity)}%`,   label:'Humidity' },
                { icon:'🌧', value:`${today.weather.rainfall.toFixed(1)}mm`,   label:'Rainfall' },
                { icon:'💨', value:`${Math.round(today.weather.wind_speed)}`,  label:'Wind km/h'},
              ].map(({ icon, value, label }) => (
                <div key={label}>
                  <p className="text-xl">{icon}</p>
                  <p className="font-bold text-gray-700 text-sm mt-1">{value}</p>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: 7-day strip */}
      <div>
        {!loading && forecast
          ? <SevenDayStrip forecast={forecast} diseaseName={disease} />
          : !loading && (
            <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col items-center justify-center text-center text-gray-400 min-h-[320px]">
              <span className="text-5xl mb-4">🌦️</span>
              <p className="font-medium text-gray-500">Select a location to load the forecast</p>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — ALL DISEASE RISK
// Renders existing WeatherForecast component untouched.
// ─────────────────────────────────────────────────────────────────────────────

function TabAllRisk() {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <WeatherForecast />
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// ROOT — AppNew
// ─────────────────────────────────────────────────────────────────────────────

export default function AppNew() {
  const [tab,  setTab]  = useState('home')
  const [lang, setLang] = useState('en')

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">

      {/* Header */}
      <header className="bg-primary shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌾</span>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Paddy Disease Detection</h1>
              <p className="text-green-200 text-[11px]">EfficientNetB3 · XGBoost Weather Model</p>
            </div>
          </div>
          <div className="flex bg-green-900 rounded-lg overflow-hidden border border-green-700">
            {['en','ta'].map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors
                  ${lang === l ? 'bg-white text-primary' : 'text-green-200 hover:text-white'}`}>
                {l === 'en' ? 'English' : 'தமிழ்'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-gray-100 overflow-x-auto"
          style={{ scrollbarWidth:'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all whitespace-nowrap
                ${tab === t.id ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-green-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'home'     && <TabHome     onGoto={setTab} />}
        {tab === 'leaf'     && <TabLeaf     lang={lang} />}
        {tab === 'single'   && <TabSingleRisk />}
        {tab === 'all'      && <TabAllRisk />}
       
      </main>

      <footer className="text-center text-[11px] text-gray-400 pb-6">
        EfficientNetB3 · XGBoost · Open-Meteo API · Anna University, UCE-Thirukkuvalai · 2026
      </footer>
    </div>
  )
}