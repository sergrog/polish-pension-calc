import { useState, useEffect } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline, Container, Typography, Box, TextField, Button, MenuItem, Select, FormControl, InputLabel, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip as MuiTooltip } from '@mui/material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getUserPredictions, savePrediction } from './supabaseQueries'
// import { supabase } from './supabaseClient' // будет добавлено после получения данных

const colorThemes = {
  light: createTheme({ palette: { mode: 'light' } }),
  dark: createTheme({ palette: { mode: 'dark' } }),
  blue: createTheme({ palette: { mode: 'light', primary: { main: '#1976d2' } } }),
}

const SCENARIOS = [
  { value: 'zus_brutto', label: 'ZUS (Brutto)', desc: 'Стандартная государственная пенсия до вычета налогов. Индексация 3% в год.' },
  { value: 'zus_netto', label: 'ZUS (Netto)', desc: 'Государственная пенсия после вычета подоходного налога (17%). Индексация 3% в год.' },
  { value: 'zus_joint', label: 'ZUS (Совместное налогообложение)', desc: 'Совместное налогообложение супругов: налог 12% при доходе до 120 000 PLN, далее 32%. Индексация 3% в год.' },
  { value: 'krus', label: 'KRUS (сельское хозяйство)', desc: 'Фиксированная минимальная пенсия для сельхозработников. Индексация 3% в год.' },
  { value: 'ofe', label: 'OFE (Открытый пенсионный фонд)', desc: 'Открытый пенсионный фонд: 35% от зарплаты + 5% накоплений. Индексация 3% в год.' },
  { value: 'widow', label: 'Вдовья пенсия', desc: '60% пенсии умершего супруга, если выгоднее, чем собственная.' },
]

function calcJointTax(pension1, pension2) {
  // Совместное налогообложение: налог 12% до 120 000 PLN, далее 32%
  const total = pension1 + pension2
  if (total <= 120000) return total * 0.88
  return 120000 * 0.88 + (total - 120000) * 0.68
}

export function calculatePension({ age, workYears, salary, scenario, spouse }) {
  const years = Array.from({ length: 25 }, (_, i) => 2024 + i)
  let base = Number(salary)
  let pensions = []
  switch (scenario) {
    case 'zus_brutto':
      pensions = years.map((year, i) => ({
        year,
        pension: Math.round(base * 0.4 * Math.pow(1.03, i)),
      }))
      break
    case 'zus_netto':
      pensions = years.map((year, i) => ({
        year,
        pension: Math.round(base * 0.4 * 0.83 * Math.pow(1.03, i)),
      }))
      break
    case 'zus_joint':
      if (!spouse) return []
      pensions = years.map((year, i) => {
        const p1 = base * 0.4 * Math.pow(1.03, i)
        const p2 = Number(spouse.salary) * 0.4 * Math.pow(1.03, i)
        return {
          year,
          pension: Math.round(calcJointTax(p1, p2) / 2), // делим на 2 для индивидуального прогноза
          spouse: Math.round(calcJointTax(p1, p2) / 2),
        }
      })
      break
    case 'krus':
      pensions = years.map((year, i) => ({
        year,
        pension: Math.round(1600 * Math.pow(1.03, i)),
      }))
      break
    case 'ofe':
      pensions = years.map((year, i) => ({
        year,
        pension: Math.round((base * 0.35 + base * 0.05) * Math.pow(1.03, i)),
      }))
      break
    case 'widow':
      if (!spouse) return []
      pensions = years.map((year, i) => {
        const own = base * 0.4 * Math.pow(1.03, i)
        const spousePension = Number(spouse.salary) * 0.4 * Math.pow(1.03, i)
        return {
          year,
          pension: Math.round(Math.max(own, spousePension * 0.6)),
          spouse: Math.round(spousePension),
        }
      })
      break
    default:
      pensions = years.map((year, i) => ({
        year,
        pension: Math.round(base * 0.4 + i * 100),
      }))
  }
  return pensions
}

