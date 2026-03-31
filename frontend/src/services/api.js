import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

export async function predictDisease(file, gradcam = true) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await axios.post(
    `${BASE}/predict?gradcam=${gradcam}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data
}

export async function healthCheck() {
  const { data } = await axios.get(`${BASE.replace('/api', '')}/health`)
  return data
}
