import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, TextField, Button, Typography, Paper, MenuItem, Select, InputLabel, FormControl, Radio, RadioGroup, FormControlLabel, Grid, Accordion, AccordionSummary, AccordionDetails, IconButton, createTheme, ThemeProvider, Tooltip as MuiTooltip, useTheme, CircularProgress, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabaseClient';
import { calculateAccumulatedCapital, calculateRetirementOptionsWithCapital } from '../utils/calculations';
import { debounce } from 'lodash';
import { useTranslation } from 'react-i18next';

const polishPokemonNames = [
  "Pikachu", "Bulbasaur", "Charmander", "Squirtle", "Jigglypuff", "Meowth",
  "Psyduck", "Snorlax", "Dragonite", "Mewtwo", "Chikorita", "Cyndaquil",
  "Totodile", "Togepi", "Marill", "Treecko", "Torchic", "Mudkip",
  "Gardevoir", "Absol", "Turtwig", "Chimchar", "Piplup", "Lucario", "Garchomp",
  "Eevee", "Vaporeon", "Jolteon", "Flareon", "Espeon", "Umbreon", "Glaceon", "Leafeon"
];

const getRandomPokemonName = () => {
  return polishPokemonNames[Math.floor(Math.random() * polishPokemonNames.length)];
};

// --- Примерные ставки налогов и взносов (Польша) - УПРОЩЕННАЯ МОДЕЛЬ --- 
// Пользователь должен будет предоставить точные или более сложные правила для реального калькулятора
const ZUS_PENSION_RATE = 0.0976;       // Пенсионный взнос (emerytalne)
const ZUS_DISABILITY_RATE = 0.015;    // Взнос по нетрудоспособности (rentowe)
const ZUS_SICKNESS_RATE = 0.0245;     // Больничный взнос (chorobowe)
const EMPLOYEE_ZUS_TOTAL_RATE = ZUS_PENSION_RATE + ZUS_DISABILITY_RATE + ZUS_SICKNESS_RATE; // Итого ZUS с работника: 0.1371

const HEALTH_INSURANCE_RATE = 0.09; // Медицинское страхование (składka zdrowotna)

// Упрощенный подоходный налог (PIT)
const PIT_RATE_LOWER = 0.12;              // Ставка 12%
const PIT_ANNUAL_DEDUCTIBLE_COSTS = 3000; // Расходы на получение дохода (koszty uzyskania przychodu) - годовые
const PIT_TAX_FREE_AMOUNT_ANNUAL_DEDUCTION = 3600; // Налоговый вычет из суммы налога (kwota wolna: 30,000 * 12%)
// Порог для 32% (120,000 PLN дохода ПОСЛЕ ZUS и расходов) здесь не учитывается для простоты
// --- Конец блока примерных ставок ---

const SCENARIOS = [
  // { value: 'capital_model', label: 'Модель накопления капитала' }, // Key will be used directly
  // Можно будет вернуть старые сценарии, если нужно будет их сохранить как альтернативу
  // { value: 'standard', label: 'Стандартная пенсия (упрощенная)' }, 
];

// MONTHS will be generated dynamically based on current language in the component
// const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('ru-RU', { month: 'long' }) }));

const defaultInputs = {
  birthYear: 1980,
  birthMonth: 1,
  workYears: 15, // Initial years of contribution already made (represents PAST work leading to initial capital)
  avgSalary: 10000, 
  salaryType: 'brutto',
  salaryPeriod: 'month',
  scenario: 'capital_model', 

  // New fields for capital accumulation model
  initialAccumulatedCapital: 0, // PLN, User input, current accumulated capital
  copyrightPercentage: 0, // % e.g. 0 for no copyright income affecting ZUS base
  pensionContributionRate: 19.52, // % e.g. 19.52 for ZUS total
  capitalIndexationRate: 5, // % p.a. for invested capital
  targetRetirementAge: 65, 
  lifeExpectancyAtTargetAgeMonths: 210, // e.g., GUS data for 65 y.o. 
  minimalPension: 1780.96, // PLN/month, brutto (as of March 2024 for example)
};

