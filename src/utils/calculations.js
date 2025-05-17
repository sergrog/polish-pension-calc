const PENSION_PAYOUT_INDEXATION_RATE = 0.03; // Примерная годовая индексация уже выплачиваемой пенсии
const COPYRIGHT_KUP_RATE = 0.5; // 50% Koszty Uzyskania Przychodu for creative work
const COPYRIGHT_ZUS_EXEMPT_DEDUCTION_CAP_ANNUAL = 120000; // PLN, годовой лимит на сумму вычета из базы ZUS

/**
 * Рассчитывает накопленный пенсионный капитал год за годом.
 * @param {object} params - Параметры для расчета.
 * @param {number} params.currentAge - Текущий возраст пользователя (полных лет).
 * @param {number} params.initialCapital - Начальный накопленный капитал (PLN).
 * @param {number} params.annualGrossSalary - Годовая брутто-зарплата (PLN).
 * @param {number} params.copyrightPercentage - Доля творческого дохода в общей зарплате (0-1, где 1 = 100%).
 * @param {number} params.pensionContributionRate - Общая ставка пенсионных взносов (0-1).
 * @param {number} params.capitalIndexationRate - Годовая ставка индексации капитала (0-1).
 * @param {number} params.targetRetirementAge - Целевой возраст выхода на пенсию.
 * @returns {{capitalData: Array<{year: number, age: number, capital: number}>, finalCapitalAtTargetAge: number}}
 */
export function calculateAccumulatedCapital({
  currentAge,
  initialCapital = 0,
  annualGrossSalary,
  copyrightPercentage = 0, // fraction, e.g., 0.5 for 50%
  pensionContributionRate, 
  capitalIndexationRate,   
  targetRetirementAge,
}) {
  const capitalData = [];
  let currentYearCapital = initialCapital;
  const currentSystemYear = new Date().getFullYear();

  // Рассчитываем базу для пенсионных взносов с учетом авторских прав
  const creativeSalaryAmount = annualGrossSalary * copyrightPercentage;
  let zusExemptAmountDueToCopyright = creativeSalaryAmount * COPYRIGHT_KUP_RATE;
  
  // Применяем годовой лимит на сумму освобождения от ZUS
  zusExemptAmountDueToCopyright = Math.min(zusExemptAmountDueToCopyright, COPYRIGHT_ZUS_EXEMPT_DEDUCTION_CAP_ANNUAL);
  
  const contributionBase = Math.max(0, annualGrossSalary - zusExemptAmountDueToCopyright);
  const annualContribution = contributionBase * pensionContributionRate;

  // Первый год в графике - текущее состояние, если возраст уже >= currentAge
  // или начальный капитал, если симуляция начинается немедленно
  if (targetRetirementAge >= currentAge) {
      capitalData.push({
          year: currentSystemYear,
          age: currentAge,
          capital: Math.round(currentYearCapital),
      });
  }
  
  const yearsToSimulate = targetRetirementAge - currentAge;

  for (let i = 0; i < yearsToSimulate; i++) {
    const ageInYear = currentAge + i + 1;
    currentYearCapital = currentYearCapital * (1 + capitalIndexationRate);
    currentYearCapital += annualContribution;
    
    capitalData.push({
      year: currentSystemYear + i + 1,
      age: ageInYear,
      capital: Math.round(currentYearCapital),
    });
  }

  return {
    capitalData,
    finalCapitalAtTargetAge: Math.round(currentYearCapital),
  };
}

/**
 * Рассчитывает варианты выхода на пенсию на основе модели накопления капитала.
 * @param {object} params - Параметры.
 * @param {number} params.birthYear - Год рождения.
 * @param {number} params.birthMonth - Месяц рождения (1-12).
 * @param {number} params.initialWorkYears - Прошлый стаж (лет), соответствующий начальному капиталу.
 * @param {number} params.initialCapital - Начальный накопленный капитал.
 * @param {number} params.annualGrossSalary - Годовая брутто-зарплата.
 * @param {number} params.copyrightPercentage - Процент авторских отчислений (0-1).
 * @param {number} params.pensionContributionRate - Ставка пенсионных взносов (0-1).
 * @param {number} params.capitalIndexationRate - Ставка индексации капитала (0-1).
 * @param {number} params.minRetirementAge - Минимальный возраст для таблицы вариантов.
 * @param {number} params.maxRetirementAge - Максимальный возраст для таблицы вариантов.
 * @param {number} params.lifeExpectancyForTableMonths - Ожидаемая продолжительность жизни в месяцах (единая для таблицы).
 * @param {number} params.minimalPension - Минимальная месячная пенсия.
 * @returns {Array<object>} - Массив объектов с вариантами пенсии.
 */
export function calculateRetirementOptionsWithCapital({
  birthYear,
  birthMonth,
  initialWorkYears = 0,
  initialCapital = 0,
  annualGrossSalary,
  copyrightPercentage = 0,
  pensionContributionRate,
  capitalIndexationRate,
  minRetirementAge = 60,
  maxRetirementAge = 70,
  lifeExpectancyForTableMonths, // Используется одна и та же ОПЖ для всех возрастов в таблице
  minimalPension = 0,
}) {
  const options = [];
  const today = new Date();
  const currentSystemYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12

  let currentFullAge = currentSystemYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && today.getDate() < 1)) { // Более точный расчет возраста
    currentFullAge--;
  }
  currentFullAge = Math.max(0, currentFullAge);

  for (let ageToConsider = minRetirementAge; ageToConsider <= maxRetirementAge; ageToConsider++) {
    if (ageToConsider < currentFullAge) continue; // Не показывать варианты для возраста меньше текущего

    const capitalResult = calculateAccumulatedCapital({
      currentAge: currentFullAge, // Симуляция начинается с текущего возраста пользователя
      initialCapital,
      annualGrossSalary,
      copyrightPercentage, // Передается как есть (уже дробь 0-1)
      pensionContributionRate,
      capitalIndexationRate,
      targetRetirementAge: ageToConsider, // Целевой возраст - текущий рассматриваемый в цикле
    });

    const accumulatedCapitalAtThisAge = capitalResult.finalCapitalAtTargetAge;
    let monthlyPensionFromCapital = 0;
    if (accumulatedCapitalAtThisAge > 0 && lifeExpectancyForTableMonths > 0) {
      monthlyPensionFromCapital = accumulatedCapitalAtThisAge / lifeExpectancyForTableMonths;
    }

    const finalMonthlyPensionYear1 = Math.max(monthlyPensionFromCapital, minimalPension);

    // Расчет пенсии на 5-й год с учетом индексации выплат
    let monthlyPensionYear5 = finalMonthlyPensionYear1;
    for (let k = 0; k < 4; k++) { // Индексация за 4 периода (конец 1-го, 2-го, 3-го, 4-го года)
        monthlyPensionYear5 *= (1 + PENSION_PAYOUT_INDEXATION_RATE);
    }
    
    const yearsOfFutureContribution = Math.max(0, ageToConsider - currentFullAge);
    const totalYearsOfContribution = initialWorkYears + yearsOfFutureContribution;

    options.push({
      retirementYear: birthYear + ageToConsider,
      ageAtRetirement: ageToConsider,
      totalYearsOfContribution: totalYearsOfContribution,
      accumulatedCapital: Math.round(accumulatedCapitalAtThisAge),
      lifeExpectancyMonths: lifeExpectancyForTableMonths, // Используется введенное пользователем значение
      monthlyPensionYear1: Math.round(finalMonthlyPensionYear1),
      monthlyPensionYear5: Math.round(monthlyPensionYear5),
    });
  }
  return options;
} 