import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'
import GradCAM from './GradCAM'

const SEVERITY_COLOR = {
  None: 'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-orange-100 text-orange-700',
  'Very High': 'bg-red-100 text-red-700',
}

export default function Result({ data, lang }) {
  if (!data) return null

  const info = lang === 'ta' ? data.info_ta : data.info_en
  const pct = Math.round(data.confidence * 100)
  const isHealthy = data.class_name === 'Healthy Rice Leaf'

  const topProbs = Object.entries(data.all_probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const severityClass = SEVERITY_COLOR[info?.severity] || 'bg-gray-100 text-gray-600'

  return (
    <div className="space-y-5">
      {/* Main result card */}
      <div className={`rounded-2xl p-5 ${isHealthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Detected Disease</p>
            <h2 className="text-xl font-bold text-gray-800 mt-0.5">{data.class_name}</h2>
            {info && (
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${severityClass}`}>
                Severity: {info.severity}
              </span>
            )}
          </div>
          {/* Confidence ring */}
          <div className="w-24 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%"
                innerRadius="60%" outerRadius="100%"
                startAngle={90} endAngle={90 - 360 * (pct / 100)}
                data={[{ value: pct, fill: isHealthy ? '#52b788' : '#e63946' }]}
              >
                <RadialBar dataKey="value" cornerRadius={6} />
              </RadialBarChart>
            </ResponsiveContainer>
            <p className="text-center -mt-14 text-lg font-bold text-gray-700">{pct}%</p>
          </div>
        </div>
      </div>

      {/* Disease info */}
      {info && (
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <InfoRow icon="📋" label="Description" value={info.description} />
          <InfoRow icon="🔬" label="Symptoms" value={info.symptoms} />
          <InfoRow icon="💊" label="Treatment" value={info.treatment} />
        </div>
      )}

      {/* Top-5 probabilities */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Top Predictions</h3>
        <div className="space-y-2">
          {topProbs.map(([name, prob]) => (
            <div key={name}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span className="truncate max-w-[70%]">{name}</span>
                <span className="font-medium">{(prob * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${prob * 100}%`, transition: 'width 0.6s ease' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GradCAM */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <GradCAM b64Image={data.gradcam_image} />
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{icon} {label}</p>
      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
    </div>
  )
}
