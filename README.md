# Goldbit Automation Lab

Goldbit Automation Lab은 SOXL 단일 종목 매매 후보를 매일 17:00 KST에 생성하고, Telegram 승인 후 Toss Securities OpenAPI로 실제 주문을 요청하기 위한 CLI + Telegram Bot + Scheduler 프로젝트입니다.

v1은 개인용 단일 프로세스 자동화만 다룹니다. 웹 UI, 대시보드, 다중 사용자, AI 분석, 뉴스 분석, 백테스트, MOCK_MODE는 포함하지 않습니다.

## v1 기능 범위

- SOXL 매매 후보 생성
- SQLite/Prisma 기반 후보, 주문 실행 결과, 앱 로그 저장
- Telegram inline button 승인/취소
- 승인 후 `placeOrder()` 호출
- 매일 17:00 Asia/Seoul 스케줄 실행
- 수동 후보 생성 명령

## 설치

```powershell
cd "D:\Goldbit Automation Lab"
npm install
copy .env.example .env
npm run prisma:migrate
```

PowerShell 실행 정책 때문에 `npm.ps1`이 막히면 아래처럼 `npm.cmd`를 사용합니다.

```powershell
npm.cmd install
npm.cmd run prisma:migrate
```

## 환경변수 설정

`.env.example`을 `.env`로 복사한 뒤 값을 채웁니다. `.env`는 Git에 포함하지 않습니다.

```env
NODE_ENV=development
APP_TIMEZONE=Asia/Seoul
TARGET_SYMBOL=SOXL
ORDER_APPROVAL_EXPIRE_MINUTES=60
DATABASE_URL="file:./dev.db"

TOSS_API_BASE_URL=
TOSS_APP_KEY=
TOSS_APP_SECRET=
TOSS_ACCESS_TOKEN=
TOSS_REFRESH_TOKEN=
TOSS_ACCOUNT_ID=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ALLOWED_CHAT_IDS=
```

## Prisma 초기화

```powershell
cd "D:\Goldbit Automation Lab"
npm run prisma:generate
npm run prisma:migrate
```

## Telegram Bot 설정

1. BotFather에서 bot token을 발급합니다.
2. 대상 채팅방 또는 개인 채팅의 chat id를 확인합니다.
3. `.env`의 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`에 입력합니다.
4. 기존 Goldbit처럼 여러 chat id를 제한하려면 `TELEGRAM_ALLOWED_CHAT_IDS`에 쉼표로 구분해 입력합니다. `TELEGRAM_CHAT_ID`가 비어 있으면 첫 번째 allowed chat id로 후보 메시지를 전송합니다.
5. `npm run bot`으로 callback 수신을 확인합니다.

## 실행 방법

수동 후보 생성:

```powershell
cd "D:\Goldbit Automation Lab"
npm run candidate
```

Bot만 실행:

```powershell
npm run bot
```

개발 실행, Bot + Scheduler 동시 실행:

```powershell
npm run dev
```

운영 실행:

```powershell
npm run build
npm run start
```

## Windows PC 24시간 실행

간단한 운영은 PowerShell 창을 열어 둔 상태로 실행합니다.

```powershell
cd "D:\Goldbit Automation Lab"
npm run build
npm run start
```

PC 재부팅 후에는 같은 명령을 다시 실행합니다. 장기 운영 시에는 Windows 작업 스케줄러에 위 명령을 등록하고, 작업 시작 위치를 `D:\Goldbit Automation Lab`로 지정합니다.

## 로그 확인

주요 이벤트는 콘솔과 SQLite `AppLog` 테이블에 저장됩니다.

```powershell
npm run prisma:studio
```

확인 대상:

- application started
- scheduler started
- candidate created
- Telegram candidate message sent
- approval received
- cancel received
- order execution succeeded
- order execution failed

## 실제 Toss Securities API 연결 시 수정할 파일

- `src/toss/client.ts`: 공통 base URL, 인증 헤더, 에러 파싱
- `src/toss/auth.ts`: 토큰 갱신 endpoint와 스키마
- `src/toss/account.ts`: 주문 가능 현금, 최근 체결 내역 조회
- `src/toss/portfolio.ts`: SOXL 보유 수량과 평균 단가 조회
- `src/toss/price.ts`: SOXL 현재가 조회
- `src/toss/order.ts`: LOC 또는 대체 주문 요청 생성과 주문 실행

## 공식 문서 확인 필요 항목

- Toss Securities OpenAPI base URL
- 인증 방식과 토큰 갱신 방식
- 계좌 ID 형식
- 주문 가능 현금 조회 endpoint
- 해외 주식 보유 종목 조회 endpoint
- SOXL 현재가 조회 endpoint
- 최근 주문 또는 체결 내역 조회 endpoint
- 해외 주식 주문 endpoint
- LOC 주문 지원 여부
- LOC 미지원 시 LIMIT 등 대체 주문 타입의 요청 필드
- 주문 응답의 broker order id 필드

## 아직 TODO인 부분

- Toss endpoint와 request/response schema 확정
- Goldbit V4 실제 계산식 이식
- LOC 주문 지원 여부 확인 및 대체 주문 타입 결정
- 실제 Toss 응답을 `OrderExecution.responsePayload`에 원문 JSON으로 저장하는 매핑

## 주의사항

승인 전에는 주문을 실행하지 않습니다. 이미 실행, 만료, 취소된 후보는 다시 실행하지 않습니다. v1은 SOXL만 허용합니다. Toss API endpoint는 임의로 추정하지 않았고, 공식 문서 확인 전까지 주문 API는 실패로 기록됩니다.
