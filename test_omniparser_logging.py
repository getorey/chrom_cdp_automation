#!/usr/bin/env python3
"""
OmniParser 로그 테스트 - 콘솔 출력 확인
"""

import base64
import json
import requests
import time

def test_omniparser_with_logging(image_path: str, target_text: str = None):
    """OmniParser 테스트 with 상세 로그"""
    
    print(f"\n{'='*60}")
    print(f"🧪 OmniParser 로그 테스트")
    print(f"{'='*60}")
    
    # 이미지 로드
    print(f"\n📷 이미지 로드: {image_path}")
    with open(image_path, 'rb') as f:
        base64_image = base64.b64encode(f.read()).decode('utf-8')
    print(f"   Base64 길이: {len(base64_image)} 문자")
    
    # API 호출
    api_url = "http://192.168.40.167:7861"
    call_url = f"{api_url}/gradio_api/call/process"
    
    print(f"\n{'='*60}")
    print(f"📤 STEP 1: API 요청")
    print(f"{'='*60}")
    print(f"URL: {call_url}")
    print(f"Method: POST")
    
    request_body = {
        "data": [
            {"url": f"data:image/png;base64,{base64_image}"},
            0.05,
            0.1,
            True,
            640
        ]
    }
    
    print(f"\n요청 본문:")
    print(f"  data[0].url: data:image/png;base64,{base64_image[:50]}...")
    print(f"  data[1] (box_threshold): 0.05")
    print(f"  data[2] (iou_threshold): 0.1")
    print(f"  data[3] (use_paddleocr): True")
    print(f"  data[4] (imgsz): 640")
    
    try:
        response = requests.post(call_url, json=request_body, timeout=10)
        print(f"\n📥 응답 상태: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ 오류: {response.text}")
            return False
        
        result = response.json()
        event_id = result.get('event_id')
        print(f"✅ Event ID: {event_id}")
        
        # 결과 폴링
        print(f"\n{'='*60}")
        print(f"⏳ STEP 2: 결과 폴링")
        print(f"{'='*60}")
        
        result_url = f"{call_url}/{event_id}"
        max_attempts = 30
        
        for attempt in range(max_attempts):
            time.sleep(1)
            
            result_response = requests.get(result_url, timeout=5)
            
            if result_response.status_code == 200:
                result_text = result_response.text
                lines = result_text.split('\n')
                
                for line in lines:
                    if line.startswith('data: '):
                        data = line[6:]
                        
                        if data == 'null':
                            continue
                        
                        try:
                            parsed = json.loads(data)
                            
                            if isinstance(parsed, list) and len(parsed) >= 2:
                                print(f"\n{'='*60}")
                                print(f"✅ STEP 3: 결과 수신 (시도 {attempt + 1})")
                                print(f"{'='*60}")
                                
                                parsed_elements_str = parsed[1]
                                
                                if isinstance(parsed_elements_str, str):
                                    elements = json.loads(parsed_elements_str)
                                else:
                                    elements = parsed_elements_str
                                
                                print(f"\n📊 감지된 요소: {len(elements)}개")
                                
                                if len(elements) == 0:
                                    print(f"⚠️ 요소가 감지되지 않음")
                                    return False
                                
                                print(f"\n상세 요소 목록:")
                                for i, elem in enumerate(elements[:10]):  # 처음 10개만
                                    print(f"\n  [{i}] 타입: {elem.get('type', 'N/A')}")
                                    print(f"      내용: \"{elem.get('content', 'N/A')}\"")
                                    print(f"      신뢰도: {elem.get('confidence', 0):.2f}")
                                    print(f"      bbox: {elem.get('bbox', 'N/A')}")
                                    print(f"      상호작용: {elem.get('interactivity', False)}")
                                
                                if len(elements) > 10:
                                    print(f"\n  ... 외 {len(elements) - 10}개 요소")
                                
                                # 텍스트 필터링
                                if target_text:
                                    print(f"\n{'='*60}")
                                    print(f"🔍 STEP 4: 텍스트 필터링")
                                    print(f"{'='*60}")
                                    print(f"대상 텍스트: \"{target_text}\"")
                                    
                                    target_lower = target_text.lower()
                                    matched = []
                                    
                                    for elem in elements:
                                        content = (elem.get('content') or '').lower()
                                        source = (elem.get('source') or '').lower()
                                        
                                        if target_lower in content or target_lower in source:
                                            matched.append(elem)
                                            print(f"\n  ✅ 매치: \"{elem.get('content')}\"")
                                            print(f"     타입: {elem.get('type')}")
                                            print(f"     신뢰도: {elem.get('confidence', 0):.2f}")
                                    
                                    if not matched:
                                        print(f"\n  ❌ 매치된 요소 없음")
                                        return False
                                    
                                    print(f"\n✅ 총 {len(matched)}개 요소 매치됨")
                                
                                return True
                        except json.JSONDecodeError as e:
                            print(f"   JSON 파싱 오류: {e}")
                            continue
        
        print(f"\n❌ 타임아웃: {max_attempts}번 시도 후 결과 없음")
        return False
        
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("사용법: python test_omniparser_logging.py <이미지경로> [검색텍스트]")
        print("예시: python test_omniparser_logging.py screenshot.png '지구본'")
        sys.exit(1)
    
    image_path = sys.argv[1]
    target_text = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = test_omniparser_with_logging(image_path, target_text)
    sys.exit(0 if success else 1)
