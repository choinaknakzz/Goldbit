# Goldbit Automation Lab

Goldbit Automation Lab은 SOXL 단일 종목 매매 후보를 매일 17:00 KST에 생성하고, Telegram 승인 후 Toss Securities OpenAPI로 실제 주문을 요청하기 위한 CLI + Telegram Bot + Scheduler 프로젝트입니다.

v1은 개인용 단일 프로세스 자동화만 다룹니다. 웹 UI, 대시보드, 다중 사용자, AI 분석, 뉴스 분석, 백테스트, MOCK_MODE는 포함하지 않습니다.

## v1 기능 범위

- SOXL 매매 후보 생성
- SQLite/Prisma 기반 후보, 주문 실행 결과, 앱 로그 저장
- Telegram inline button 승인/취소
- 승인 후 `placeOrder()` 호출
- 매일 17:00 Asia/Seoul 스케줄 실행
- 매일 05:30 Asia/Seoul 체결 주문 기반 Trade/T값 동기화
- 5분 간격 미확정 주문 접수 재조회와 만료 후보 정리
- 공유 Toss 토큰의 단독 발급 및 만료 전 갱신
- 최근 거래일 종가 자동 수집 및 Toss 보유 수량/평단 대사
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

TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_APP_KEY=
TOSS_APP_SECRET=
TOSS_ACCESS_TOKEN=
TOSS_REFRESH_TOKEN=
TOSS_ACCOUNT_ID=
TOSS_TOKEN_CACHE_PATH=D:\Goldbit Automation Lab\.cache\toss-token.json

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

`npm run candidate`는 기존 Goldbit의 Today Action Plan 상태(`GOLDBIT_STATE_DB_PATH`)를 읽고 매수·매도 후보를 Telegram으로 전송합니다. `npm run plan`도 같은 명령입니다. Telegram에서는 후보별 승인 대신 `전체 승인` 버튼 하나로 plan 전체를 승인하며, 승인 시 Toss 실제 매수가능금액이 계획 매수액보다 부족하면 주문을 시작하지 않고 경고합니다. 잔액 검사를 통과하면 후보가 plan 순서대로 하나씩 주문됩니다. 모든 주문 시도가 끝나면 성공/실패 건수와 각 주문의 수량, 가격, 실패 사유를 Telegram으로 요약합니다.

SOXL 현재 정보 Telegram 전송:

```powershell
npm run soxl
```

체결 주문을 Goldbit Trade/T값에 수동 동기화:

```powershell
npm run sync:trades
```

`npm run sync:trades`는 Toss 최근 10일 체결을 미국 거래일별로 오래된 순서부터 읽고, Goldbit state의 `trades`와 `tEvents`를 중복 없이 갱신합니다. 같은 주문의 체결 수량이 증가하면 증가분만 추가하고 해당 거래일 T 이벤트를 전체 체결 기준으로 다시 계산합니다. 수수료는 주문/체결 조회의 실제 체결 수수료(`execution.commission`)를 우선 사용하며, 사후 확정된 수수료는 Trade 이후 현금 흐름과 현재 전략 현금에도 반영합니다. 값이 없으면 Toss `/api/v1/commissions`의 US 수수료율로 계산하고, 수수료율 조회 실패 시 Goldbit state의 `feeRatePercent`를 사용합니다. 매도 체결 수량이 Goldbit state의 현재 보유수량보다 크면 음수 보유가 생기지 않도록 해당 체결은 스킵하고 로그에 남깁니다.

전량 매도 체결로 보유수량이 0이 되면 `FULL_SELL_CYCLE_CLOSE` T 이벤트를 적용합니다. 이 이벤트는 T값을 0으로 만들고, 현재 cycle을 `cycleArchives`에 저장한 뒤 새 cycle 상태로 초기화합니다. 이후 Telegram에서 `/capital 금액`을 입력해야 다음 cycle이 시작되며 20분할과 최신 수수료율 설정은 유지됩니다.

Bot만 실행:

```powershell
npm run bot
```

Bot 실행 중에는 Telegram에서 `/soxl` 또는 `/status`를 보내 현재 SOXL 가격, 보유수량, 평균단가, 평가금액, USD 매수가능금액, 최근 미국 거래일 기준 주문/체결 내역을 받을 수 있습니다. 주문 조회는 KST 기준 최근 10일을 넓게 가져온 뒤 각 주문/체결 시각을 뉴욕 날짜로 정규화해 가장 최근 거래일 묶음만 표시합니다.

개발 실행, Bot + Scheduler 동시 실행:

```powershell
npm run dev
```

