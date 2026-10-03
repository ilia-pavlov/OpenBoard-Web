// "Where am I" for the tournament search. Port of LocationProvider.swift.
//
// The US Chess search needs a city or ZIP (it ignores coordinates), and
// browsers only give coordinates, so the device location is turned into a city
// with OpenStreetMap's Nominatim. That happens only when the user taps "Use my
// location"; typing a city or ZIP sends nothing anywhere but US Chess.

import type { SavedLocation } from './ui'

export class LocationError extends Error {}

/** Give up on GPS after this long, like the app. */
const timeout = 12_000

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocationError("This browser can't share your location."))
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      reject(
        new LocationError(
          error.code === error.PERMISSION_DENIED ? 'Location is off for this site.' : "Couldn't find your location.",
        ),
      )
    }, { timeout, maximumAge: 10 * 60_000 })
  })
}

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  hamlet?: string
  suburb?: string
  postcode?: string
  'ISO3166-2-lvl4'?: string // "US-NJ"
}

/** The device location as a city the US Chess search understands ("Plainsboro, NJ"), or its ZIP. */
export async function currentLocation(): Promise<SavedLocation> {
  const { coords } = await position()
  const { latitude, longitude } = coords
  let address: NominatimAddress | undefined
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`
    address = ((await (await fetch(url, { headers: { Accept: 'application/json' } })).json()) as { address?: NominatimAddress }).address
  } catch {
    throw new LocationError("Couldn't look up your city. Enter a city or ZIP instead.")
  }
  const city = address?.city ?? address?.town ?? address?.village ?? address?.hamlet ?? address?.suburb
  const state = address?.['ISO3166-2-lvl4']?.replace(/^US-/, '')
  const origin = city && state ? `${city}, ${state}` : address?.postcode?.slice(0, 5)
  if (!origin) throw new LocationError("Couldn't look up your city. Enter a city or ZIP instead.")
  return { origin, latitude, longitude }
}

/** Great-circle distance in miles. */
export function milesBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}
