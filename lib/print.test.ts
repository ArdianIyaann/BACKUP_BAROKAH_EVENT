import { describe, expect, it } from 'vitest'
import { jeepLabels, jeepLine } from './print'

describe('jeepLabels', () => {
  it('mengambil semua nomor jeep yang terisi', () => {
    expect(jeepLabels({ jeepParis: 'JEEP PARIS 01', jeepMerapi: '  ', jeepBromo: 'JEEP BROMO 03' })).toEqual([
      'JEEP PARIS 01',
      'JEEP BROMO 03',
    ])
  })

  it('tidak menambah label ganda karena nilainya sudah lengkap', () => {
    expect(jeepLine({ jeepMerapi: 'JEEP MERAPI 001' })).toBe('JEEP MERAPI 001')
  })

  it('kosong bila tidak ada jeep', () => {
    expect(jeepLine({})).toBe('')
    expect(jeepLine({ jeepParis: null, jeepMerapi: null, jeepBromo: null })).toBe('')
  })
})
