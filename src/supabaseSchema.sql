-- users (если не использовать стандартную auth таблицу Supabase)
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- pension_laws (параметры законодательства)
CREATE TABLE IF NOT EXISTS pension_laws (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    base_rate NUMERIC NOT NULL,
    indexation NUMERIC NOT NULL,
    min_retirement_age INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- user_inputs (вводимые пользователем параметры)
CREATE TABLE IF NOT EXISTS user_inputs (
    id SERIAL PRIMARY KEY,
    user_id uuid REFERENCES users(id),
    birth_year INT NOT NULL,
    work_years INT NOT NULL,
    avg_salary NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- pension_predictions (история прогнозов)
CREATE TABLE IF NOT EXISTS pension_predictions (
    id SERIAL PRIMARY KEY,
    user_id uuid REFERENCES users(id),
    input_id INT REFERENCES user_inputs(id),
    prediction JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Пример наполнения таблицы законодательства
INSERT INTO pension_laws (year, base_rate, indexation, min_retirement_age)
VALUES
(2024, 1338.44, 0.07, 65),
(2025, 1400.00, 0.06, 65)
ON CONFLICT DO NOTHING; 