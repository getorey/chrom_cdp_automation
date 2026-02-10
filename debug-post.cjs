
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(JSON.stringify({
  model: 'NCSOFT/VARCO-VISION-2.0-1.7B-OCR',
  messages: [{
      role: 'user',
      content: 'hello'
  }],
  max_tokens: 10
}));
req.end();
