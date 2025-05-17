import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nzqqldtpafrrbbpzcaes.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cXFsZHRwYWZycmJicHpjYWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc0MDM2OTcsImV4cCI6MjA2Mjk3OTY5N30.Aqx-i1L56mUA40_qLWhzpRdnqHaYbu23P4JfKS6qcoE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY) 