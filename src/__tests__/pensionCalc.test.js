import { describe, it, expect } from '@jest/globals'
import { calculatePension } from '../App'

describe('calculatePension', () => {
  it('should return 25 years of predictions', () => {
    const result = calculatePension({ age: 40, workYears: 20, salary: 5000 })
    expect(result).toHaveLength(25)
    expect(result[0]).toHaveProperty('year')
    expect(result[0]).toHaveProperty('pension')
  })

  it('should calculate pension based on salary', () => {
    const salary = 4000
    const result = calculatePension({ age: 50, workYears: 30, salary })
    expect(result[0].pension).toBe(Math.round(salary * 0.4))
  })
}) 