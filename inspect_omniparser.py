#!/usr/bin/env python3
"""
OmniParser raw response inspector - 실제 응답 형식 확인
"""

import base64
import json
import requests
import time

def inspect_omniparser_response(image_path: str):
    """OmniParser 응답 상세 확인"""
    
    print(f"\n{'='*70}")
    print(f"🔍 OmniParser 원시 응답 분석기")
    print(f"{'='*70}")
    
    # 이미지 로드
    with open(image_path, 'rb') as f:
        base64_image = base64.b64encode(f.read()).decode('utf-8')
    
    # API 호출
    api_url = "http://192.168.40.167:7861"
    call_url = f"{api_url}/gradio_api/call/process"
    
    request_body = {
        "data": [
            {"url": f"data:image/png;base64,{base64_image}"},
            0.05,
            0.1,
            True,
            640
        ]
    }
    
    print(f"\n📤 요청: {call_url}")
    response = requests.post(call_url, json=request_body, timeout=10)
    print(f"📥 응답 상태: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ 오류: {response.text}")
        return
    
    result = response.json()
    event_id = result.get('event_id')
    print(f"✅ Event ID: {event_id}")
    
    # 결과 폴링
    result_url = f"{call_url}/{event_id}"
    print(f"\n⏳ 결과 조회: {result_url}")
    
    for attempt in range(30):
        time.sleep(1)
        
        result_response = requests.get(result_url, timeout=5)
        
        if result_response.status_code == 200:
            result_text = result_response.text
            
            print(f"\n{'='*70}")
            print(f"📄 원시 응답 텍스트 (시도 {attempt + 1}):")
            print(f"{'='*70}")
            print(result_text[:2000])  # 처음 2000자만
            
            if len(result_text) > 2000:
                print(f"\n... ({len(result_text) - 2000} characters more)")
            
            lines = result_text.split('\n')
            
            for line in lines:
                if line.startswith('data: '):
                    data = line[6:]
                    
                    if data == 'null':
                        continue
                    
                    print(f"\n{'='*70}")
                    print(f"🔍 data: 라인 분석:")
                    print(f"{'='*70}")
                    print(f"데이터 타입: {type(data)}")
                    print(f"길이: {len(data)} 문자")
                    print(f"\n처음 500자:")
                    print(data[:500])
                    
                    # JSON 파싱 시도
                    try:
                        parsed = json.loads(data)
                        print(f"\n✅ JSON 파싱 성공!")
                        print(f"타입: {type(parsed)}")
                        
                        if isinstance(parsed, list):
                            print(f"배열 길이: {len(parsed)}")
                            
                            if len(parsed) >= 2:
                                elements_data = parsed[1]
                                print(f"\n[1]번 요소 타입: {type(elements_data)}")
                                print(f"[1]번 요소 미리보기:")
                                if isinstance(elements_data, str):
                                    print(elements_data[:300])
                                else:
                                    print(json.dumps(elements_data, indent=2)[:300])
                                
                                # JSON 파싱 시도
                                try:
                                    if isinstance(elements_data, str):
                                        elements = json.loads(elements_data)
                                        print(f"\n✅ 요소 JSON 파싱 성공!")
                                        print(f"요소 개수: {len(elements)}")
                                        print(f"\n처음 3개 요소:")
                                        for i, elem in enumerate(elements[:3]):
                                            print(f"  [{i}] {json.dumps(elem, ensure_ascii=False)}")
                                except json.JSONDecodeError as e:
                                    print(f"\n❌ JSON 파싱 실패: {e}")
                                    print(f"\n파이썬 dict 형식으로 변환 시도...")
                                    try:
                                        import ast
                                        elements = ast.literal_eval(elements_data)
                                        print(f"✅ Python ast.literal_eval 성공!")
                                        print(f"요소 개수: {len(elements)}")
                                        for i, elem in enumerate(elements[:3]):
                                            print(f"  [{i}] {elem}")
                                    except Exception as e2:
                                        print(f"❌ ast.literal_eval도 실패: {e2}")
                                
                                return
                    except json.JSONDecodeError as e:
                        print(f"\n❌ JSON 파싱 실패: {e}")
                        print(f"\n원시 데이터 (처음 300자):")
                        print(data[:300])
    
    print(f"\n❌ 타임아웃")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("사용법: python inspect_omniparser.py <이미지경로>")
        print("예시: python inspect_omniparser.py web_screenshot.png")
        sys.exit(1)
    
    image_path = sys.argv[1]
    inspect_omniparser_response(image_path)
