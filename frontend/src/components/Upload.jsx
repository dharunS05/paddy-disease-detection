import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

export default function Upload({ onUpload, loading }) {
  const [preview, setPreview] = useState(null)

  const onDrop = useCallback((accepted) => {
    const file = accepted[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onUpload(file)
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled: loading,
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        {...getRootProps()}
        className={`w-full border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
          ${isDragActive ? 'border-primary bg-green-50' : 'border-gray-300 hover:border-primary hover:bg-green-50'}
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <span className="text-5xl">🌾</span>
          {isDragActive
            ? <p className="text-primary font-semibold">Drop the leaf image here…</p>
            : <div>
                <p className="font-semibold text-gray-700">Drag & drop a rice leaf image</p>
                <p className="text-sm text-gray-400 mt-1">or click to browse • JPG, PNG supported</p>
              </div>
          }
        </div>
      </div>

      {preview && (
        <div className="w-full max-w-xs">
          <p className="text-xs text-gray-500 mb-1 text-center">Preview</p>
          <img src={preview} alt="preview" className="rounded-xl shadow-md w-full object-cover max-h-56" />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-primary font-medium">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Analysing image…
        </div>
      )}
    </div>
  )
}