Scheduler는 미국장이 열린 거래일에만 05:30 KST 체결 동기화와 17:00 KST Today Action Plan 전송을 실행합니다. 두 작업 전에 Yahoo Finance 최근 일봉으로 SOXL 종가를 갱신합니다. 5분 유지보수 작업은 미확정 `SUBMITTED` 주문의 접수 상태를 다시 조회하고 만료된 후보를 정리합니다. 승인 전에는 주문을 실행하지 않습니다.

Automation Lab은 Toss 액세스 토큰의 유일한 발급 주체입니다. 시작 시와 5분 간격으로 공유 캐시 토큰의 남은 수명을 확인하고, 10분 이하일 때만 새 토큰을 발급합니다. `D:\Goldbit` 웹 앱은 같은 `TOSS_TOKEN_CACHE_PATH`를 읽어 시세 조회에만 사용하며 토큰을 발급하지 않습니다.

리버스 첫날 MOC는 Toss Open API가 `MARKET + CLS` 조합을 지원하지 않으므로 자동 후보를 만들지 않습니다. Telegram 계획의 수동 MOC 안내에 따라 Toss 앱에서 주문합니다. 리버스 활성일 LOC 후보는 최근 유효 종가 5개가 모두 준비된 경우에만 생성됩니다.

운영 실행:

```powershell
npm run build
npm run start
```

## Windows PC 자동 실행

봇과 스케줄러를 항상 띄워두려면 먼저 빌드한 뒤 Windows 작업 스케줄러에 등록합니다.

```powershell
cd "D:\Goldbit Automation Lab"
npm run build
npm run service:install
```

등록된 작업 이름은 `GoldbitAutomationLab`입니다. Windows 로그인 시 자동 시작되고, 숨김 PowerShell 프로세스에서 Node를 직접 실행해 CMD 창을 띄우지 않습니다. 프로세스가 종료되면 1분 간격으로 재시작을 시도합니다. 추가로 5분마다 watchdog 트리거가 같은 작업을 다시 시작하려고 시도합니다. 이미 실행 중이면 새 인스턴스는 무시되고, 서비스가 죽어 `Ready` 상태로 남아 있으면 최대 5분 안에 다시 올라옵니다. 로그는 `automation-service.log`에 저장됩니다.

작업 스케줄러 등록을 해제하려면 아래 명령을 실행합니다.

```powershell
npm run service:uninstall
```

임시 실행이 필요할 때는 기존처럼 `npm run dev` 또는 `npm run start`를 사용할 수 있습니다.

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

## 실제 Toss Securities API 연결 파일

- `src/toss/client.ts`: 공통 base URL, OAuth Bearer 인증 헤더, 계좌 헤더, 에러 파싱
- `src/toss/auth.ts`: `POST /oauth2/token` Client Credentials 토큰 발급
- `src/toss/account.ts`: `GET /api/v1/accounts`, `GET /api/v1/buying-power`, `GET /api/v1/orders`
- `src/toss/portfolio.ts`: `GET /api/v1/holdings`
- `src/toss/price.ts`: `GET /api/v1/prices`
- `src/toss/order.ts`: `POST /api/v1/orders`

## 공식 문서 확인 필요 항목

- 토스증권 OpenAPI 공식 JSON 변경 여부
- `TOSS_ACCOUNT_ID`를 수동 지정할 경우 `GET /api/v1/accounts`의 `accountSeq` 값과 일치하는지
- SOXL LOC 주문 시 `LIMIT + CLS` 조합의 운영 가능 시간
- 주문 수량은 공식 문서상 정수 문자열만 가능하므로 소수점 후보 수량을 어떻게 정수화할지
- Toss 주문/시장 API 스키마 변경 여부

## 아직 TODO인 부분

- 리버스 전략 규칙을 사용자가 최종 정리한 뒤 세부 수량·T 변화식을 확정
- 실주문 전 최소 주문 금액, 가격 괴리율, 장시간 검증 같은 추가 guardrail 검토

## 주의사항

승인 전에는 주문을 실행하지 않습니다. 이미 실행, 만료, 취소된 후보는 다시 실행하지 않습니다. v1은 SOXL만 허용합니다. Toss API endpoint는 공식 OpenAPI JSON 기준으로 연결했습니다. LOC는 공식 예시의 `LIMIT + CLS` 조합으로 요청합니다.
## Toss API Token Sharing

Goldbit shares its Toss API token cache with the market analysis workspace.

- Shared token cache path: `D:\Goldbit Automation Lab\.cache\toss-token.json`
- The cache path is configured with `TOSS_TOKEN_CACHE_PATH`.
- Token refresh uses a lock directory next to the cache file to avoid concurrent token issuance.
- Goldbit keeps SOXL automation responsibilities; the market analysis workspace can use the shared token for broader portfolio reads.
