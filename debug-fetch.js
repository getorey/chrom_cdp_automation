
import http from 'http';

async function testFetch(url) {
  console.log(`Testing fetch to: ${url}`);
  try {
    const response = await fetch(url);
    console.log(`Fetch Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response length: ${text.length}`);
  } catch (error) {
    console.error('Fetch failed:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

function testHttp(hostname, port, path) {
  console.log(`Testing http.request to: ${hostname}:${port}${path}`);
  return new Promise((resolve) => {
    const options = {
      hostname,
      port,
      path,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      console.log(`HTTP Status: ${res.statusCode}`);
      res.on('data', () => {});
      res.on('end', resolve);
    });

    req.on('error', (e) => {
      console.error(`HTTP Request failed: ${e.message}`);
      resolve();
    });
    
    req.end();
  });
}

console.log('--- Testing localhost (Fetch) ---');
await testFetch('http://localhost:3000/v1/models');

console.log('\n--- Testing 127.0.0.1 (Fetch) ---');
await testFetch('http://127.0.0.1:3000/v1/models');

console.log('\n--- Testing localhost (http) ---');
await testHttp('localhost', 3000, '/v1/models');

console.log('\n--- Testing 127.0.0.1 (http) ---');
await testHttp('127.0.0.1', 3000, '/v1/models');
