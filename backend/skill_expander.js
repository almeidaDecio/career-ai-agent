const fs = require('fs');
const path = require('path');

const DICT_PATH = path.join(__dirname, '..', 'dicionario_subprodutos.json');
let dictionary = null;

function loadDictionary() {
  if (dictionary) return dictionary;
  try {
    const raw = fs.readFileSync(DICT_PATH, 'utf8');
    dictionary = JSON.parse(raw);
    return dictionary;
  } catch (e) {
    console.error('Erro ao carregar dicionario_subprodutos.json:', e.message);
    dictionary = {};
    return dictionary;
  }
}

function expand(skills, jobText) {
  const dict = loadDictionary();
  const textLower = (jobText || '').toLowerCase();
  const result = [];

  for (const skill of (skills || [])) {
    result.push(skill);
    const skillLower = skill.toLowerCase().trim();
    for (const [key, subSkills] of Object.entries(dict)) {
      const keyLower = key.toLowerCase();
      if (skillLower.includes(keyLower) || keyLower.includes(skillLower)) {
        for (const sub of subSkills) {
          if (textLower.includes(sub.toLowerCase())) {
            result.push(sub);
          }
        }
      }
    }
  }

  const seen = new Set();
  return result.filter(s => {
    const key = s.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { expand, loadDictionary };
