#!/usr/bin/env python3
"""
OmniParser Gradio 서버 테스트 스크립트 (간소화 버전)
"""

from gradio_client import Client, handle_file
import sys
import json

# OmniParser 서버 주소
OMNIPARSER_URL = "http://192.168.40.167:7861/"

def test_omniparser(image_path: str):
    """OmniParser 서버에 이미지를 보내어 테스트"""
    
    print(f"🔗 Connecting to OmniParser at {OMNIPARSER_URL}...")
    
    try:
        # Gradio Client 생성 (api_info=False로 설정)
        client = Client(OMNIPARSER_URL, verbose=False)
        print("✅ Connected successfully!")
        
        print(f"📤 Sending image: {image_path}")
        
        # API 호출 - /process 엔드포인트
        result = client.predict(
            image_input=handle_file(image_path),
            box_threshold=0.05,
            iou_threshold=0.1,
            use_paddleocr=True,
            imgsz=640,
            api_name="/process"
        )
        
        print("\n✅ API call successful!")
        print("\n📊 Result:")
        
        # 결과 파싱
        marked_image = result[0]
        parsed_elements_json = result[1]
        
        print(f"\n1. Marked Image:")
        if isinstance(marked_image, dict):
            print(f"   - URL: {marked_image.get('url', 'N/A')}")
            print(f"   - Path: {marked_image.get('path', 'N/A')}")
        else:
            print(f"   - Type: {type(marked_image)}")
            print(f"   - Value: {str(marked_image)[:100]}...")
        
        print(f"\n2. Parsed Elements:")
        try:
            if isinstance(parsed_elements_json, str):
                parsed_elements = json.loads(parsed_elements_json)
            else:
                parsed_elements = parsed_elements_json
                
            if isinstance(parsed_elements, list):
                print(f"   - Found {len(parsed_elements)} elements")
                
                # 첫 3개 요소만 출력
                for i, elem in enumerate(parsed_elements[:3]):
                    print(f"\n   Element {i+1}:")
                    if isinstance(elem, dict):
                        print(f"     - Type: {elem.get('type', 'N/A')}")
                        print(f"     - Bbox: {elem.get('bbox', 'N/A')}")
                        print(f"     - Content: {elem.get('content', 'N/A')}")
                        print(f"     - Confidence: {elem.get('confidence', 'N/A')}")
                    else:
                        print(f"     - {elem}")
            else:
                print(f"   - Raw data: {str(parsed_elements)[:200]}...")
        except Exception as e:
            print(f"   - Error parsing: {e}")
            print(f"   - Raw: {str(parsed_elements_json)[:200]}...")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_omniparser.py <image_path>")
        print("\nExample:")
        print("  python test_omniparser.py web_screenshot.png")
        sys.exit(1)
    
    image_path = sys.argv[1]
    success = test_omniparser(image_path)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
