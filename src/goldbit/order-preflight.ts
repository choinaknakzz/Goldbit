export interface BuyOrderAmountInput {
  side: string;
  quantity: number;
  estimatedPrice: number | null;
  estimatedAmount: number | null;
}

const roundMoney = (value: number): number => Number(value.toFixed(2));

export const calculatePlannedBuyAmount = (orders: BuyOrderAmountInput[]): number => {
  const total = orders
    .filter((order) => order.side === "BUY")
    .reduce((sum, order) => {
      const limitAmount =
        order.estimatedPrice !== null && order.estimatedPrice > 0 && order.quantity > 0
          ? order.estimatedPrice * order.quantity
          : order.estimatedAmount ?? 0;
      return sum + Math.max(0, limitAmount);
    }, 0);

  return roundMoney(total);
};

export const evaluateBuyingPower = (
  orders: BuyOrderAmountInput[],
  availableAmount: number
): { sufficient: boolean; requiredAmount: number; availableAmount: number; shortfall: number } => {
  const requiredAmount = calculatePlannedBuyAmount(orders);
  const normalizedAvailableAmount = roundMoney(Math.max(0, availableAmount));
  const shortfall = roundMoney(Math.max(0, requiredAmount - normalizedAvailableAmount));

  return {
    sufficient: shortfall === 0,
    requiredAmount,
    availableAmount: normalizedAvailableAmount,
    shortfall
  };
};
