import axios from 'axios'

const BASE = window.API_BASE || '/api'

export async function predictDisease(file, gradcam = true) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await axios.post(
    `${BASE}/predict?gradcam=${gradcam}`, form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data
}

export async function getDistricts() {
  const { data } = await axios.get(`${BASE}/weather/districts`)
  return data.districts
}

export async function searchLocation(query) {
  const { data } = await axios.get(`${BASE}/weather/search`, { params: { q: query } })
  return data.results
}

export async function getWeatherForecast({ district, lat, lon, location }) {
  const params = district ? { district } : { lat, lon, location }
  const { data } = await axios.get(`${BASE}/weather/forecast`, { params })
  return data
}

export async function healthCheck() {
  const { data } = await axios.get('/health')
  return data
}
