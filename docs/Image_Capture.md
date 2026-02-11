``` txt

[Start]
   ↓
[현재 화면 판별]
   │
   ├─ screen_key 생성
   │
   ↓
[좌표 캐시 조회]
   │
   ├─ (있음) ───────────────┐
   │                        │
   └─ (없음)                │
        ↓                   │
   [전체/대영역 캡처]        │
        ↓                   │
   [Vision LLM 버튼 탐색]    │
        ↓                   │
   [bbox 좌표 저장] ─────────┘
        ↓
[ROI 캡처]
   ↓
[ROI 검증 (Vision LLM)]
   │
   ├─ 성공
   │     ↓
   │   [클릭]
   │     ↓
   │   [좌표 업데이트]
   │
   └─ 실패
         ↓
   [전체 탐색으로 복귀]

```

전체 화면 판별
- screen_key (화면 식별 키)
- element_key ("확인", "저장" 같은 버튼 이름)
- bbox_norm: 좌표를 화면 크기 대비 비율로 저장
	- `x_norm = x / W`, `y_norm = y / H`, `w_norm = w / W`, `h_norm = h / H`
- anchor_hint (선택):  화면 타이틀 텍스트, URL path
	- 화면 제목
	- 창크기

``` json
//예시
{
  "screen_key": "approval_popup",
  "element_key": "confirm_button",
  "viewport": { "W": 1920, "H": 1080, "dpr": 1.0, "zoom": 1.0 },
  "bbox_norm": { "x": 0.83, "y": 0.91, "w": 0.11, "h": 0.06 },
  "anchor": { "type": "text", "value": "결재 요청", "bbox_norm": { "x": 0.40, "y": 0.10, "w": 0.20, "h": 0.05 } },
  "signature": { "label": "확인", "role": "button" },
  "confidence": 0.92,
  "last_seen_at": "2026-02-10T10:00:00+09:00"
}

```


전체/대영역 캡처
	- 이미지 리사이즈
	- 이미지 그레이 변환


성공 판정(Reward) 규칙
- 클릭 후 상태 변화(URL/타이틀/모달 닫힘)

### 재사용 방법
1. 먼저 작은 비용으로 **앵커를 찾음** (앵커는 보통 화면 상단에 있어 ROI도 작게 가능)
2. 앵커 bbox를 얻으면, 저장된 offset으로 버튼 ROI 위치 복원
3. ROI 캡처 후 버튼 검증 → 클릭
4. confidence(이동평균) 한 번은 잘 맞고, 다음은 살짝 틀리고, 그 다음은 완전 틀릴 수도 있음
	1. 이동평균
	2. TTL




---


# 예제를 알아보자
