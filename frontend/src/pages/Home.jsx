import { useState } from 'react'
import Upload from '../components/Upload'
import Result from '../components/Result'
import WeatherForecast from '../components/WeatherForecast'
import { predictDisease } from '../services/api'

const TABS = [
  { id: 'leaf',    label: '🌿 Leaf Disease',      desc: 'Upload a rice leaf image' },
  { id: 'weather', label: '🌦️ Weather Forecast',  desc: '7-day disease risk by location' },
]

export default function Home() {
  const [tab, setTab]       = useState('leaf')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [lang, setLang]     = useState('en')

  async function handleUpload(file) {
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await predictDisease(file, true)
      setResult(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Prediction failed.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <header className="bg-primary shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌾</span>
            <div>
              <h1 className="text-white font-bold text-xl leading-tight">Paddy Disease Detection</h1>
              <p className="text-green-200 text-xs">EfficientNetB3 · XGBoost + TCN Weather Ensemble</p>
            </div>
          </div>
          <div className="flex bg-primary-dark rounded-lg overflow-hidden border border-green-600">
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

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex gap-2 bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all
                ${tab === t.id ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-green-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {tab === 'leaf' ? (
          <>
            {/* Upload panel */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Upload Leaf Image</h2>
              <Upload onUpload={handleUpload} loading={loading} />
              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                  ⚠️ {error}
                </div>
              )}
              <div className="mt-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detectable Diseases</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Bacterial Leaf Blight','Bacterial Leaf Streak','Bacterial Panicle Blight',
                    'Brown Spot','Dead Heart','Downy Mildew','Healthy Rice Leaf',
                    'Hispa','Leaf Blast','Tungro'].map(d => (
                    <span key={d} className="text-xs bg-green-50 text-primary border border-green-200 rounded-full px-2 py-0.5">
                      {d}
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
                  <div className="bg-white rounded-2xl shadow-md p-6 h-full flex flex-col items-center justify-center text-center text-gray-400 min-h-[300px]">
                    <span className="text-6xl mb-4">🔬</span>
                    <p className="font-medium">Results will appear here</p>
                    <p className="text-sm mt-1">Upload a rice leaf photo to get started</p>
                  </div>
                )
              }
            </div>
          </>
        ) : (
          /* Weather tab — full width */
          <div className="md:col-span-2 bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              Weather-Based Disease Risk Forecast
            </h2>
            <WeatherForecast />
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 pb-6">
        Powered by EfficientNetB3 · XGBoost + TCN · Open-Meteo API
      </footer>
    </div>
  )
}
