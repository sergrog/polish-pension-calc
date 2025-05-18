import '@testing-library/jest-dom';
import 'whatwg-fetch';

// Mock для recharts
jest.mock('recharts', () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Height: 0,
}));

// Mock для Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          data: [
            { year: 2024, base_rate: 1338.44, indexation: 0.07 },
            { year: 2025, base_rate: 1400.00, indexation: 0.06 },
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

// Add a placeholder test to satisfy Jest
describe('Setup Tests', () => {
  it('should run setup successfully', () => {
    expect(true).toBe(true);
  });
}); 