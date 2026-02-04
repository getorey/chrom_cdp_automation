#!/usr/bin/env python3
"""
OmniParser 테스트 - HTTP API 직접 호출 (Base64 인코딩)
"""

import base64
import json
import requests
import sys
import time

def image_to_base64(image_path):
    """이미지 파일을 base64로 인코딩"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def test_omniparser(image_path: str):
    """OmniParser API 테스트"""
    
    print(f"📷 Loading image: {image_path}")
    base64_image = image_to_base64(image_path)
    print(f"   Base64 encoded (length: {len(base64_image)})")
    
    # API 호출
    url = "http://192.168.40.167:7861/gradio_api/call/process"
    
    # Gradio 형식으로 데이터 준비
    payload = {
        "data": [
            {"url": f"data:image/png;base64,{base64_image}"},  # base64 URL 형식
            0.05,  # box_threshold
            0.1,   # iou_threshold
            True,  # use_paddleocr
            640    # imgsz
        ]
    }
    
    print(f"\n🔗 Sending request to {url}...")
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        event_id = result.get('event_id')
        
        print(f"✅ Request accepted (event_id: {event_id})")
        print("⏳ Waiting for result...")
        
        # 결과 조회 (최대 30초 대기)
        result_url = f"{url}/{event_id}"
        max_attempts = 30
        
        for i in range(max_attempts):
            time.sleep(1)
            result_response = requests.get(result_url, timeout=5)
            
            if result_response.status_code == 200:
                lines = result_response.text.strip().split('\n')
                
                for line in lines:
                    if line.startswith('data: '):
                        data = line[6:]  # 'data: ' 제거
                        
                        if data == 'null':
                            continue
                        
                        try:
                            parsed = json.loads(data)
                            
                            if isinstance(parsed, list) and len(parsed) >= 2:
                                print("\n✅ Result received!")
                                
                                # marked_image = parsed[0]
                                parsed_elements = parsed[1]
                                
                                print("\n📊 Parsed Elements:")
                                try:
                                    elements = json.loads(parsed_elements)
                                    print(f"   Found {len(elements)} elements")
                                    
                                    for i, elem in enumerate(elements[:5]):
                                        print(f"\n   Element {i+1}:")
                                        print(f"     - Type: {elem.get('type', 'N/A')}")
                                        print(f"     - Bbox: {elem.get('bbox', 'N/A')}")
                                        print(f"     - Content: {elem.get('content', 'N/A')}")
                                        print(f"     - Confidence: {elem.get('confidence', 'N/A')}")
                                except json.JSONDecodeError:
                                    print(f"   Raw: {parsed_elements[:200]}...")
                                
                                return True
                        except json.JSONDecodeError:
                            pass
                
                if i == max_attempts - 1:
                    print("❌ Timeout waiting for result")
                    return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_omniparser_http.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    success = test_omniparser(image_path)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
