const testUrl = 'http://127.0.0.1:3000';

async function testConnection() {
  console.log('Testing connection to:', testUrl);
  try {
    const response = await fetch(`${testUrl}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    if (response.ok) {
      const data = await response.json();
      console.log('Models:', data.data.map((m) => m.id));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testConnection();
