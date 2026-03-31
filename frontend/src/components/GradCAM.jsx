export default function GradCAM({ b64Image }) {
  if (!b64Image) return null
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
        <span>🔍</span> GradCAM – Model Attention Map
      </h3>
      <img
        src={`data:image/png;base64,${b64Image}`}
        alt="GradCAM heatmap"
        className="rounded-xl shadow-md w-full max-w-xs mx-auto block"
      />
      <p className="text-xs text-gray-400 text-center mt-1">Red = high attention area</p>
    </div>
  )
}
