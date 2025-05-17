import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PensionCalculator from '../components/PensionCalculator';

// Mock supabase client to prevent issues with import.meta and provide stable test environment
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: {length: 1}, error: null }), // Assume insert returns one record
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(), // For chaining .order()
      eq: jest.fn().mockReturnThis(),    // For chaining .eq()
      // Add other chained methods if necessary
    }),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      // Mock other auth methods if used by the component
    },
  }
}));

describe('PensionCalculator', () => {
  it('renders calculator form', () => {
    render(<PensionCalculator />);
    
    expect(screen.getByText('Калькулятор пенсии')).toBeInTheDocument();
    expect(screen.getByLabelText('Год рождения')).toBeInTheDocument();
    expect(screen.getByLabelText('Стаж (лет)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Среднегодовая зарплата/i)).toBeInTheDocument();
    expect(screen.getByText('Рассчитать')).toBeInTheDocument();
  });

  it('updates input values on change', () => {
    render(<PensionCalculator />);
    
    const birthYearInput = screen.getByLabelText('Год рождения');
    const workYearsInput = screen.getByLabelText('Стаж (лет)');
    const salaryInput = screen.getByLabelText(/Среднегодовая зарплата/i);

    fireEvent.change(birthYearInput, { target: { value: '1985' } });
    fireEvent.change(workYearsInput, { target: { value: '30' } });
    fireEvent.change(salaryInput, { target: { value: '60000' } });

    expect(birthYearInput.value).toBe('1985');
    expect(workYearsInput.value).toBe('30');
    expect(salaryInput.value.replace(/\s/g, '')).toBe('60000');
  });

  it('calculates pension and shows prediction', async () => {
    render(<PensionCalculator />);
    
    fireEvent.change(screen.getByLabelText('Год рождения'), { target: { value: '1980' } });
    fireEvent.change(screen.getByLabelText('Стаж (лет)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/Среднегодовая зарплата/i), { target: { value: '50000' } });
    
    const scenarioSelect = screen.getByLabelText('Сценарий расчёта');
    fireEvent.mouseDown(scenarioSelect); 
    
    // Wait for the option to appear in the listbox and click it
    // Using getByRole to be specific about clicking the option in the dropdown list
    await waitFor(() => screen.getByRole('option', { name: 'Стандартная пенсия' }));
    fireEvent.click(screen.getByRole('option', { name: 'Стандартная пенсия' }));

    const calculateButton = screen.getByText('Рассчитать');
    fireEvent.click(calculateButton);

    await waitFor(() => {
      expect(screen.getByText(/Прогноз пенсии/i)).toBeInTheDocument(); 
    });
  });
}); 