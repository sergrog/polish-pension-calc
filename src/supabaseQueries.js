import { supabase } from './supabaseClient'

// Получить параметры законодательства
export async function getPensionLaws() {
  const { data, error } = await supabase.from('pension_laws').select('*')
  return { data, error }
}

// Сохранить пользовательский ввод
export async function saveUserInput(userId, birthYear, workYears, avgSalary) {
  const { data, error } = await supabase.from('user_inputs').insert([{ user_id: userId, birth_year: birthYear, work_years: workYears, avg_salary: avgSalary }])
  return { data, error }
}

// Получить историю прогнозов пользователя
export async function getUserPredictions(userId) {
  const { data, error } = await supabase.from('pension_predictions').select('*').eq('user_id', userId)
  return { data, error }
}

// Сохранить прогноз
export async function savePrediction(userId, inputId, prediction) {
  const { data, error } = await supabase.from('pension_predictions').insert([{ user_id: userId, input_id: inputId, prediction }])
  return { data, error }
} 