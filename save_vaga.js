const Database = require('better-sqlite3');
const http = require('http');

const db = new Database('career_agent.db');

const insert = db.prepare(`
  INSERT INTO vagas (
    job_title, company, seniority, experience_years_min,
    location, required_skills, nice_to_have_skills,
    responsibilities, tools, ats_keywords
  ) VALUES (
    @job_title, @company, @seniority, @experience_years_min,
    @location, @required_skills, @nice_to_have_skills,
    @responsibilities, @tools, @ats_keywords
  )
`);

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const vaga = JSON.parse(body);
        insert.run({
          job_title: vaga.job_title || null,
          company: vaga.company || null,
          seniority: vaga.seniority || null,
          experience_years_min: vaga.experience_years_min || null,
          location: vaga.location || null,
          required_skills: JSON.stringify(vaga.required_skills || []),
          nice_to_have_skills: JSON.stringify(vaga.nice_to_have_skills || []),
          responsibilities: JSON.stringify(vaga.responsibilities || []),
          tools: JSON.stringify(vaga.tools || []),
          ats_keywords: JSON.stringify(vaga.ats_keywords || [])
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        console.log('Vaga salva:', vaga.job_title, '-', vaga.company);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
});