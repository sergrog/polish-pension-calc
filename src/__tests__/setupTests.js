import '@testing-library/jest-dom';

// Mock для recharts
jest.mock('recharts', () => ({
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
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