import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const TOKEN = process.env.TOKEN; // set to a teacher/admin token for auth

if (!TOKEN) {
  console.error('Please set TOKEN env var to a valid teacher/admin JWT.');
  process.exit(2);
}

async function testGrant() {
  const grants = [
    { userId: process.env.TEST_USER_ID || '', type: 'badge', points: 5, description: 'Test reward' }
  ];

  if (!grants[0].userId) {
    console.error('Provide TEST_USER_ID environment variable for a real user id to test against.');
    process.exit(2);
  }

  try {
    const res = await fetch(`${API_BASE}/teacher/calendar/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ grants }),
    });

    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}

testGrant();