function App() {
  const [theme, setTheme] = useState('light')
  const [age, setAge] = useState('')
  const [workYears, setWorkYears] = useState('')
  const [salary, setSalary] = useState('')
  const [scenario, setScenario] = useState('zus_brutto')
  const [result, setResult] = useState(null)
  const [showSpouse, setShowSpouse] = useState(false)
  const [spouseSalary, setSpouseSalary] = useState('')
  const [spouseWorkYears, setSpouseWorkYears] = useState('')
  const [userId, setUserId] = useState('demo-user') // TODO: заменить на реального пользователя после авторизации
  const [history, setHistory] = useState([])

  useEffect(() => {
    // Загрузка истории прогнозов пользователя из Supabase
    async function fetchHistory() {
      const { data, error } = await getUserPredictions(userId)
      if (data) setHistory(data)
    }
    fetchHistory()
  }, [userId])

  const handleCalculate = async () => {
    if (!age || !workYears || !salary) return
    let spouse = null
    if (showSpouse && (spouseSalary || scenario === 'widow' || scenario === 'zus_joint')) {
      spouse = { salary: spouseSalary, workYears: spouseWorkYears }
    }
    const prediction = calculatePension({ age, workYears, salary, scenario, spouse })
    setResult(prediction)
    // Сохраняем прогноз в Supabase
    await savePrediction(userId, null, prediction)
    // Обновляем историю
    const { data } = await getUserPredictions(userId)
    if (data) setHistory(data)
  }

  const scenarioDesc = SCENARIOS.find(s => s.value === scenario)?.desc

  return (
    <ThemeProvider theme={colorThemes[theme] || colorThemes.light}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4">Polski Kalkulator Emerytalny</Typography>
          <FormControl size="small">
            <InputLabel>Тема</InputLabel>
            <Select value={theme} label="Тема" onChange={e => setTheme(e.target.value)}>
              <MenuItem value="light">Светлая</MenuItem>
              <MenuItem value="dark">Тёмная</MenuItem>
              <MenuItem value="blue">Синяя</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box component="form" display="flex" flexDirection="column" gap={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField label="Возраст" type="number" value={age} onChange={e => setAge(e.target.value)} required fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Стаж (лет)" type="number" value={workYears} onChange={e => setWorkYears(e.target.value)} required fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Средняя зарплата (PLN)" type="number" value={salary} onChange={e => setSalary(e.target.value)} required fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Сценарий</InputLabel>
                <Select value={scenario} label="Сценарий" onChange={e => setScenario(e.target.value)}>
                  {SCENARIOS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Button variant="outlined" sx={{ mt: 2, mb: 1 }} onClick={() => setShowSpouse(v => !v)}>{showSpouse ? 'Скрыть супруга(у)' : 'Добавить супруга(у)'}</Button>
          {showSpouse && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Зарплата супруга(и) (PLN)" type="number" value={spouseSalary} onChange={e => setSpouseSalary(e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Стаж супруга(и) (лет)" type="number" value={spouseWorkYears} onChange={e => setSpouseWorkYears(e.target.value)} fullWidth />
              </Grid>
            </Grid>
          )}
          <MuiTooltip title={scenarioDesc || ''} placement="top" arrow>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{scenarioDesc}</Typography>
          </MuiTooltip>
          <Button variant="contained" onClick={handleCalculate}>Рассчитать пенсию</Button>
        </Box>
        <Box mt={4}>
          {result && result.length > 0 && (
            <>
              <Typography variant="h6">Прогноз пенсии на 25 лет</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip formatter={v => `${v} PLN`} />
                  <Line type="monotone" dataKey="pension" stroke="#1976d2" strokeWidth={2} dot={false} />
                  {result[0].spouse && <Line type="monotone" dataKey="spouse" stroke="#ff9800" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
              <TableContainer component={Paper} sx={{ mt: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Год</TableCell>
                      <TableCell>Ваша пенсия (PLN)</TableCell>
                      {result[0].spouse && <TableCell>Пенсия супруга(и) (PLN)</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.map(row => (
                      <TableRow key={row.year}>
                        <TableCell>{row.year}</TableCell>
                        <TableCell>{row.pension}</TableCell>
                        {row.spouse && <TableCell>{row.spouse}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
        <Box mt={4}>
          {history && history.length > 0 && (
            <>
              <Typography variant="h6">История прогнозов</Typography>
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Прогноз (JSON)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map(row => (
                      <TableRow key={row.id}>
                        <TableCell>{row.created_at?.slice(0, 19).replace('T', ' ')}</TableCell>
                        <TableCell><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{JSON.stringify(row.prediction, null, 2)}</pre></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App
