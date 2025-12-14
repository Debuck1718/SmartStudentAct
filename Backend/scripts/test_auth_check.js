import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('Please set TOKEN env var to a valid JWT.');
  process.exit(2);
}

async function testAuthCheck() {
  try {
    const res = await fetch(`${API_BASE}/auth/check`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testAuthCheck();
