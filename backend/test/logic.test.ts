import { describe, it, expect } from 'vitest'
import { expiresFrom, isDuplicate, inMorocco, statusFor, distM, nearestCity, voteOutcome, TTL_MIN } from '../src/logic.js'

describe('logic', () => {
  it('expires in future', () => expect(expiresFrom('accident').getTime()).toBeGreaterThan(Date.now()))
  it('uses per-type TTL', () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    expect(expiresFrom('stopped', t0).getTime() - t0.getTime()).toBe(TTL_MIN.stopped * 60000)
    expect(expiresFrom('unknown-type', t0).getTime() - t0.getTime()).toBe(120 * 60000)
  })
  it('duplicate within 100m same type', () => {
    const a = { type: 'pothole', latitude: 33.89, longitude: -5.54 }
    expect(isDuplicate(a, { ...a, latitude: 33.8903 })).toBe(true)
    expect(isDuplicate(a, { ...a, type: 'flood' })).toBe(false)
    expect(isDuplicate(a, { ...a, latitude: 33.95 })).toBe(false)
  })
  it('morocco bounds', () => { expect(inMorocco(33.9, -5.5)).toBe(true); expect(inMorocco(48.8, 2.3)).toBe(false) })
  it('status by confidence', () => { expect(statusFor(1)).toBe('PENDING'); expect(statusFor(3)).toBe('CONFIRMED') })
  it('distance', () => { expect(distM(33, -5, 33, -5)).toBe(0); expect(Math.round(distM(33.8935, -5.5473, 33.5731, -7.5898) / 1000)).toBeGreaterThan(180) })
  it('nearest city within range only', () => {
    const cs = [{ id: 'm', lat: 33.8935, lng: -5.5473 }, { id: 'c', lat: 33.5731, lng: -7.5898 }]
    expect(nearestCity(33.9, -5.55, cs)?.id).toBe('m')
    expect(nearestCity(31.0, -4.0, cs)).toBeNull()
  })
  it('vote outcome', () => {
    expect(voteOutcome(1, 0)).toEqual({ confidence: 2, status: 'PENDING' })
    expect(voteOutcome(2, 0).status).toBe('CONFIRMED')
    expect(voteOutcome(0, 3).status).toBe('EXPIRED')
    expect(voteOutcome(0, 5).confidence).toBe(0)
  })
})
