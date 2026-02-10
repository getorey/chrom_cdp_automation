# Diagnostic Test Script for VARCO-VISION API
# This script tests various scenarios to identify the issue

print("=" * 70)
print("VARCO-VISION API Diagnostic Tool")
print("=" * 70)

# Test 1: Server Connectivity
print("\n[TEST 1] Checking server connectivity...")
print("-" * 70)

import urllib.request
import json

try:
    req = urllib.request.Request('http://localhost:3000/v1/models', method='GET')
    req.add_header('Content-Type', 'application/json')
    
    print("Connecting to: http://localhost:3000/v1/models")
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"Status: {response.status}")
        print(f"Response: {response.read().decode('utf-8')[:200]}...")
        print("[PASS] Server is running and responding")
except Exception as e:
    print(f"[FAIL] Error: {e}")
    print("\nPossible causes:")
    print("  - Server not running on localhost:3000")
    print("  - Wrong port")
    print("  - Server crashed")

# Test 2: Simple chat completion (no image)
print("\n" + "=" * 70)
print("[TEST 2] Simple chat completion (no image)...")
print("-" * 70)

try:
    data = {
        "model": "NCSOFT/VARCO-VISION-2.0-1.7B-OCR",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50
    }
    
    req = urllib.request.Request(
        'http://localhost:3000/v1/chat/completions',
        data=json.dumps(data).encode('utf-8'),
        method='POST'
    )
    req.add_header('Content-Type', 'application/json')
    
    print("Sending simple text request...")
    with urllib.request.urlopen(req, timeout=30) as response:
        print(f"Status: {response.status}")
        result = json.loads(response.read().decode('utf-8'))
        print(f"Response: {result.get('choices', [{}])[0].get('message', {}).get('content', 'N/A')[:100]}")
        print("[PASS] Simple chat completion works")
except Exception as e:
    print(f"[FAIL] Error: {e}")

# Test 3: OCR with small image
print("\n" + "=" * 70)
print("[TEST 3] OCR with image...")
print("-" * 70)

import os
import base64

image_path = r"D:\docker\NCSOFTVARCO-VISION-2.0-1.7B-OCR\test_ocr.png"

if not os.path.exists(image_path):
    print(f"[SKIP] Image not found: {image_path}")
else:
    try:
        with open(image_path, "rb") as f:
            image_data = f.read()
            base64_image = base64.b64encode(image_data).decode('utf-8')
        
        print(f"Image size: {len(image_data)} bytes")
        print(f"Base64 size: {len(base64_image)} chars")
        
        data = {
            "model": "NCSOFT/VARCO-VISION-2.0-1.7B-OCR",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "<ocr>"},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                        }
                    ]
                }
            ],
            "max_tokens": 4096,
            "temperature": 0.1
        }
        
        json_data = json.dumps(data)
        print(f"Request body size: {len(json_data)} bytes")
        
        req = urllib.request.Request(
            'http://localhost:3000/v1/chat/completions',
            data=json_data.encode('utf-8'),
            method='POST'
        )
        req.add_header('Content-Type', 'application/json')
        
        print("\nSending OCR request (this may take 10-30 seconds)...")
        import time
        start = time.time()
        
        with urllib.request.urlopen(req, timeout=120) as response:
            elapsed = time.time() - start
            print(f"Status: {response.status}")
            print(f"Response time: {elapsed:.2f}s")
            
            result = json.loads(response.read().decode('utf-8'))
            content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            print(f"\nOCR Result (first 500 chars):")
            print(content[:500])
            print("[PASS] OCR with image works")
    
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        import traceback
        traceback.print_exc()

print("\n" + "=" * 70)
print("Diagnostic Complete")
print("=" * 70)
