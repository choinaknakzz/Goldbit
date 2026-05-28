import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}
