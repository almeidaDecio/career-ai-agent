const Database = require('better-sqlite3');

const db = new Database('career_agent.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS vagas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT,
    company TEXT,
    seniority TEXT,
    experience_years_min INTEGER,
    location TEXT,
    required_skills TEXT,
    nice_to_have_skills TEXT,
    responsibilities TEXT,
    tools TEXT,
    ats_keywords TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('Banco criado com sucesso!');
db.close();