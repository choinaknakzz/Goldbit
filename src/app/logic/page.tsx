import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sections = [
  {
    title: "1. 매일 입력하는 값",
    items: [
      "Today 페이지에서 최신 정규장 종가를 입력하거나 Fetch Latest로 가져온다.",
      "가져온 종가는 날짜별 Close history에 저장된다.",
      "같은 날짜의 종가는 중복 추가하지 않고 기존 값을 업데이트한다.",
      "리버스모드에서는 날짜별 종가 기록 중 최근 5개 평균을 별지점으로 사용한다.",
    ],
  },
  {
    title: "2. 첫 매수",
    items: [
      "T값이 0이고 보유 수량이 0이면 첫 매수 상태다.",
      "첫 매수 LOC 가격은 최신 정규장 종가에 12%를 더한 값으로 계산한다.",
      "첫 매수 예산은 현재 잔금 / 분할 수다.",
      "수량은 매수 예산 / LOC 가격을 계산한 뒤 소수점을 버린 정수로 표시한다.",
    ],
  },
  {
    title: "3. 일반모드 매수",
    items: [
      "SOXL 20분할 별%는 (20 - 2 x T)%다.",
      "SOXL 40분할 별%는 (20 - T)%다.",
      "별지점은 평단 x (1 + 별%)이고, 매수점은 별지점 - 0.01이다.",
      "전반전은 1회 매수금의 절반을 별지점에, 절반을 평단에 LOC 매수한다.",
      "후반전은 1회 매수금 전체를 별지점에 LOC 매수한다.",
    ],
  },
  {
    title: "4. 일반모드 매도",
    items: [
      "보유 수량의 1/4은 별지점에 LOC 매도한다.",
      "나머지 수량은 평단 대비 20% 위 가격에 LIMIT 매도한다.",
      "SOXL LIMIT 매도 가격은 평단 x 1.2다.",
    ],
  },
  {
    title: "5. T값 변화",
    items: [
      "1회 매수는 T + 1이다.",
      "절반 매수는 T + 0.5다.",
      "쿼터 매도는 T x 0.75다.",
      "지정가 매도 후 LOC 1회 매수는 T x 0.25 + 1이다.",
      "지정가 매도 후 LOC 절반 매수는 T x 0.25 + 0.5다.",
    ],
  },
  {
    title: "6. 리버스모드",
    items: [
      "20분할은 T가 19를 초과하면 리버스모드 진입 대상이다.",
      "40분할은 T가 39를 초과하면 리버스모드 진입 대상이다.",
      "리버스 첫날은 매수 없이 MOC 매도만 계획한다.",
      "리버스 활성 상태에서는 최근 5거래일 종가 평균을 별지점으로 사용한다.",
      "리버스 매수금은 현재 잔금 / 4다.",
    ],
  },
  {
    title: "7. 체결 후 업데이트",
    items: [
      "Trades 페이지에서 실제 체결 가격과 수량을 입력한다.",
      "매수 체결은 잔금, 보유 수량, 평단을 갱신한다.",
      "매도 체결은 잔금과 보유 수량을 갱신하고, 수량이 0이면 평단을 0으로 만든다.",
      "선택한 T 이벤트에 따라 T값이 갱신되고 다음 Today 계획에 반영된다.",
    ],
  },
];

export default function LogicPage() {
  return (
    <div className="space-y-6">
      <div>
        <Badge variant="gold">GoldOrbit Logic</Badge>
        <h2 className="mt-3 text-3xl font-bold">주문 로직</h2>
        <p className="mt-1 text-muted-foreground">
          SOXL 무한매수법 V4.0을 Goldbit에서 어떻게 계산하고 표시하는지 정리한 페이지입니다.
        </p>
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item} className="leading-6">
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
