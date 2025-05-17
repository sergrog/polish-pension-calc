import { calculatePension, calculateRetirementOptions } from '../utils/calculations';

// Mock new Date().getFullYear() for consistent testing of calculateRetirementOptions
const CURRENT_YEAR_MOCK = 2024;
global.Date = class extends Date {
  constructor(...args) {
    if (args.length) {
      super(...args);
    } else {
      super(CURRENT_YEAR_MOCK, 0, 1); // Default to Jan 1 of mock year
    }
  }
  static now() {
    return new Date(CURRENT_YEAR_MOCK, 0, 1).getTime();
  }
  getFullYear() {
    // If date object was created with specific date, use its year, otherwise use mock
    const  superFullYear = Object.getPrototypeOf(Object.getPrototypeOf(this)).getFullYear.call(this);
    return isNaN(superFullYear) || arguments.length > 0 ? CURRENT_YEAR_MOCK : superFullYear;
  }
};


describe('Pension Calculations', () => {
  const TARGET_WORK_YEARS = 40.0;
  const baseSalary = 50000; // Yearly brutto
  const baseWorkYears = 20;
  const birthYear = 1984; // current age = 2024 - 1984 = 40

  describe('calculatePension', () => {
    it('should calculate standard pension correctly with workYears scaling', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'standard' };
      const result = calculatePension(params);
      expect(result.length).toBe(25);
      const expectedFactor = baseWorkYears / TARGET_WORK_YEARS; // 20 / 40 = 0.5
      const expectedInitialPension = baseSalary * 0.4 * expectedFactor;
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
      expect(result[1].pension).toBe(Math.round(expectedInitialPension * 1.03)); // Check indexation
    });

    it('should use full TARGET_WORK_YEARS if workYears exceeds target', () => {
      const params = { age: 40, workYears: 50, salary: baseSalary, scenario: 'standard' };
      const result = calculatePension(params);
      const expectedFactor = 50 / TARGET_WORK_YEARS; // Should be capped at 1 implicitly by formula if desired, but current formula is linear
                                                      // The problem description does not specify capping at TARGET_WORK_YEARS for the factor.
                                                      // The formula `workYears / 40` means more than 40 years gives a higher pension.
                                                      // This test will verify that behavior.
      const expectedInitialPension = baseSalary * 0.4 * (50 / TARGET_WORK_YEARS);
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
    });
    
    it('should calculate minimal pension correctly (fixed amount, ignores workYears and salary)', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'minimal' };
      const result = calculatePension(params);
      const expectedInitialPension = 1600;
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
      expect(result[1].pension).toBe(Math.round(expectedInitialPension * 1.03));
    });

    it('should calculate early pension correctly (10% reduction, workYears scaling)', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'early' };
      const result = calculatePension(params);
      const expectedFactor = baseWorkYears / TARGET_WORK_YEARS;
      const expectedInitialPension = baseSalary * (0.4 * 0.9) * expectedFactor;
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
    });

    it('should calculate disability pension correctly (50% base rate, workYears scaling)', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'disability' };
      const result = calculatePension(params);
      const expectedFactor = baseWorkYears / TARGET_WORK_YEARS;
      const expectedInitialPension = baseSalary * 0.5 * expectedFactor;
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
    });

    it('should calculate widow pension (own favorable)', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'widow', spouseSalary: 30000 };
      const result = calculatePension(params);
      const ownFactor = baseWorkYears / TARGET_WORK_YEARS;
      const ownPension = baseSalary * 0.4 * ownFactor;
      // Spouse potential pension assumes TARGET_WORK_YEARS for their salary input for this calculation
      const spousePotentialPension = 30000 * 0.4 * (TARGET_WORK_YEARS / TARGET_WORK_YEARS);
      const expectedInitialPension = Math.max(ownPension, spousePotentialPension * 0.6);
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
      expect(result[0].own).toBe(Math.round(ownPension));
      expect(result[0].spouseShare).toBe(Math.round(spousePotentialPension * 0.6));
    });

    it('should calculate widow pension (spouse favorable)', () => {
      const params = { age: 40, workYears: 10, salary: 20000, scenario: 'widow', spouseSalary: baseSalary };
      const result = calculatePension(params);
      const ownFactor = 10 / TARGET_WORK_YEARS;
      const ownPension = 20000 * 0.4 * ownFactor;
      const spousePotentialPension = baseSalary * 0.4 * (TARGET_WORK_YEARS / TARGET_WORK_YEARS);
      const expectedInitialPension = Math.max(ownPension, spousePotentialPension * 0.6);
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
    });
    
    it('should calculate joint pension correctly', () => {
      const spouseSal = 40000;
      const params = { age: 40, workYears: baseWorkYears, salary: baseSalary, scenario: 'joint', spouseSalary: spouseSal };
      const result = calculatePension(params);
      
      const p1Factor = baseWorkYears / TARGET_WORK_YEARS;
      const p1Base = baseSalary * 0.4 * p1Factor;
      const p2Base = spouseSal * 0.4 * (TARGET_WORK_YEARS / TARGET_WORK_YEARS); // Spouse at full factor
      const total = p1Base + p2Base;
      let afterTax;
      if (total <= 120000) afterTax = total * 0.88;
      else afterTax = 120000 * 0.88 + (total - 120000) * 0.68;
      const expectedInitialPension = afterTax / 2;
      expect(result[0].pension).toBe(Math.round(expectedInitialPension));
    });

    it('should handle 0 workYears correctly (pension should be 0 unless minimal)', () => {
      const params = { age: 40, workYears: 0, salary: baseSalary, scenario: 'standard' };
      const result = calculatePension(params);
      expect(result[0].pension).toBe(0);
    });

    it('should handle 0 salary correctly (pension should be 0 unless minimal)', () => {
      const params = { age: 40, workYears: baseWorkYears, salary: 0, scenario: 'standard' };
      const result = calculatePension(params);
      expect(result[0].pension).toBe(0);
    });
  });

  describe('calculateRetirementOptions', () => {
    // birthYear = 1984, current age = 40 in CURRENT_YEAR_MOCK = 2024
    // workYears = 20 (baseWorkYears)
    it('should calculate options correctly for standard scenario', () => {
      const params = { birthYear, workYears: baseWorkYears, salary: baseSalary, scenario: 'standard' };
      const options = calculateRetirementOptions(params); // minAge 60, maxAge 70 default
      
      expect(options.length).toBe(11); // 60 to 70 inclusive

      // Test for retirement at age 60
      const optionAge60 = options.find(opt => opt.age === 60);
      expect(optionAge60).toBeDefined();
      const yearsUntilRetirement60 = 60 - (CURRENT_YEAR_MOCK - birthYear); // 60 - 40 = 20
      const totalWorkYears60 = baseWorkYears + yearsUntilRetirement60; // 20 + 20 = 40
      expect(optionAge60.yearsWorked).toBe(totalWorkYears60);
      const expectedFactor60 = totalWorkYears60 / TARGET_WORK_YEARS; // 40 / 40 = 1
      let expectedInitialPension60 = baseSalary * 0.4 * expectedFactor60;
      expectedInitialPension60 = Math.max(0, Math.round(expectedInitialPension60));
      expect(optionAge60.pension).toBe(expectedInitialPension60);
      expect(optionAge60.forecast.length).toBe(5);
      expect(optionAge60.forecast[0]).toBe(expectedInitialPension60);
      expect(optionAge60.forecast[1]).toBe(Math.round(expectedInitialPension60 * 1.03));

      // Test for retirement at age 65
      const optionAge65 = options.find(opt => opt.age === 65);
      expect(optionAge65).toBeDefined();
      const yearsUntilRetirement65 = 65 - (CURRENT_YEAR_MOCK - birthYear); // 65 - 40 = 25
      const totalWorkYears65 = baseWorkYears + yearsUntilRetirement65; // 20 + 25 = 45
      expect(optionAge65.yearsWorked).toBe(totalWorkYears65);
      const expectedFactor65 = totalWorkYears65 / TARGET_WORK_YEARS; // 45 / 40 = 1.125
      let expectedInitialPension65 = baseSalary * 0.4 * expectedFactor65;
      expectedInitialPension65 = Math.max(0, Math.round(expectedInitialPension65));
      expect(optionAge65.pension).toBe(expectedInitialPension65);
    });

    it('should calculate options correctly for minimal scenario', () => {
        const params = { birthYear, workYears: baseWorkYears, salary: baseSalary, scenario: 'minimal' };
        const options = calculateRetirementOptions(params);
        const optionAge60 = options.find(opt => opt.age === 60);
        expect(optionAge60.pension).toBe(1600); // Minimal pension is fixed
        expect(optionAge60.forecast[1]).toBe(Math.round(1600 * 1.03));
    });
    
    it('should calculate options correctly for widow scenario (own favorable)', () => {
        const params = { birthYear, workYears: baseWorkYears, salary: baseSalary, scenario: 'widow', spouseSalary: 30000 };
        const options = calculateRetirementOptions(params);
        const optionAge60 = options.find(opt => opt.age === 60);
        
        const yearsUntilRetirement60 = 60 - (CURRENT_YEAR_MOCK - birthYear);
        const totalWorkYears60 = baseWorkYears + yearsUntilRetirement60;
        const workFactor60 = totalWorkYears60 / TARGET_WORK_YEARS;
        
        const ownPension = baseSalary * 0.4 * workFactor60;
        const spousePotentialPension = 30000 * 0.4 * (TARGET_WORK_YEARS / TARGET_WORK_YEARS);
        let expectedInitialPension = Math.max(ownPension, spousePotentialPension * 0.6);
        expectedInitialPension = Math.max(0, Math.round(expectedInitialPension));

        expect(optionAge60.pension).toBe(expectedInitialPension);
    });

    it('should handle yearsUntilRetirement being negative (current age > retirement age option)', () => {
      // Current age 40. Trying to calculate for retirement at 30.
      const params = { birthYear, workYears: baseWorkYears, salary: baseSalary, scenario: 'standard', minAge: 30, maxAge: 30 };
      const options = calculateRetirementOptions(params);
      const optionAge30 = options.find(opt => opt.age === 30);

      const yearsUntilRetirement = Math.max(0, 30 - (CURRENT_YEAR_MOCK - birthYear)); // max(0, 30 - 40) = 0
      const totalWorkYears = baseWorkYears + yearsUntilRetirement; // 20 + 0 = 20
      expect(optionAge30.yearsWorked).toBe(totalWorkYears);

      const expectedFactor = totalWorkYears / TARGET_WORK_YEARS; // 20 / 40 = 0.5
      let expectedInitialPension = baseSalary * 0.4 * expectedFactor;
      expectedInitialPension = Math.max(0, Math.round(expectedInitialPension));
      expect(optionAge30.pension).toBe(expectedInitialPension);
    });
  });
}); 