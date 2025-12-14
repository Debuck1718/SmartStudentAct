import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const TOKEN = process.env.TOKEN; // set to a teacher/admin token for auth
const ACADEMIC_YEAR = process.env.ACADEMIC_YEAR || '';
const TERM_NAME = process.env.TERM_NAME || '';

if (!TOKEN) {
  console.error('Please set TOKEN env var to a valid teacher/admin JWT.');
  process.exit(2);
}
if (!ACADEMIC_YEAR || !TERM_NAME) {
  console.error('Please set ACADEMIC_YEAR and TERM_NAME env vars to test results endpoint.');
  process.exit(2);
}

async function testResults() {
  try {
    const res = await fetch(`${API_BASE}/teacher/calendar/results?academicYear=${encodeURIComponent(ACADEMIC_YEAR)}&termName=${encodeURIComponent(TERM_NAME)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testResults();