const PensionCalculator = () => {
  const { t, i18n } = useTranslation();
  const muiTheme = useTheme(); // For accessing theme properties in chart

  // Regenerate MONTHS when language changes
  const MONTHS = React.useMemo(() => 
    Array.from({ length: 12 }, (_, i) => ({ 
      value: i + 1, 
      label: new Date(0, i).toLocaleString(i18n.language, { month: 'long' }) 
    })),
  [i18n.language]);

  const [inputs, setInputs] = useState(defaultInputs);
  const [accumulatedCapitalData, setAccumulatedCapitalData] = useState(null);
  const [estimatedMonthlyPension, setEstimatedMonthlyPension] = useState(null);
  const [widowPensionEstimate, setWidowPensionEstimate] = useState(null); // For 85% estimate
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true); // For loading state
  const [historyError, setHistoryError] = useState(null); // For error state
  const [errors, setErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState(''); // For button save status
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : false;
  });

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
        },
      }),
    [darkMode],
  );

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);
  
  const inputRefs = {
    birthYear: useRef(null),
    birthMonth: useRef(null),
    workYears: useRef(null), // This now refers to PAST work years for initial capital context
    avgSalary: useRef(null),
    initialAccumulatedCapital: useRef(null),
    copyrightPercentage: useRef(null),
    pensionContributionRate: useRef(null),
    capitalIndexationRate: useRef(null),
    targetRetirementAge: useRef(null),
    lifeExpectancyAtTargetAgeMonths: useRef(null),
    minimalPension: useRef(null),
    // spouseSalary: useRef(null), // Removed as per decision
  };

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data, error } = await supabase
        .from('pension_calculations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        throw error;
      }
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching history from Supabase:", error);
      setHistoryError(t('history.fetchError'));
      setHistory([]); // Clear history on error
    } finally {
      setHistoryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const cleanNumberInput = useCallback((val, allowFloat = false) => {
    if (typeof val === 'string') {
      if (allowFloat) {
        val = val.replace(/,/g, '.'); // Replace comma with dot for float conversion
      }
      val = val.replace(allowFloat ? /[^\d.]/g : /[^\d]/g, ''); // Remove non-allowed chars
      if (allowFloat) {
        const parts = val.split('.');
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join(''); // Keep only first dot
      }
      
      val = val.replace(/^0+(?!$|\.)/, ''); // Removes leading zeros from integer part, e.g. "007" -> "7", "0.5" -> ".5"
      
      if (allowFloat && val.startsWith('.')) { // If it's like ".5" after stripping leading zeros
        val = '0' + val; // Make it "0.5"
      }

      // If it became empty, or for non-floats it's just a dot, or for floats it's just "0." (from "."), set to "0" or "0."
      if (val === '') {
        val = '0';
      } else if (!allowFloat && val === '.') {
        val = '0';
      } else if (allowFloat && val === '.') { // If user typed only a dot, and it passed through.
        val = '0.'; // Canonical representation for starting a float.
      }
      // If val is "0." from previous step, it remains "0."
      // If val is "0.5" from previous step, it remains "0.5"
      
    } else {
      // If input is not string (e.g. number from state being cleaned again, though unlikely here)
      return String(val);
    }
    return val; // string
  }, []);

  const calculateNettoFromBruttoYearly = useCallback((yearlyBrutto) => {
    if (isNaN(yearlyBrutto) || yearlyBrutto <= 0) return 0;
    const employeeZus = yearlyBrutto * EMPLOYEE_ZUS_TOTAL_RATE;
    const healthInsuranceBase = yearlyBrutto - employeeZus;
    const healthContribution = healthInsuranceBase * HEALTH_INSURANCE_RATE;
    const pitBaseForTaxRate = Math.max(0, yearlyBrutto - employeeZus - PIT_ANNUAL_DEDUCTIBLE_COSTS);
    const taxCalculated = pitBaseForTaxRate * PIT_RATE_LOWER;
    const incomeTax = Math.max(0, taxCalculated - PIT_TAX_FREE_AMOUNT_ANNUAL_DEDUCTION);
    const yearlyNetto = yearlyBrutto - employeeZus - healthContribution - incomeTax;
    return Math.round(yearlyNetto);
  }, []);

  const calculateBruttoFromNettoYearly = useCallback((yearlyNetto) => {
    if (isNaN(yearlyNetto) || yearlyNetto <= 0) return 0;
    const approximateBrutto = yearlyNetto / 0.72;
    return Math.round(approximateBrutto);
  }, []);

  // This function now primarily serves to get Annual Gross Salary
  const getAnnualGrossSalary = useCallback((salaryStr, type, period) => {
    let value = Number(cleanNumberInput(String(salaryStr))) || 0;
    let yearlyBrutto;
    if (period === 'month') {
      if (type === 'netto') yearlyBrutto = calculateBruttoFromNettoYearly(value * 12);
      else yearlyBrutto = value * 12;
    } else { // year
      if (type === 'netto') yearlyBrutto = calculateBruttoFromNettoYearly(value);
      else yearlyBrutto = value;
    }
    return Math.round(yearlyBrutto);
  }, [calculateBruttoFromNettoYearly, cleanNumberInput]);

  const calculateCurrentFullYearsAge = useCallback((bYear, bMonth) => {
    if (!bYear || !bMonth) return 0;
    const today = new Date();
    const currentY = today.getFullYear();
    const currentM = today.getMonth() + 1;
    let age = currentY - Number(bYear);
    if (currentM < Number(bMonth) || (currentM === Number(bMonth) && today.getDate() < 1)) { // Adjusted for day too
      age--;
    }
    return Math.max(0, age);
  }, []);

  const validateInputs = useCallback((currentInputs) => {
    const newErrors = {};
    const today = new Date();
    const currentY = today.getFullYear();

    if (Number(currentInputs.birthYear) < 1900 || Number(currentInputs.birthYear) > currentY) {
      newErrors.birthYear = t('formError.birthYear.range', { currentYear: currentY });
    }
    
    const ageForValidation = calculateCurrentFullYearsAge(currentInputs.birthYear, currentInputs.birthMonth);
    if (Number(currentInputs.targetRetirementAge) <= ageForValidation) {
        newErrors.targetRetirementAgeTooLow = t('formError.targetRetirementAge.tooLow');
    }
    if (Number(currentInputs.targetRetirementAge) < 50 || Number(currentInputs.targetRetirementAge) > 80) {
      newErrors.targetRetirementAgeOutOfRange = t('formError.targetRetirementAge.outOfRange');
    }
    if (Number(currentInputs.workYears) < 0 || Number(currentInputs.workYears) > 80) { // Max 80 years of work
      newErrors.workYears = t('formError.workYears.range');
    }
    if (Number(currentInputs.avgSalary) < 0) {
      newErrors.avgSalary = t('formError.avgSalary.negative');
    }
     if (Number(currentInputs.initialAccumulatedCapital) < 0) {
      newErrors.initialAccumulatedCapital = t('formError.initialAccumulatedCapital.negative');
    }
    if (Number(currentInputs.copyrightPercentage) < 0 || Number(currentInputs.copyrightPercentage) > 100) {
      newErrors.copyrightPercentage = t('formError.copyrightPercentage.range');
    }
    if (Number(currentInputs.pensionContributionRate) < 0 || Number(currentInputs.pensionContributionRate) > 100) {
      newErrors.pensionContributionRate = t('formError.pensionContributionRate.range');
    }
    if (Number(currentInputs.capitalIndexationRate) < 0 || Number(currentInputs.capitalIndexationRate) > 50) { // Max 50% indexation
      newErrors.capitalIndexationRate = t('formError.capitalIndexationRate.range');
    }
    if (Number(currentInputs.lifeExpectancyAtTargetAgeMonths) < 1 || Number(currentInputs.lifeExpectancyAtTargetAgeMonths) > 600) { // Max 50 years
      newErrors.lifeExpectancyAtTargetAgeMonths = t('formError.lifeExpectancyAtTargetAgeMonths.range');
    }
    if (Number(currentInputs.minimalPension) < 0) {
      newErrors.minimalPension = t('formError.minimalPension.negative');
    }
    return newErrors;
  }, [calculateCurrentFullYearsAge, t]);

  const debouncedCalculateAll = useCallback(debounce(async (currentInputs) => {
    const today = new Date();
    const currentY = today.getFullYear();
    setWidowPensionEstimate(null); 

    const newErrors = validateInputs(currentInputs);
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setAccumulatedCapitalData(null);
      setEstimatedMonthlyPension(null);
      return;
    }
    
    if (currentInputs.scenario === 'capital_model') {
      const annualGrossSalary = getAnnualGrossSalary(currentInputs.avgSalary, currentInputs.salaryType, currentInputs.salaryPeriod);
      const ageForCalc = calculateCurrentFullYearsAge(currentInputs.birthYear, currentInputs.birthMonth);

      const capitalResult = calculateAccumulatedCapital({
        currentAge: ageForCalc,
        initialCapital: Number(currentInputs.initialAccumulatedCapital),
        // workYears (past) is context for initialCapital, not directly used in future projection here
        // The simulation runs from currentAge to targetRetirementAge
        annualGrossSalary: annualGrossSalary,
        copyrightPercentage: Number(currentInputs.copyrightPercentage) / 100,
        pensionContributionRate: Number(currentInputs.pensionContributionRate) / 100,
        capitalIndexationRate: Number(currentInputs.capitalIndexationRate) / 100,
        targetRetirementAge: Number(currentInputs.targetRetirementAge),
      });

      setAccumulatedCapitalData(capitalResult.capitalData);
      
      const finalCapitalAtTarget = capitalResult.finalCapitalAtTargetAge;
      let finalMonthlyPension = 0;
      if (finalCapitalAtTarget > 0 && Number(currentInputs.lifeExpectancyAtTargetAgeMonths) > 0) {
        const pensionFromCapital = Math.round(finalCapitalAtTarget / Number(currentInputs.lifeExpectancyAtTargetAgeMonths));
        finalMonthlyPension = Math.max(pensionFromCapital, Number(currentInputs.minimalPension) || 0);
      } else {
        finalMonthlyPension = Number(currentInputs.minimalPension) || 0; // Fallback to minimal if no capital
      }
      setEstimatedMonthlyPension(finalMonthlyPension);
      if (finalMonthlyPension > 0) {
        setWidowPensionEstimate(Math.round(finalMonthlyPension * 0.85));
      }

    } else {
      setAccumulatedCapitalData(null);
      setEstimatedMonthlyPension(null);
    }
  }, 500), [inputs.targetRetirementAge, inputs.lifeExpectancyAtTargetAgeMonths, inputs.minimalPension]);

  useEffect(() => {
    debouncedCalculateAll(inputs);
  }, [inputs, debouncedCalculateAll]);

  const handleChange = (e) => {
    let { name, value } = e.target;
    const numericFields = ['birthYear', 'workYears', 'avgSalary', 'initialAccumulatedCapital', 'targetRetirementAge', 'lifeExpectancyAtTargetAgeMonths', 'minimalPension'];
    const floatFields = ['copyrightPercentage', 'pensionContributionRate', 'capitalIndexationRate'];
    let processedValue;

    if (numericFields.includes(name)) {
      processedValue = cleanNumberInput(value, false);
    } else if (floatFields.includes(name)) {
      processedValue = cleanNumberInput(value, true);
    } else {
      processedValue = value; // For non-numeric fields like select, radio
    }
    
    // Length limits (can be removed if min/max validation is robust)
    // if (name === 'birthYear' && processedValue.length > 4) processedValue = processedValue.slice(0, 4);
    // if ((name === 'workYears' || name === 'targetRetirementAge') && processedValue.length > 2) processedValue = processedValue.slice(0, 2);
    // if (name === 'lifeExpectancyAtTargetAgeMonths' && processedValue.length > 3) processedValue = processedValue.slice(0, 3);
 
    setInputs(prevInputs => ({
      ...prevInputs,
      [name]: (name === 'birthMonth' || numericFields.includes(name) || floatFields.includes(name)) && name !== 'scenario' && name !== 'salaryType' && name !== 'salaryPeriod' 
              ? Number(processedValue) 
              : processedValue,
    }));
    
    if (errors[name]) {
      setErrors(prevErrors => ({ ...prevErrors, [name]: '' }));
    }
  };
  
  const handleCalculateAndSave = async () => {
    // First, trigger calculation and validation
    const currentValidationErrors = validateInputs(inputs);
    setErrors(currentValidationErrors);

    const {
      birthMonth,
      initialAccumulatedCapital,
      copyrightPercentage,
      pensionContributionRate,
      capitalIndexationRate,
      targetRetirementAge,
      minimalPension,
      avgSalary,
      birthYear
    } = inputs;

    const isValid = Object.values(currentValidationErrors).every(error => error === '');

    if (!isValid) {
      console.error("Validation errors present. Not saving to history or DB.");
      return;
    }
    
    // Perform calculations again to ensure we have the latest results based on validated inputs
    const currentAgeForCalc = calculateCurrentFullYearsAge(birthYear, birthMonth);
    const annualGrossSalaryForCalc = getAnnualGrossSalary(avgSalary, inputs.salaryType, inputs.salaryPeriod);

    const { capitalData, finalCapitalAtTargetAge } = calculateAccumulatedCapital({
      currentAge: currentAgeForCalc,
      initialCapital: parseFloat(initialAccumulatedCapital),
      annualGrossSalary: annualGrossSalaryForCalc, 
      copyrightPercentage: parseFloat(copyrightPercentage) / 100,
      pensionContributionRate: parseFloat(pensionContributionRate) / 100,
      capitalIndexationRate: parseFloat(capitalIndexationRate) / 100,
      targetRetirementAge: parseInt(targetRetirementAge, 10)
    });

    let finalPension = 0;
    if (finalCapitalAtTargetAge && parseFloat(inputs.lifeExpectancyAtTargetAgeMonths) > 0) {
      finalPension = Math.max(
        finalCapitalAtTargetAge / parseFloat(inputs.lifeExpectancyAtTargetAgeMonths),
        parseFloat(minimalPension) || 0
      );
    }
    
    const widowPension = finalPension * 0.85;

    // Update state for UI just in case it wasn't perfectly synced by debounce
    setAccumulatedCapitalData(capitalData);
    setEstimatedMonthlyPension(finalPension);
    setWidowPensionEstimate(widowPension);

    // Save to Supabase
    const userPokemonAlias = getRandomPokemonName();
    const calculationDataForDb = {
      current_age: currentAgeForCalc, 
      initial_accumulated_capital: parseFloat(initialAccumulatedCapital),
      monthly_gross_salary: parseFloat(avgSalary),
      copyright_percentage_input: parseFloat(copyrightPercentage),
      pension_contribution_rate_input: parseFloat(pensionContributionRate),
      capital_indexation_rate_input: parseFloat(capitalIndexationRate),
      target_retirement_age: parseInt(targetRetirementAge, 10),
      life_expectancy_months: parseInt(inputs.lifeExpectancyAtTargetAgeMonths, 10),
      minimal_pension_input: parseFloat(minimalPension),
      calculated_monthly_pension: finalPension,
      calculated_widow_pension: widowPension,
      user_pokemon_alias: userPokemonAlias,
    };

    try {
      const { data, error } = await supabase
        .from('pension_calculations')
        .insert([calculationDataForDb]);

      if (error) {
        console.error('Error saving calculation to Supabase:', error);
        setSaveStatus(t('saveStatusErrorGeneral'));
      } else {
        console.log('Calculation saved to Supabase:', data);
        setSaveStatus(t('saveStatusSuccess'));
        fetchHistory(); // REFETCH history after successful save
      }
    } catch (error) {
      console.error('Exception during Supabase save:', error);
      setSaveStatus(t('saveStatusError'));
    }

    setTimeout(() => {
      setSaveStatus('');
    }, 3000); // Clear status after 3 seconds

  };

  const clearForm = () => {
    setInputs(defaultInputs);
    setAccumulatedCapitalData(null);
    setEstimatedMonthlyPension(null);
    setWidowPensionEstimate(null);
    setErrors({});
  };

  // This will also need to be updated to use the new capital accumulation model
  const retirementOptions = calculateRetirementOptionsWithCapital({
    birthYear: Number(inputs.birthYear),
    birthMonth: Number(inputs.birthMonth),
    initialWorkYears: Number(inputs.workYears), // Past work years for context
    initialCapital: Number(inputs.initialAccumulatedCapital),
    annualGrossSalary: getAnnualGrossSalary(inputs.avgSalary, inputs.salaryType, inputs.salaryPeriod),
    copyrightPercentage: Number(inputs.copyrightPercentage) / 100,
    pensionContributionRate: Number(inputs.pensionContributionRate) / 100,
    capitalIndexationRate: Number(inputs.capitalIndexationRate) / 100,
    minRetirementAge: 60, // Example, can be adjusted
    maxRetirementAge: 70, // Example
    lifeExpectancyForTableMonths: Number(inputs.lifeExpectancyAtTargetAgeMonths),
    minimalPension: Number(inputs.minimalPension),
    // lifeExpectancyData: GUS_LIFE_EXPECTANCY // Would pass some life expectancy lookup here
  });

  function formatNumber(valStr) {
    const num = Number(valStr);
    if (valStr === '' || valStr === null || valStr === undefined || isNaN(num)) return '';
    // Use i18n.language for locale in toLocaleString
    const locales = { en: 'en-US', pl: 'pl-PL', ru: 'ru-RU' };
    return num.toLocaleString(locales[i18n.language] || 'pl-PL'); // Default to pl-PL if no match
  }

  // Helper for rendering new input fields
  const renderCapitalModelInputs = () => (
    <Grid container spacing={2} sx={{mt:1, mb:2}}>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('initialCapitalTooltip')}>
          <TextField 
            fullWidth 
            label={t('initialCapitalLabel')} 
            name="initialAccumulatedCapital" 
            value={String(inputs.initialAccumulatedCapital)} 
            onChange={handleChange} 
            inputRef={inputRefs.initialAccumulatedCapital} 
            type="number" 
            inputProps={{ min: 0, step: 1000 }} 
            error={!!errors.initialAccumulatedCapital} 
            helperText={errors.initialAccumulatedCapital || ''} />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('copyrightPercentageTooltip')}>
          <TextField fullWidth label={t('copyrightPercentageLabel')} name="copyrightPercentage" value={inputs.copyrightPercentage} onChange={handleChange} inputRef={inputRefs.copyrightPercentage} type="number" inputProps={{ min: 0, max: 100, step: 0.01 }} error={!!errors.copyrightPercentage} helperText={errors.copyrightPercentage || ''} />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('pensionContributionRateTooltip')}>
          <TextField fullWidth label={t('pensionContributionRateLabel')} name="pensionContributionRate" value={inputs.pensionContributionRate} onChange={handleChange} inputRef={inputRefs.pensionContributionRate} type="number" inputProps={{ min: 0, max: 100, step: 0.01 }} error={!!errors.pensionContributionRate} helperText={errors.pensionContributionRate || ''} />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('capitalIndexationRateTooltip')}>
          <TextField fullWidth label={t('capitalIndexationRateLabel')} name="capitalIndexationRate" value={inputs.capitalIndexationRate} onChange={handleChange} inputRef={inputRefs.capitalIndexationRate} type="number" inputProps={{ min: 0, max: 50, step: 0.01 }} error={!!errors.capitalIndexationRate} helperText={errors.capitalIndexationRate || ''} />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('targetRetirementAgeTooltip')}>
          <TextField 
            fullWidth 
            label={t('targetRetirementAgeLabel')} 
            name="targetRetirementAge" 
            value={inputs.targetRetirementAge} 
            onChange={handleChange} 
            inputRef={inputRefs.targetRetirementAge} 
            type="number" 
            inputProps={{ min: 50, max: 80 }} // These are for input control, validation is separate
            error={!!errors.targetRetirementAgeTooLow || !!errors.targetRetirementAgeOutOfRange} 
            helperText={errors.targetRetirementAgeTooLow || errors.targetRetirementAgeOutOfRange || ''} 
          />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('lifeExpectancyTooltip')}>
          <TextField fullWidth label={t('lifeExpectancyLabel')} name="lifeExpectancyAtTargetAgeMonths" value={inputs.lifeExpectancyAtTargetAgeMonths} onChange={handleChange} inputRef={inputRefs.lifeExpectancyAtTargetAgeMonths} type="number" inputProps={{ min: 1, max: 600 }} error={!!errors.lifeExpectancyAtTargetAgeMonths} helperText={errors.lifeExpectancyAtTargetAgeMonths || ''} />
        </MuiTooltip>
      </Grid>
      <Grid item xs={12} sm={6} md={4}>
        <MuiTooltip title={t('minimalPensionTooltip')}>
          <TextField fullWidth label={t('minimalPensionLabel')} name="minimalPension" value={inputs.minimalPension} onChange={handleChange} inputRef={inputRefs.minimalPension} type="number" inputProps={{ min: 0, step: 10 }} error={!!errors.minimalPension} helperText={errors.minimalPension || ''}/>
        </MuiTooltip>
      </Grid>
    </Grid>
  );

  // Функция для изменения языка
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <ThemeProvider theme={theme}>
      <Paper elevation={3} sx={{ p: 3, maxWidth: 900, mx: 'auto', my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" gutterBottom component="div">
            {t('pensionCalculatorCapitalModelTitle')}
          </Typography>
          <Box>
            <Button size="small" onClick={() => changeLanguage('pl')} sx={{ mr: 0.5 }} variant={i18n.language === 'pl' ? 'outlined' : 'text'}>PL</Button>
            <Button size="small" onClick={() => changeLanguage('en')} sx={{ mr: 0.5 }} variant={i18n.language === 'en' ? 'outlined' : 'text'}>EN</Button>
            <Button size="small" onClick={() => changeLanguage('ru')} variant={i18n.language === 'ru' ? 'outlined' : 'text'}>RU</Button>
            <IconButton sx={{ ml: 1 }} onClick={() => setDarkMode(!darkMode)} color="inherit">
              {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Box>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <MuiTooltip title={t('birthYearTooltip')}>
                <TextField fullWidth label={t('birthYearLabel')} name="birthYear" value={inputs.birthYear} onChange={handleChange} /*inputRef={inputRefs.birthYear}*/ /*onKeyDown={e => handleKeyDown(e, 'birthYear')}*/ error={!!errors.birthYear} helperText={errors.birthYear || ''}/>
              </MuiTooltip>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <MuiTooltip title={t('birthMonthTooltip')}>
                <FormControl fullWidth error={!!errors.birthMonth}> {/* Added error prop possible here too if validating month */}
                  <InputLabel id="birth-month-label">{t('birthMonthLabel')}</InputLabel>
                  <Select labelId="birth-month-label" name="birthMonth" value={inputs.birthMonth} label={t('birthMonthLabel')} onChange={handleChange} /*inputRef={inputRefs.birthMonth}*/ /*onKeyDown={e => handleKeyDown(e, 'birthMonth')}*/>
                    {MONTHS.map(opt => (<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>))} {/* Month labels will remain in Russian for now, can be translated later if needed */}
                  </Select>
                  {errors.birthMonth && <Typography color="error" variant="caption">{errors.birthMonth}</Typography>}
                </FormControl>
              </MuiTooltip>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <MuiTooltip title={t('workYearsTooltip')}>
                <TextField fullWidth label={t('workYearsLabel')} name="workYears" value={inputs.workYears} onChange={handleChange} /*inputRef={inputRefs.workYears} onKeyDown={e => handleKeyDown(e, 'workYears')}*/ error={!!errors.workYears} helperText={errors.workYears || ''} />
              </MuiTooltip>
            </Grid>
             <Grid item xs={12} sm={8} md={5}>
              <MuiTooltip title={t('avgSalaryTooltip', { 
                salaryPeriod: inputs.salaryPeriod === 'year' ? t('salaryPeriodYearLocative') : t('salaryPeriodMonthLocative'), 
                salaryType: inputs.salaryType === 'brutto' ? t('salaryTypeBruttoAccusative') : t('salaryTypeNettoAccusative') 
              })}>
                <TextField 
                  fullWidth 
                  label={inputs.salaryPeriod === 'year' ? t('avgSalaryLabelYear') : t('avgSalaryLabelMonth')} 
                  name="avgSalary" 
                  value={formatNumber(inputs.avgSalary)} 
                  onChange={handleChange} 
                  error={!!errors.avgSalary} 
                  helperText={errors.avgSalary || ''}
                />
              </MuiTooltip>
            </Grid>
            <Grid item xs={12} sm={4} md={3} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControl>
                <RadioGroup row name="salaryType" value={inputs.salaryType} onChange={handleChange}>
                  <FormControlLabel value="brutto" control={<Radio size="small" />} label={t('salaryTypeLabelBrutto')} />
                  <FormControlLabel value="netto" control={<Radio size="small" />} label={t('salaryTypeLabelNetto')} />
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={12} md={4} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControl>
                <RadioGroup row name="salaryPeriod" value={inputs.salaryPeriod} onChange={handleChange}>
                  <FormControlLabel value="year" control={<Radio size="small" />} label={t('salaryPeriodLabelYear')} />
                  <FormControlLabel value="month" control={<Radio size="small" />} label={t('salaryPeriodLabelMonth')} />
                </RadioGroup>
              </FormControl>
            </Grid>
          </Grid>
          
          {/* Сценарий пока один, можно будет вернуть если понадобится выбор моделей */}
          {/* <MuiTooltip title="Выберите сценарий/модель расчета пенсии.">
            <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
              <InputLabel id="scenario-label">Модель расчёта</InputLabel>
              <Select labelId="scenario-label" name="scenario" value={inputs.scenario} label="Модель расчёта" onChange={handleChange}>
                {SCENARIOS.map(opt => (<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>))}
              </Select>
            </FormControl>
          </MuiTooltip> */} 

          {inputs.scenario === 'capital_model' && renderCapitalModelInputs()}

          {/* Spouse salary - temporarily hidden as it's not directly used in individual capital model yet */}
          {/* {['widow', 'joint'].includes(inputs.scenario) && (...) } */}

          <Button 
            variant="contained" 
            color={saveStatus === t('saveStatusSuccess') ? 'success' : (saveStatus === t('saveStatusError') || saveStatus === t('saveStatusErrorGeneral')) ? 'error' : 'primary'}
            onClick={handleCalculateAndSave} 
            fullWidth 
            sx={{ mt:2, mb: 1 }}
            disabled={saveStatus === t('saveStatusSuccess')}
            startIcon={saveStatus === t('saveStatusSuccess') ? <CheckCircleOutlineIcon /> : null}
          >
            {saveStatus || t('calculateAndSaveButton')}
          </Button>
          <Button variant="outlined" color="secondary" onClick={clearForm} fullWidth>
            {t('clearFormButton')}
          </Button>
        </Box>

        <Accordion sx={{ mt: 2, mb: 2 }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="pension-explanation-content"
            id="pension-explanation-header"
          >
            <Typography variant="subtitle1">{t('accordionExplanationTitle')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" component="div">
              <p><strong>{t('accordionPrinciplesTitle')}</strong></p>
              <ul>
                <li>{t('accordionPrinciple1')}</li>
                <li>{t('accordionPrinciple2')}</li>
                <li>{t('accordionPrinciple3_1')}<br />
                  <code>{t('accordionPrinciple3_2_formula')}</code></li>
                <li>{t('accordionPrinciple4_1')}<br />
                  <code>{t('accordionPrinciple4_2_formula')}</code></li>
                <li>{t('accordionPrinciple5')}</li>
                <li>{t('accordionPrinciple6')}</li>
                <li>{t('accordionPrinciple7')}</li>
              </ul>
              <p><strong>{t('accordionInputFieldsTitle')}</strong></p>
              <ul>
                <li>{t('accordionInputField1')}</li>
                <li>{t('accordionInputField2')}</li>
                <li>{t('accordionInputField3')}</li>
                <li>{t('accordionInputField4')}</li>
                <li>{t('accordionInputField5')}</li>
                <li>{t('accordionInputField6')}</li>
                <li>{t('accordionInputField7')}</li>
                <li>{t('accordionInputField8')}</li>
                <li>{t('accordionInputField9')}</li>
                <li>{t('accordionInputField10')}</li>
              </ul>
            </Typography>
          </AccordionDetails>
        </Accordion>

        {inputs.scenario === 'capital_model' && (
          <Box sx={{ mt: 4 }}>
            {accumulatedCapitalData && accumulatedCapitalData.length > 0 && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  {t('capitalForecastTitle', { age: inputs.targetRetirementAge })}
                </Typography>
                <Box sx={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={accumulatedCapitalData} 
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      fontFamily={muiTheme.typography.fontFamily} // Use theme font
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={muiTheme.palette.divider} />
                      <XAxis 
                        dataKey="year" 
                        stroke={muiTheme.palette.text.secondary} 
                        tick={{ fill: muiTheme.palette.text.secondary, fontSize: '0.8rem' }}
                      />
                      <YAxis 
                        tickFormatter={formatNumber} 
                        stroke={muiTheme.palette.text.secondary}
                        tick={{ fill: muiTheme.palette.text.secondary, fontSize: '0.8rem' }}
                        width={80} // Adjust width for Y-axis labels
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: muiTheme.palette.background.paper,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          borderRadius: muiTheme.shape.borderRadius,
                        }}
                        itemStyle={{ color: muiTheme.palette.text.primary }}
                        formatter={(value, name) => [formatNumber(value), name === 'capital' ? t('chartTooltipCapitalLabel') : name]} 
                      />
                      <Legend 
                        wrapperStyle={{ color: muiTheme.palette.text.secondary, paddingTop: '10px' }} 
                        formatter={v => v === 'capital' ? t('chartLegendAccumulatedCapital') : v} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="capital" 
                        stroke={muiTheme.palette.primary.main} 
                        strokeWidth={2} // Slightly thicker line
                        activeDot={{ r: 8, stroke: muiTheme.palette.background.paper, strokeWidth: 2 }} 
                        dot={{ r: 3, fill: muiTheme.palette.primary.main }} // Smaller default dots
                        name={t('chartLineNameAccumulatedCapital')} // This name is used by formatter if not overridden by legend formatter
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            )}
            {estimatedMonthlyPension !== null && (
              <Typography variant="h5" sx={{ mt: 2, textAlign: 'center' }}>
                {t('estimatedPensionResult_part1', { age: inputs.targetRetirementAge })}
                <strong style={{color: '#1976d2'}}>{formatNumber(estimatedMonthlyPension)} PLN/мес.</strong> 
                {t('estimatedPensionResult_part2')}
              </Typography>
            )}
            {widowPensionEstimate !== null && estimatedMonthlyPension > 0 && (
               <Typography variant="body1" sx={{ mt: 1, textAlign: 'center', color: 'text.secondary' }}>
                  {t('widowPensionResult', { amount: formatNumber(widowPensionEstimate) })}
               </Typography>
            )}
            {retirementOptions && retirementOptions.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1">{t('retirementOptionsTableTitle')}</Typography>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColYearTooltip')}><Typography variant="caption">{t('tableColYear')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColAgeTooltip')}><Typography variant="caption">{t('tableColAge')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColTotalContributionYearsTooltip')}><Typography variant="caption">{t('tableColTotalContributionYears')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColAccumulatedCapitalTooltip')}><Typography variant="caption">{t('tableColAccumulatedCapital')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColLifeExpectancyTooltip')}><Typography variant="caption">{t('tableColLifeExpectancy')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColPensionYear1Tooltip')}><Typography variant="caption">{t('tableColPensionYear1')}</Typography></MuiTooltip></th>
                    <th style={{ border: '1px solid #ccc', padding: 4, fontWeight: 'bold' }}><MuiTooltip title={t('tableColPensionYear5Tooltip')}><Typography variant="caption">{t('tableColPensionYear5')}</Typography></MuiTooltip></th>
                  </tr>
                </thead>
                <tbody>
                  {retirementOptions.map(opt => (
                    <tr key={opt.retirementYear}>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{opt.retirementYear}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{opt.ageAtRetirement}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{opt.totalYearsOfContribution}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{formatNumber(Math.round(opt.accumulatedCapital))}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{opt.lifeExpectancyMonths}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{formatNumber(Math.round(opt.monthlyPensionYear1))}</td>
                      <td style={{ border: '1px solid #ccc', padding: 4 }}>{formatNumber(Math.round(opt.monthlyPensionYear5))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </Box>
            )}
          </Box>
        )}
        
        {/* Display for old model if scenario was different (currently commented out) */}
        {/* {inputs.scenario !== 'capital_model' && prediction && (...) } */}

        {history.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>{t('historyTableTitle')}</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><MuiTooltip title={t('historyColDateTimeTooltip')}><Typography variant="caption">{t('historyColDateTime')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColUserTooltip')}><Typography variant="caption">{t('historyColUser')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColAgeTooltip')}><Typography variant="caption">{t('historyColAge')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColSalaryTooltip')}><Typography variant="caption">{t('historyColSalary')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColInitialCapitalTooltip')}><Typography variant="caption">{t('historyColInitialCapital')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColCopyrightShareTooltip')}><Typography variant="caption">{t('historyColCopyrightShare')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColPensionContributionRateTooltip')}><Typography variant="caption">{t('historyColPensionContributionRate')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColCapitalIndexationRateTooltip')}><Typography variant="caption">{t('historyColCapitalIndexationRate')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColTargetRetirementAgeTooltip')}><Typography variant="caption">{t('historyColTargetRetirementAge')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColLifeExpectancyTooltip')}><Typography variant="caption">{t('historyColLifeExpectancy')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColMinimalPensionTooltip')}><Typography variant="caption">{t('historyColMinimalPension')}</Typography></MuiTooltip></TableCell>
                    <TableCell><MuiTooltip title={t('historyColCalculatedPensionTooltip')}><Typography variant="caption">{t('historyColCalculatedPension')}</Typography></MuiTooltip></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyLoading ? (
                    <TableRow><TableCell colSpan={12} align="center" sx={{ py: 3 }}><CircularProgress size={24} /> <Typography variant="caption" sx={{ml:1}}>{t('loadingHistory')}</Typography></TableCell></TableRow>
                  ) : historyError ? (
                    <TableRow><TableCell colSpan={12} align="center" sx={{ py: 3, color: 'error.main' }}>{historyError}</TableCell></TableRow>
                  ) : history.length === 0 ? (
                    <TableRow><TableCell colSpan={12} align="center" sx={{ py: 3 }}>{t('historyEmpty')}</TableCell></TableRow>
                  ) : (
                    history.map(item => ( 
                      <TableRow key={item.id} sx={{ '&:hover': { backgroundColor: muiTheme.palette.action.hover }}}>
                        <TableCell sx={{fontSize: '0.8rem', whiteSpace: 'nowrap'}}>{new Date(item.created_at).toLocaleString(
                          i18n.language === 'en' ? 'en-GB' : 
                          i18n.language === 'pl' ? 'pl-PL' : 
                          i18n.language === 'ru' ? 'ru-RU' : 
                          'pl-PL', // Default to pl-PL
                          { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
                        )}</TableCell>
                        <TableCell sx={{fontSize: '0.8rem'}}>{item.user_pokemon_alias}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.current_age}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{formatNumber(item.monthly_gross_salary)}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{formatNumber(item.initial_accumulated_capital)}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.copyright_percentage_input}%</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.pension_contribution_rate_input}%</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.capital_indexation_rate_input}%</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.target_retirement_age}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{item.life_expectancy_months}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem'}}>{formatNumber(item.minimal_pension_input)}</TableCell>
                        <TableCell align="right" sx={{fontSize: '0.8rem', fontWeight: 'bold'}}>{formatNumber(item.calculated_monthly_pension)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>
    </ThemeProvider>
  );
};

export default PensionCalculator; 